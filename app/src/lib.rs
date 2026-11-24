// lib.rs — URC Console Tauri backend.
// Owns the bulklib COM session, the SysEx reply registry, and the event pump to the UI.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

mod audio_test;
mod bulk;
mod params;

// ---------- reply registry ----------
static REPLIES: Mutex<Option<HashMap<(u16, u8), i32>>> = Mutex::new(None);
static REPLY_CV: Condvar = Condvar::new();
static APP: OnceLock<AppHandle> = OnceLock::new();
// event push channel (drained by the UI via drain_events)
static LATEST_METER: Mutex<Option<serde_json::Value>> = Mutex::new(None);
static PENDING: Mutex<Vec<serde_json::Value>> = Mutex::new(Vec::new());

pub(crate) fn push_event(payload: serde_json::Value) {
    if let Ok(mut q) = PENDING.lock() {
        if q.len() > 400 {
            q.drain(..200);
        }
        q.push(payload.clone());
    }
    // also emit via the Tauri event system when available (harmless if unlistened)
    if let Some(app) = APP.get() {
        use tauri::Emitter;
        app.emit("urc", payload).ok();
    }
}

pub struct AppState {
    conn: std::sync::Arc<Mutex<Option<bulk::BulkSession>>>,
    table: params::ParamTable,
}

#[derive(Serialize, Clone)]
struct ParamJson {
    id: u16,
    name: String,
    min: i32,
    max: i32,
    default: i32,
    channel_indexed: bool,
}

fn emit(payload: serde_json::Value) {
    push_event(payload);
}

fn device_json(rec: &bulk::DeviceRecord) -> serde_json::Value {
    serde_json::json!({
        "connected": true,
        "name": rec.name(),
        "vid": rec.vid(),
        "pid": rec.pid(),
        "sampleRate": rec.sample_rate(),
        "inChannels": rec.in_channels(),
        "outChannels": rec.out_channels(),
    })
}

type ConnArc = std::sync::Arc<Mutex<Option<bulk::BulkSession>>>;

fn try_connect_conn(conn: &ConnArc) -> Result<serde_json::Value, String> {
    bulk::com_init()?;
    let session = bulk::open_session()?;
    let j = device_json(&session.record);
    *conn.lock().unwrap() = Some(session);
    Ok(j)
}

fn disconnect_conn(conn: &ConnArc) {
    if let Some(s) = conn.lock().unwrap().take() {
        s.release_all();
    }
    if let Ok(mut m) = REPLIES.lock() {
        m.take();
    }
}

static RXBUF: Mutex<Vec<u8>> = Mutex::new(Vec::new());

/// Framing assembler: incoming chunks may contain zero, one, or many concatenated
/// SysEx frames (F0 .. F7). Extract complete frames, keep incomplete tail for the
/// next chunk, drop bytes outside frames.
fn on_rx(bytes: &[u8]) {
    let mut buf = RXBUF.lock().unwrap();
    buf.extend_from_slice(bytes);
    loop {
        let start = match buf.iter().position(|&b| b == 0xF0) {
            Some(i) => i,
            None => {
                buf.clear();
                break;
            }
        };
        let end = buf[start + 1..].iter().position(|&b| b == 0xF7).map(|i| start + 1 + i);
        match end {
            Some(e) => {
                let frame: Vec<u8> = buf[start..=e].to_vec();
                buf.drain(..=e);
                if frame.len() >= 8 {
                    parse_and_dispatch(&frame);
                }
            }
            None => {
                buf.drain(..start);
                if buf.len() > 65536 {
                    buf.clear();
                }
                break;
            }
        }
    }
}

static METER_FRAMES: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
static POLL_COUNT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

fn parse_and_dispatch(bytes: &[u8]) {
    if bytes.len() < 8 || bytes[0] != 0xF0 || bytes[bytes.len() - 1] != 0xF7 || bytes[1] != 0x43 || bytes[3] != 0x3E || bytes[4] != 0x14 {
        return;
    }
    // query reply: F0 43 10 3E 14 | 01 04 02 00 | p1 p0 | 00 00 | cc | v1..v5 | F7 (20B)
    if bytes.len() == 20 && bytes[2] == 0x10 && bytes[5] == 0x01 && bytes[6] == 0x04 && bytes[7] == 0x02 && bytes[8] == 0x00 {
        let param = ((bytes[9] as u16) << 7) | bytes[10] as u16;
        let ch = bytes[13];
        let raw = ((bytes[14] as u32) << 28)
            | ((bytes[15] as u32) << 21)
            | ((bytes[16] as u32) << 14)
            | ((bytes[17] as u32) << 7)
            | (bytes[18] as u32);
        let value = raw as i32;
        if let Ok(mut m) = REPLIES.lock() {
            m.get_or_insert_with(HashMap::new).insert((param, ch), value);
        }
        REPLY_CV.notify_all();
        emit(serde_json::json!({"kind": "reply", "param": param, "ch": ch, "value": value}));
        return;
    }
    // meter push: F0 43 10 3E 14 | 02 03 | <entries x4> F7
    // Frame layout (empirically verified): consecutive (cur, peak) PAIRS — odd entry is
    // the peak of the preceding even entry; GR channels hold cur==peak. 89 half-entries
    // = 44 channels + 1 trailing half.
    if bytes.len() >= 12 && bytes[2] == 0x10 && bytes[5] == 0x02 && bytes[6] == 0x03 {
        let n = METER_FRAMES.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if n % 100 == 0 {
            eprintln!("[diag] meter frames={} len={}", n, bytes.len());
        }
        if n % 10 == 7 {
            let cnt = (bytes.len() - 8) / 4;
            let vals: Vec<String> = (0..cnt)
                .map(|i| {
                    let b = &bytes[8 + i * 4..8 + i * 4 + 4];
                    let cur = (((b[0] as i32 & 0x7F) << 7) | (b[1] as i32 & 0x7F)) - if b[0] & 0x40 != 0 { 0x4000 } else { 0 };
                    format!("{cur}")
                })
                .collect();
            eprintln!("[meterdump] n={cnt} vals=[{}]", vals.join(","));
        }
        // PACKED layout (verified against MemAPI FUN_180023AE0 + FUN_180005940 offset tiling):
        // 89 channels, each 4 bytes = [cur 14-bit signed | peak 14-bit signed]
        let n = (bytes.len() - 8) / 4;
        let dec = |b: &[u8]| -> i32 {
            let v = (((b[0] as i32) & 0x7F) << 7) | ((b[1] as i32) & 0x7F);
            if b[0] & 0x40 != 0 { v - 0x4000 } else { v }
        };
        let mut entries = Vec::with_capacity(n);
        for i in 0..n {
            let cur = dec(&bytes[8 + i * 4..8 + i * 4 + 2]);
            let peak = dec(&bytes[8 + i * 4 + 2..8 + i * 4 + 4]);
            entries.push([cur, peak]);
        }
        emit(serde_json::json!({"kind": "meter", "entries": entries}));
        // keep only the newest meter frame for the UI's pull channel
        if let Ok(mut m) = LATEST_METER.lock() {
            *m = Some(serde_json::json!({"kind": "meter", "entries": entries}));
        }
        return;
    }
    // other device->host (panel notifications etc.): surface raw for analysis
    let hex: Vec<String> = bytes.iter().map(|b| format!("{b:02X}")).collect();
    emit(serde_json::json!({"kind": "raw", "hex": hex.join(" ")}));
}

// ---------- commands ----------
#[tauri::command]
async fn connect(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let conn = state.conn.clone();
    let r = tauri::async_runtime::spawn_blocking(move || try_connect_conn(&conn))
        .await
        .map_err(|e| format!("任务失败: {e}"))?;
    if let Ok(j) = &r {
        emit(j.clone());
    }
    r
}

#[tauri::command]
async fn reconnect(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let conn = state.conn.clone();
    tauri::async_runtime::spawn_blocking(move || {
        disconnect_conn(&conn.clone());
        try_connect_conn(&conn)
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

#[tauri::command]
fn device_info(state: State<AppState>) -> serde_json::Value {
    match state.conn.lock().unwrap().as_ref() {
        Some(s) => device_json(&s.record),
        None => serde_json::json!({"connected": false}),
    }
}

#[tauri::command]
fn list_params(state: State<AppState>) -> Vec<ParamJson> {
    state
        .table
        .defs()
        .iter()
        .map(|d| ParamJson {
            id: d.id,
            name: d.name.clone(),
            min: d.min,
            max: d.max,
            default: d.default,
            channel_indexed: d.channel_indexed,
        })
        .collect()
}

#[tauri::command]
async fn get_param(state: State<'_, AppState>, param_id: u16, ch: u8) -> Result<i32, String> {
    let conn = state.conn.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn.lock().unwrap();
        let conn = guard.as_ref().ok_or("设备未连接")?;
        let msg = bulk::query_msg(param_id, ch);
        bulk::transfer_sync(conn.port, &msg)?;
        // wait for matching reply (sink thread inserts into REPLIES)
        let deadline = std::time::Instant::now() + Duration::from_millis(250);
        let mut guard2 = REPLIES.lock().unwrap();
        loop {
            if let Some(m) = guard2.as_ref() {
                if let Some(v) = m.get(&(param_id, ch)) {
                    return Ok(*v);
                }
            }
            let now = std::time::Instant::now();
            if now >= deadline {
                return Err(format!("参数 {param_id:#x} 无应答"));
            }
            let (g2, _) = REPLY_CV.wait_timeout(guard2, deadline - now).unwrap();
            guard2 = g2;
        }
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

/// Batch capability probe: fire N queries back-to-back, collect replies for a fixed window.
/// Returns map "id:ch" -> value; absent keys = device did not answer (param not applicable).
#[tauri::command]
async fn query_many(state: State<'_, AppState>, queries: Vec<(u16, u8)>, window_ms: Option<u64>) -> Result<HashMap<String, i32>, String> {
    let conn = state.conn.clone();
    tauri::async_runtime::spawn_blocking(move || {
        {
            let guard = conn.lock().unwrap();
            let conn = guard.as_ref().ok_or("设备未连接")?;
            for (id, ch) in &queries {
                // stale value must not leak: drop any previous entry
                if let Ok(mut m) = REPLIES.lock() {
                    if let Some(m) = m.as_mut() {
                        m.remove(&(*id, *ch));
                    }
                }
                bulk::transfer_sync(conn.port, &bulk::query_msg(*id, *ch))?;
                // the device command processor needs a small gap between commands
                std::thread::sleep(Duration::from_millis(3));
            }
        }
        let window = Duration::from_millis(window_ms.unwrap_or(1200));
        let deadline = std::time::Instant::now() + window;
        let mut guard2 = REPLIES.lock().unwrap();
        let mut out: HashMap<String, i32> = HashMap::new();
        loop {
            if let Some(m) = guard2.as_ref() {
                for (id, ch) in &queries {
                    if let Some(v) = m.get(&(*id, *ch)) {
                        out.insert(format!("{id}:{ch}"), *v);
                    }
                }
            }
            if std::time::Instant::now() >= deadline || out.len() >= queries.len() {
                break;
            }
            let remain = deadline.saturating_duration_since(std::time::Instant::now());
            let (g2, _) = REPLY_CV.wait_timeout(guard2, remain).unwrap();
            guard2 = g2;
        }
        Ok(out)
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

#[tauri::command]
async fn set_param(state: State<'_, AppState>, param_id: u16, value: i32, ch: u8) -> Result<(), String> {
    let conn = state.conn.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn.lock().unwrap();
        let conn = guard.as_ref().ok_or("设备未连接")?;
        let msg = bulk::set_msg(param_id, ch, value);
        bulk::transfer_sync(conn.port, &msg)
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

#[tauri::command]
async fn send_raw(state: State<'_, AppState>, hex: String) -> Result<(), String> {
    let bytes: Result<Vec<u8>, _> = hex
        .split(|c: char| c == ' ' || c == ':')
        .filter(|t| !t.is_empty())
        .map(|t| u8::from_str_radix(t, 16).map_err(|e| format!("bad hex: {e}")))
        .collect();
    let bytes = bytes?;
    let conn = state.conn.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let guard = conn.lock().unwrap();
        let conn = guard.as_ref().ok_or("设备未连接")?;
        bulk::transfer_sync(conn.port, &bytes)
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

#[tauri::command]
fn set_title(window: tauri::WebviewWindow, title: String) {
    window.set_title(&title).ok();
}

/// UI pulls pending events (meter frame + replies/raw) at its own cadence.
/// `meter_only` = true 时只 take() LATEST_METER、绝不动 PENDING —— 这是编辑器
/// 子窗降级轮询专用的安全形态:rec-done/device 事件是主窗的口粮,子窗若整包
/// drain 会把它们抢走并永久丢失(主窗录音按钮卡死、设备插拔状态灯失灵)。
#[tauri::command]
fn drain_events(meter_only: Option<bool>) -> serde_json::Value {
    let meter = LATEST_METER.lock().ok().and_then(|mut m| m.take());
    let events: Vec<serde_json::Value> = if meter_only.unwrap_or(false) {
        Vec::new()
    } else {
        PENDING.lock().ok().map(|mut q| std::mem::take(&mut *q)).unwrap_or_default()
    };
    serde_json::json!({ "meter": meter, "events": events })
}

// ---------- scenes ----------
fn scene_dir() -> Result<std::path::PathBuf, String> {
    let base = std::env::var("APPDATA").map_err(|_| "APPDATA 未设置".to_string())?;
    Ok(std::path::PathBuf::from(base).join("URC Console").join("scenes"))
}

#[tauri::command]
fn save_scene(name: String, data: String) -> Result<String, String> {
    let dir = scene_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let path = dir.join(format!("{safe}.json"));
    std::fs::write(&path, &data).map_err(|e| format!("写入失败: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn list_scenes() -> Result<Vec<String>, String> {
    let dir = scene_dir()?;
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            if let Some(stem) = e.path().file_stem() {
                out.push(stem.to_string_lossy().to_string());
            }
        }
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
fn load_scene(name: String) -> Result<String, String> {
    let dir = scene_dir()?;
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let path = dir.join(format!("{safe}.json"));
    std::fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))
}

// ---------- FX editor popup windows ----------
/// Build (or focus) the per-slot editor window for (ch, slot).
fn open_editor_window(app: &tauri::AppHandle, ch: u8, slot: u8) -> Result<String, String> {
    let label = format!("fx-{ch}-{slot}");
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.set_focus();
        return Ok(label);
    }
    let title = format!("Channel {} Slot {} 效果器编辑", ch + 1, slot);
    let win = tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html".into()))
        .title(&title)
        .inner_size(430.0, 620.0)
        .min_inner_size(360.0, 420.0)
        .build()
        .map_err(|e| {
            eprintln!("[diag] open_editor_window({ch},{slot}) failed: {e}");
            format!("创建编辑器窗口失败: {e}")
        })?;
    let _ = win.set_focus();
    eprintln!("[diag] open_editor_window({ch},{slot}) ok label={label}");
    Ok(label)
}

/// Open (or focus) a per-slot FX editor child window. The window loads the same
/// frontend, which detects its label ("fx-{ch}-{slot}") and renders editor mode.
#[tauri::command]
async fn open_fx_editor(app: tauri::AppHandle, ch: u8, slot: u8) -> Result<String, String> {
    open_editor_window(&app, ch, slot)
}

// ---------- entry ----------
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            APP.set(handle).ok();

            let app_state = AppState {
                conn: std::sync::Arc::new(Mutex::new(None)),
                table: params::ParamTable::load(),
            };
            app.manage(app_state);
            app.manage(audio_test::RecState::default());

            // event pump: sink thread -> parse -> UI events
            bulk::set_event_hook(Box::new(|ev| match ev {
                bulk::BulkEvent::Rx(bytes) => on_rx(&bytes),
                bulk::BulkEvent::DeviceChanged => {
                    // device set changed (arrive/remove): surface to UI
                    emit(serde_json::json!({"kind": "device"}));
                }
                bulk::BulkEvent::TransferDone(_) => {}
            }));

            // initial connect (background)
            let h = app.handle().clone();
            std::thread::spawn(move || {
                let state = h.state::<AppState>();
                match try_connect_conn(&state.conn.clone()) {
                    Ok(j) => emit(j),
                    Err(e) => emit(serde_json::json!({"connected": false, "error": e})),
                }
            });

            // meter keep-alive: replicate the official app's startup + poll sequence
            // (captured byte-exact via Frida hook on ysusb_bulklib64 CUsbBulkPort::Transfer):
            // init: 10B poll msg, 0x20-mode msg, 0x30-class param 0xB8 (cc 0..5), 0x139-0x3D,
            //       short cmds 00 03 / 00 70 02, meter request 02 03 32 7F, SET SysUsageState=2, query it
            // loop: F0 43 10 3E 14 00 04 02 F7 at ~16 Hz — each poll yields one meter frame
            let h2 = app.handle().clone();
            std::thread::spawn(move || {
                let hx = |s: &str| -> Vec<u8> {
                    s.split_whitespace().map(|t| u8::from_str_radix(t, 16).unwrap()).collect()
                };
                let init: &[&str] = &[
                    "F0 43 10 3E 14 00 04 02 F7",
                    "F0 43 20 3E 14 01 01 00 00 00 00 03 F7",
                    "F0 43 30 3E 14 01 01 00 01 38 00 00 00 F7",
                    "F0 43 30 3E 14 01 01 00 01 38 00 00 01 F7",
                    "F0 43 30 3E 14 01 01 00 01 38 00 00 02 F7",
                    "F0 43 30 3E 14 01 01 00 01 38 00 00 03 F7",
                    "F0 43 30 3E 14 01 01 00 01 38 00 00 04 F7",
                    "F0 43 30 3E 14 01 01 00 01 38 00 00 05 F7",
                    "F0 43 30 3E 14 01 01 00 01 39 00 00 00 F7",
                    "F0 43 30 3E 14 01 01 00 01 3A 00 00 00 F7",
                    "F0 43 30 3E 14 01 01 00 01 3B 00 00 00 F7",
                    "F0 43 30 3E 14 01 01 00 01 3C 00 00 00 F7",
                    "F0 43 30 3E 14 01 01 00 01 3D 00 00 00 F7",
                    "F0 43 30 3E 14 00 03 F7",
                    "F0 43 30 3E 14 00 70 02 F7",
                    "F0 43 30 3E 14 02 03 32 7F F7",
                    "F0 43 10 3E 14 01 01 00 01 3D 00 00 00 00 00 00 00 02 F7",
                    "F0 43 30 3E 14 01 04 02 00 01 3D 00 00 00 F7",
                ];
                loop {
                    std::thread::sleep(Duration::from_millis(60));
                    let state = h2.state::<AppState>();
                    let guard = state.conn.lock().unwrap();
                    if let Some(conn) = guard.as_ref() {
                        let poll_msg = hx("F0 43 10 3E 14 00 04 02 F7");
                        let n = POLL_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        // run the init sequence once per 512 polls (after any reconnect) or on first poll
                        if n % 512 == 0 {
                            for s in init {
                                let _ = bulk::transfer_sync(conn.port, &hx(s));
                                std::thread::sleep(Duration::from_millis(5));
                            }
                        }
                        let _ = bulk::transfer_sync(conn.port, &poll_msg);
                        if n % 200 == 0 {
                            eprintln!("[diag] polls={} meters={} total", n, METER_FRAMES.load(std::sync::atomic::Ordering::Relaxed));
                        }
                    }
                }
            });

            // dev: auto-open an editor popup for verification (URC_AUTO_EDITOR=1)
            if std::env::var("URC_AUTO_EDITOR").as_deref() == Ok("1") {
                let h3 = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(10));
                    match open_editor_window(&h3, 0, 0) {
                        Ok(l) => eprintln!("[diag] auto editor opened: {l}"),
                        Err(e) => eprintln!("[diag] auto editor failed: {e}"),
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect,
            reconnect,
            device_info,
            list_params,
            get_param,
            set_param,
            query_many,
            send_raw,
            set_title,
            drain_events,
            open_fx_editor,
            audio_test::list_capture_devices,
            audio_test::list_output_devices,
            audio_test::record_start,
            audio_test::record_stop,
            audio_test::play_wav,
            save_scene,
            list_scenes,
            load_scene
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

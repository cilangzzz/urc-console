// audio_test.rs — per-strip recording test: record from a UR22C capture endpoint
// (WASAPI via cpal) to a WAV file with start/stop control, and play a WAV back
// through the UR22C render endpoint. All commands are async/off-main-thread so
// the UI never freezes.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct RecState {
    pub active: Arc<AtomicBool>,
    pub stop: Arc<AtomicBool>,
    pub result: Arc<Mutex<Option<Result<RecResult, String>>>>,
    pub playing: Arc<AtomicBool>,
}

impl Default for RecState {
    fn default() -> Self {
        RecState {
            active: Arc::new(AtomicBool::new(false)),
            stop: Arc::new(AtomicBool::new(false)),
            result: Arc::new(Mutex::new(None)),
            playing: Arc::new(AtomicBool::new(false)),
        }
    }
}

fn is_yamaha_name(n: &str) -> bool {
    let n = n.to_lowercase();
    n.contains("ur") || n.contains("steinberg") || n.contains("yamaha")
}

/// Find a UR22C capture endpoint for a logical source kind:
/// "input" (Input 1/2), "streaming" (监听混音), "voice".
fn find_capture(kind: &str) -> Result<(cpal::Device, String), String> {
    let host = cpal::default_host();
    let mut fallback: Option<(cpal::Device, String)> = None;
    let mut err = String::from("没有找到任何录音设备");
    for d in host.input_devices().map_err(|e| format!("枚举录音设备失败: {e}"))? {
        let name = d.name().unwrap_or_default();
        if !is_yamaha_name(&name) {
            continue;
        }
        let ln = name.to_lowercase();
        let hit = match kind {
            "input" => ln.contains("input"),
            "streaming" => ln.contains("streaming"),
            "voice" => ln.contains("voice"),
            _ => false,
        };
        if hit {
            return Ok((d, name));
        }
        if fallback.is_none() {
            fallback = Some((d, name.clone()));
        }
        err = format!("UR-C 录音端点中未匹配 '{kind}'(可用: {name})");
    }
    fallback.ok_or(err)
}

fn rec_dir() -> Result<PathBuf, String> {
    let base = std::env::var("APPDATA").map_err(|_| "APPDATA 未设置".to_string())?;
    Ok(PathBuf::from(base).join("URC Console").join("rec"))
}

#[derive(serde::Serialize, Clone)]
pub struct RecResult {
    pub path: String,
    pub device: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub seconds: f64,
}

#[tauri::command]
pub fn list_capture_devices() -> Vec<String> {
    let host = cpal::default_host();
    let mut out = Vec::new();
    if let Ok(devs) = host.input_devices() {
        for d in devs {
            if let Ok(n) = d.name() {
                if is_yamaha_name(&n) {
                    out.push(n);
                }
            }
        }
    }
    out
}

/// Start a background recording thread. Stops on record_stop() or when max_seconds elapses.
#[tauri::command]
pub async fn record_start(
    state: tauri::State<'_, RecState>,
    kind: String,
    max_seconds: f64,
) -> Result<String, String> {
    if state.active.swap(true, Ordering::SeqCst) {
        return Err("已有录音正在进行".into());
    }
    *state.result.lock().unwrap() = None;
    state.stop.store(false, Ordering::SeqCst);

    let stop = state.stop.clone();
    let result = state.result.clone();
    let active = state.active.clone();
    let kind2 = kind.clone();

    std::thread::spawn(move || {
        let r = record_run(&kind2, max_seconds, &stop);
        *result.lock().unwrap() = Some(r.clone());
        active.store(false, Ordering::SeqCst);
        // notify the UI (drain_events pull channel)
        match r {
            Ok(rr) => crate::push_event(serde_json::json!({
                "kind": "rec-done", "path": rr.path, "device": rr.device,
                "sampleRate": rr.sample_rate, "channels": rr.channels, "seconds": rr.seconds,
            })),
            Err(e) => crate::push_event(serde_json::json!({"kind": "rec-done", "error": e})),
        }
    });

    Ok(format!("已开始录音({kind})"))
}

#[tauri::command]
pub async fn record_stop(state: tauri::State<'_, RecState>) -> Result<RecResult, String> {
    let stop = state.stop.clone();
    let result = state.result.clone();
    let active = state.active.clone();
    tauri::async_runtime::spawn_blocking(move || {
        stop.store(true, Ordering::SeqCst);
        // wait for the recording thread to finish (max 4s)
        let deadline = Instant::now() + Duration::from_millis(4000);
        while active.load(Ordering::SeqCst) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        match result.lock().unwrap().take() {
            Some(Ok(r)) => Ok(r),
            Some(Err(e)) => Err(e),
            None => Err("没有录音结果(录音未开始?)".into()),
        }
    })
    .await
    .map_err(|e| format!("等待录音线程失败: {e}"))?
}

fn record_run(kind: &str, max_seconds: f64, stop: &AtomicBool) -> Result<RecResult, String> {
    // this runs on a dedicated thread: init COM for WASAPI
    let _ = crate::bulk::com_init();
    let (dev, dev_name) = find_capture(kind)?;
    let supported = dev.default_input_config().map_err(|e| format!("默认配置失败: {e}"))?;
    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels() as usize;
    let sample_format = supported.sample_format();
    let cfg: cpal::StreamConfig = supported.into();

    let dir = rec_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let path = dir.join(format!("test_{kind}_{ts}.wav"));

    let spec = hound::WavSpec {
        channels: channels as u16,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let writer = Arc::new(Mutex::new(Some(
        hound::WavWriter::create(&path, spec).map_err(|e| format!("创建 WAV 失败: {e}"))?,
    )));

    let w = writer.clone();
    let stop_w = Arc::new(AtomicBool::new(false));
    let stop_w2 = stop_w.clone();
    let stop_w_main = stop_w.clone();
    let err_fn = move |e| eprintln!("[rec] stream error: {e}");
    let stream = match sample_format {
        cpal::SampleFormat::F32 => dev.build_input_stream(
            &cfg,
            move |data: &[f32], _| {
                if stop_w.load(Ordering::SeqCst) {
                    return;
                }
                if let Ok(mut g) = w.lock() {
                    if let Some(wr) = g.as_mut() {
                        for s in data {
                            let v = (*s).clamp(-1.0, 1.0) * 32767.0;
                            let _ = wr.write_sample(v as i16);
                        }
                    }
                }
            },
            err_fn,
            None,
        ),
        cpal::SampleFormat::I16 => dev.build_input_stream(
            &cfg,
            move |data: &[i16], _| {
                if stop_w2.load(Ordering::SeqCst) {
                    return;
                }
                if let Ok(mut g) = w.lock() {
                    if let Some(wr) = g.as_mut() {
                        for s in data {
                            let _ = wr.write_sample(*s);
                        }
                    }
                }
            },
            err_fn,
            None,
        ),
        other => return Err(format!("不支持的采样格式: {other:?}")),
    }
    .map_err(|e| format!("打开录音流失败: {e}"))?;

    stream.play().map_err(|e| format!("启动录音失败: {e}"))?;
    let start = Instant::now();
    while !stop.load(Ordering::SeqCst) && start.elapsed().as_secs_f64() < max_seconds {
        std::thread::sleep(Duration::from_millis(50));
    }
    // stop the stream before finalizing the writer
    stop_w_main.store(true, Ordering::SeqCst);
    drop(stream);
    std::thread::sleep(Duration::from_millis(120));
    if let Ok(mut g) = writer.lock() {
        if let Some(wr) = g.take() {
            let _ = wr.finalize();
        }
    }

    Ok(RecResult {
        path: path.to_string_lossy().to_string(),
        device: dev_name,
        sample_rate,
        channels: channels as u16,
        seconds: start.elapsed().as_secs_f64(),
    })
}

#[derive(serde::Serialize)]
pub struct PlayResult {
    pub device: String,
    pub duration_s: f64,
}

#[derive(serde::Serialize)]
pub struct OutputDevices {
    pub devices: Vec<String>,
    pub default: String,
}

#[tauri::command]
pub fn list_output_devices() -> OutputDevices {
    let host = cpal::default_host();
    let mut devices = Vec::new();
    if let Ok(devs) = host.output_devices() {
        for d in devs {
            if let Ok(n) = d.name() {
                if !n.is_empty() {
                    devices.push(n);
                }
            }
        }
    }
    let default = host
        .default_output_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();
    OutputDevices { devices, default }
}

/// Resolve an output device by exact (then substring, case-insensitive) name match;
/// None / empty / unmatched -> the system default output device.
fn find_output(name: Option<&str>) -> Result<(cpal::Device, String), String> {
    let host = cpal::default_host();
    let wanted = match name {
        Some(n) if !n.trim().is_empty() => n.trim().to_string(),
        _ => {
            let d = host.default_output_device().ok_or("没有找到系统默认播放设备")?;
            let dn = d.name().unwrap_or_default();
            return Ok((d, dn));
        }
    };
    let mut fallback: Option<(cpal::Device, String)> = None;
    for d in host.output_devices().map_err(|e| format!("枚举播放设备失败: {e}"))? {
        let dn = d.name().unwrap_or_default();
        if dn == wanted {
            return Ok((d, dn));
        }
        if fallback.is_none() && dn.to_lowercase().contains(&wanted.to_lowercase()) {
            fallback = Some((d, dn));
        }
    }
    fallback.ok_or_else(|| format!("播放设备 '{wanted}' 不存在"))
}

#[tauri::command]
pub async fn play_wav(
    state: tauri::State<'_, RecState>,
    path: String,
    device: Option<String>,
) -> Result<PlayResult, String> {
    if state.playing.swap(true, Ordering::SeqCst) {
        return Err("已有播放正在进行".into());
    }
    let playing = state.playing.clone();
    let r = tauri::async_runtime::spawn_blocking(move || play_inner(&path, device.as_deref()))
        .await
        .map_err(|e| {
            playing.store(false, Ordering::SeqCst);
            format!("播放线程失败: {e}")
        })?;
    playing.store(false, Ordering::SeqCst);
    r
}

fn play_inner(path: &str, device_name: Option<&str>) -> Result<PlayResult, String> {
    // runs on a spawn_blocking worker: init COM for WASAPI
    let _ = crate::bulk::com_init();
    let mut reader = hound::WavReader::open(path).map_err(|e| format!("打开 WAV 失败: {e}"))?;
    let spec = reader.spec();
    let src_rate = spec.sample_rate;
    let src_ch = spec.channels as usize;
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .filter_map(|s| s.ok())
        .map(|s| s as f32 / 32768.0)
        .collect();
    drop(reader);
    let src_frames = samples.len() / src_ch.max(1);

    // playback device: user-selected (default = system default speaker)
    let (dev, dev_name) = find_output(device_name)?;
    let supported = dev.default_output_config().map_err(|e| format!("默认配置失败: {e}"))?;
    let out_rate = supported.sample_rate().0;
    let out_ch = supported.channels() as usize;
    let cfg: cpal::StreamConfig = supported.into();
    // source frames consumed per output frame (naive nearest-neighbour rate match)
    let ratio = src_rate as f64 / out_rate.max(1) as f64;

    let data = Arc::new(samples);
    let pos = Arc::new(Mutex::new(0f64));
    let data2 = data.clone();
    let pos2 = pos.clone();
    let err_fn = move |e| eprintln!("[play] stream error: {e}");

    let stream = dev
        .build_output_stream(
            &cfg,
            move |out: &mut [f32], _| {
                let mut p = pos2.lock().unwrap();
                for frame in out.chunks_mut(out_ch) {
                    let fi = (*p as usize).min(src_frames.saturating_sub(1));
                    for (c, smp) in frame.iter_mut().enumerate() {
                        let idx = fi * src_ch + c.min(src_ch.saturating_sub(1));
                        *smp = if idx < data2.len() { data2[idx] } else { 0.0 };
                    }
                    *p += ratio;
                }
            },
            err_fn,
            None,
        )
        .map_err(|e| format!("打开播放流失败: {e}"))?;

    stream.play().map_err(|e| format!("启动播放失败: {e}"))?;
    // wall time: output frame count = src_frames / ratio, at out_rate
    let wall = (src_frames as f64 / ratio) / out_rate.max(1) as f64;
    std::thread::sleep(Duration::from_secs_f64(wall + 0.15));
    drop(stream);

    Ok(PlayResult { device: dev_name, duration_s: wall })
}

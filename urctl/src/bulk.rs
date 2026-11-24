// bulk.rs — COM client for ysusb_bulklib64.dll ("Yamaha Steinberg USB Bulk Transfer Library")
// Reverse-engineered interface layout (all addresses from static analysis of bulklib, sha256 e59804fe...):
//   CLSID        {909CF5D1-593F-4919-A9EA-9B4E1C0A9D84}   (registered InprocServer32, ThreadingModel=Both)
//   IID_IUsbBulk     {EC3FF018-843A-492D-BEEA-6C4E8C047F2E}  vtable @0x180020fb8, 7 slots
//   IID_IUsbBulkDev  {2A06E957-2589-4AA7-8498-BB6B345AA452}  vtable @0x180020f38, 9 slots
//   IID_IUsbBulkPort {36941B20-05BC-4CFA-A2CC-AB9A6C615D44}  vtable @0x180021078, 7 slots
// The library is a byte-exact bulk pipe: payload framing (Yamaha SysEx command language) is ours.

use std::os::raw::{c_int, c_void};
use std::ptr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

type HRESULT = i32;

pub const S_OK: HRESULT = 0;
const E_NOINTERFACE: HRESULT = 0x8000_4002u32 as i32;
const COINIT_MULTITHREADED: u32 = 0x0;
const CLSCTX_INPROC_SERVER: u32 = 0x1;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct Guid {
    d1: u32,
    d2: u16,
    d3: u16,
    d4: [u8; 8],
}
const fn guid(d1: u32, d2: u16, d3: u16, d4: [u8; 8]) -> Guid {
    Guid { d1, d2, d3, d4 }
}

pub const CLSID_YSUSB_BULK: Guid = guid(0x909C_F5D1, 0x593F, 0x4919, [0xA9, 0xEA, 0x9B, 0x4E, 0x1C, 0x0A, 0x9D, 0x84]);
pub const IID_IUSBBULK: Guid = guid(0xEC3F_F018, 0x843A, 0x492D, [0xBE, 0xEA, 0x6C, 0x4E, 0x8C, 0x04, 0x7F, 0x2E]);
pub const IID_IUSBBULKDEV: Guid = guid(0x2A06_E957, 0x2589, 0x4AA7, [0x84, 0x98, 0xBB, 0x6B, 0x34, 0x5A, 0xA4, 0x52]);
pub const IID_IUSBBULKPORT: Guid = guid(0x3694_1B20, 0x05BC, 0x4CFA, [0xA2, 0xCC, 0xAB, 0x9A, 0x6C, 0x61, 0x5D, 0x44]);
const IID_IUNKNOWN: Guid = guid(0x0000_0000, 0x0000, 0x0000, [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46]);

#[link(name = "ole32")]
extern "system" {
    fn CoInitializeEx(pv: *mut c_void, mode: u32) -> HRESULT;
    fn CoCreateInstance(clsid: *const Guid, outer: *mut c_void, ctx: u32, iid: *const Guid, ppv: *mut *mut c_void) -> HRESULT;
    fn CoTaskMemFree(p: *mut c_void);
    fn CoUninitialize();
}

pub fn now_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

pub fn hexs(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02X}", x)).collect::<Vec<_>>().join(" ")
}

// ---------- DeviceRecord (0x61C bytes; layout from EnumDevices/GetDeviceInfo analysis) ----------
#[repr(C)]
pub struct DeviceRecord {
    pub bytes: [u8; 0x61C],
}
impl DeviceRecord {
    pub fn is_asio_device(&self) -> u32 {
        u32::from_le_bytes(self.bytes[0x00..0x04].try_into().unwrap())
    }
    pub fn sample_rate(&self) -> u32 {
        u32::from_le_bytes(self.bytes[0x04..0x08].try_into().unwrap())
    }
    pub fn in_channels(&self) -> u32 {
        u32::from_le_bytes(self.bytes[0x08..0x0C].try_into().unwrap())
    }
    pub fn out_channels(&self) -> u32 {
        u32::from_le_bytes(self.bytes[0x0C..0x10].try_into().unwrap())
    }
    pub fn vid(&self) -> u16 {
        u16::from_le_bytes(self.bytes[0x10..0x12].try_into().unwrap())
    }
    pub fn pid(&self) -> u16 {
        u16::from_le_bytes(self.bytes[0x12..0x14].try_into().unwrap())
    }
    fn wstr_at(&self, len_off: usize, str_off: usize) -> String {
        let n = (u16::from_le_bytes(self.bytes[len_off..len_off + 2].try_into().unwrap()) as usize).min(256);
        let ws: Vec<u16> = self.bytes[str_off..str_off + 2 * n]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&ws)
    }
    pub fn name(&self) -> String {
        self.wstr_at(0x16, 0x18)
    }
    pub fn serial(&self) -> String {
        self.wstr_at(0x21A - 2, 0x21A)
    }
    pub fn path(&self) -> String {
        self.wstr_at(0x41A, 0x41C)
    }
}
impl Default for DeviceRecord {
    fn default() -> Self {
        DeviceRecord { bytes: [0u8; 0x61C] }
    }
}

// ---------- vtable structs ----------
type FnQi = unsafe extern "system" fn(*mut c_void, *const Guid, *mut *mut c_void) -> HRESULT;
type FnAddRef = unsafe extern "system" fn(*mut c_void) -> u32;
type FnRelease = unsafe extern "system" fn(*mut c_void) -> u32;

#[repr(C)]
pub struct IUsbBulkVt {
    pub qi: FnQi,
    pub addref: FnAddRef,
    pub release: FnRelease,
    pub enum_devices: unsafe extern "system" fn(*mut c_void, *mut EnumResult) -> HRESULT,
    pub open_dev: unsafe extern "system" fn(*mut c_void, c_int, *mut *mut c_void) -> HRESULT,
    pub notify_sink: unsafe extern "system" fn(*mut c_void, *mut c_void, i32) -> HRESULT,
    pub _dtor: usize,
}
#[repr(C)]
pub struct EnumResult {
    pub count: u32,
    pub field4: u32,
    pub list: *mut DeviceRecord,
}

#[repr(C)]
pub struct IUsbBulkDevVt {
    pub qi: FnQi,
    pub addref: FnAddRef,
    pub release: FnRelease,
    pub get_port_count: unsafe extern "system" fn(*mut c_void, *mut u32) -> HRESULT,
    pub get_port: unsafe extern "system" fn(*mut c_void, u32, *mut *mut c_void) -> HRESULT,
    pub command: unsafe extern "system" fn(*mut c_void, u32) -> HRESULT,
    pub get_device_info: unsafe extern "system" fn(*mut c_void, *mut DeviceRecord) -> HRESULT,
    pub notify_sink: unsafe extern "system" fn(*mut c_void, *mut c_void, i32) -> HRESULT,
    pub _dtor: usize,
}

#[repr(C)]
pub struct IUsbBulkPortVt {
    pub qi: FnQi,
    pub addref: FnAddRef,
    pub release: FnRelease,
    pub advise_sink: unsafe extern "system" fn(*mut c_void, u32, *mut c_void) -> HRESULT, // (mask, sink) — order verified in decompile 0x180005980
    pub transfer: unsafe extern "system" fn(*mut c_void, u32, u32, *mut u8, usize) -> HRESULT,
    pub _stub: usize,
    pub _dtor: usize,
}

pub unsafe fn vt<'a, T>(p: *mut c_void) -> &'a T {
    (p as *mut *mut T).read().as_ref().unwrap()
}

// ---------- sink (leak-based; the DLL AddRef/Release is balanced, we never free) ----------
#[repr(C)]
pub struct Sink {
    vt: *const SinkVt,
    count: AtomicU32,
}
#[repr(C)]
pub struct SinkVt {
    qi: FnQi,
    addref: FnAddRef,
    release: FnRelease,
    // slot 3 — the ONLY slot the DLL invokes: OnEvent(this, a1, a2, a3, a4)
    on_event: unsafe extern "system" fn(*mut c_void, usize, usize, usize, usize),
}

unsafe extern "system" fn sink_qi(this: *mut c_void, iid: *const Guid, ppv: *mut *mut c_void) -> HRESULT {
    let g = &*iid;
    if g.d1 == IID_IUNKNOWN.d1 && g.d2 == IID_IUNKNOWN.d2 && g.d3 == IID_IUNKNOWN.d3 && g.d4 == IID_IUNKNOWN.d4 {
        *ppv = this;
        sink_addref(this);
        S_OK
    } else {
        E_NOINTERFACE
    }
}
unsafe extern "system" fn sink_addref(this: *mut c_void) -> u32 {
    let s = &*(this as *const Sink);
    s.count.fetch_add(1, Ordering::Relaxed) + 1
}
unsafe extern "system" fn sink_release(this: *mut c_void) -> u32 {
    let s = &*(this as *const Sink);
    s.count.fetch_sub(1, Ordering::Relaxed) - 1
}
static DEBUG_EVENTS: AtomicU32 = AtomicU32::new(0);

unsafe extern "system" fn sink_on_event(_this: *mut c_void, a1: usize, a2: usize, a3: usize, _a4: usize) {
    if a1 == 1 {
        // device-level event: device set changed or device property changed
        println!("[{} ms] [bulk sink] device-level event (re-enumerate / re-read GetDeviceInfo)", now_ms());
        return;
    }
    // a1 = IUsbBulkPort*, a2 = code
    match a2 {
        1 => {
            // data received: a3 = &{u32 cb; void* data} — packed layout, read unaligned!
            let n = DEBUG_EVENTS.fetch_add(1, Ordering::Relaxed);
            if a3 == 0 {
                println!("[{} ms] [bulk RX] a3=null", now_ms());
                return;
            }
            let base = a3 as *const u8;
            let cb = (base as *const u32).read_unaligned() as usize;
            let cand4 = (base.add(4) as *const usize).read_unaligned();
            let cand8 = (base.add(8) as *const usize).read_unaligned();
            if n < 3 {
                let mut raw = [0u8; 16];
                for (i, b) in raw.iter_mut().enumerate() {
                    *b = base.add(i).read_unaligned();
                }
                println!("[{} ms] [evt dump] a3={a3:#x} raw16={} cb@+0={cb} ptr@+4={cand4:#x} ptr@+8={cand8:#x}", now_ms(), hexs(&raw));
            }
            let datap = if cand4 >= 0x10000 && cand4 <= 0x7FFF_FFFF_FFFF { cand4 } else { cand8 };
            if cb > 0 && cb <= 0x20000 && datap >= 0x10000 {
                let slice = std::slice::from_raw_parts(datap as *const u8, cb);
                println!("[{} ms] [bulk RX {}B] {}", now_ms(), cb, hexs(slice));
            } else {
                println!("[{} ms] [bulk RX] cb={cb} datap={datap:#x} (skipped)", now_ms());
            }
        }
        4 => {
            println!("[{} ms] [bulk sink] transfer complete (success={})", now_ms(), a3);
        }
        other => println!("[{} ms] [bulk sink] port event code={other}", now_ms()),
    }
}

static SINK_VT: SinkVt = SinkVt {
    qi: sink_qi,
    addref: sink_addref,
    release: sink_release,
    on_event: sink_on_event,
};

pub fn leak_sink() -> *mut c_void {
    let s = Box::new(Sink { vt: &SINK_VT, count: AtomicU32::new(1) });
    Box::into_raw(s) as *mut c_void
}

// ---------- session ----------
pub struct BulkSession {
    pub bulk: *mut c_void,
    pub dev: *mut c_void,
    pub ports: Vec<*mut c_void>,
    pub port_count: u32,
    pub record: Box<DeviceRecord>,
}

impl BulkSession {
    pub fn release_all(&self) {
        unsafe {
            for p in &self.ports {
                (vt::<IUsbBulkPortVt>(*p).release)(*p);
            }
            if !self.dev.is_null() {
                (vt::<IUsbBulkDevVt>(self.dev).release)(self.dev);
            }
            if !self.bulk.is_null() {
                (vt::<IUsbBulkVt>(self.bulk).release)(self.bulk);
            }
        }
    }
}

pub fn com_init() -> Result<(), String> {
    unsafe {
        let hr = CoInitializeEx(ptr::null_mut(), COINIT_MULTITHREADED);
        if hr < 0 && hr != (0x80010106u32 as i32) /* RPC_E_CHANGED_MODE: already init'ed elsewhere */ {
            return Err(format!("CoInitializeEx failed: {hr:#010x}"));
        }
        Ok(())
    }
}

pub fn create_bulk() -> Result<*mut c_void, String> {
    unsafe {
        let mut p: *mut c_void = ptr::null_mut();
        let hr = CoCreateInstance(&CLSID_YSUSB_BULK, ptr::null_mut(), CLSCTX_INPROC_SERVER, &IID_IUSBBULK, &mut p);
        if hr < 0 {
            return Err(format!("CoCreateInstance(CLSID_ysusb_bulklib) failed: {hr:#010x} — driver not installed?"));
        }
        Ok(p)
    }
}

pub fn enum_devices(bulk: *mut c_void) -> Result<Vec<Box<DeviceRecord>>, String> {
    unsafe {
        let vt = vt::<IUsbBulkVt>(bulk);
        let mut res = EnumResult { count: 0, field4: 0, list: ptr::null_mut() };
        let mut hr = (vt.enum_devices)(bulk, &mut res);
        // Interpretation guard: if the lib treats count as input capacity, retry with capacity
        if hr < 0 && res.list.is_null() {
            let mut res2 = EnumResult { count: 64, field4: 0, list: ptr::null_mut() };
            hr = (vt.enum_devices)(bulk, &mut res2);
            if hr >= 0 {
                res = res2;
            }
        }
        if hr < 0 {
            return Err(format!("EnumDevices failed: {hr:#010x} (no device present?)"));
        }
        let mut out = Vec::new();
        if !res.list.is_null() && res.count > 0 && res.count < 64 {
            for i in 0..res.count as usize {
                let rec = DeviceRecord { bytes: res.list.offset(i as isize).read().bytes };
                out.push(Box::new(rec));
            }
            CoTaskMemFree(res.list as *mut c_void);
        }
        Ok(out)
    }
}

pub fn open_device(bulk: *mut c_void, index: usize) -> Result<(*mut c_void, Box<DeviceRecord>, u32), String> {
    unsafe {
        let bvt = vt::<IUsbBulkVt>(bulk);
        let mut dev: *mut c_void = ptr::null_mut();
        let hr = (bvt.open_dev)(bulk, index as c_int, &mut dev);
        if hr < 0 {
            return Err(format!("OpenDev({index}) failed: {hr:#010x}"));
        }
        let dvt = vt::<IUsbBulkDevVt>(dev);
        let mut count: u32 = 0;
        let hrc = (dvt.get_port_count)(dev, &mut count);
        let mut rec = DeviceRecord::default();
        let hri = (dvt.get_device_info)(dev, &mut rec as *mut DeviceRecord);
        if hrc < 0 {
            return Err(format!("GetPortCount failed: {hrc:#010x}"));
        }
        if hri < 0 {
            return Err(format!("GetDeviceInfo failed: {hri:#010x}"));
        }
        Ok((dev, Box::new(rec), count))
    }
}

pub fn get_port(dev: *mut c_void, index: u32) -> Result<*mut c_void, String> {
    unsafe {
        let vt = vt::<IUsbBulkDevVt>(dev);
        let mut port: *mut c_void = ptr::null_mut();
        let hr = (vt.get_port)(dev, index, &mut port);
        if hr < 0 {
            return Err(format!("GetPort({index}) failed: {hr:#010x}"));
        }
        Ok(port)
    }
}

pub fn advise_sink(port: *mut c_void, sink: *mut c_void, mask: u32) -> Result<(), String> {
    unsafe {
        let vt = vt::<IUsbBulkPortVt>(port);
        let hr = (vt.advise_sink)(port, mask, sink);
        if hr < 0 {
            return Err(format!("AdviseSink(mask={mask}) failed: {hr:#010x}"));
        }
        Ok(())
    }
}

pub fn transfer_sync(port: *mut c_void, bytes: &[u8]) -> Result<(), String> {
    unsafe {
        let vt = vt::<IUsbBulkPortVt>(port);
        // mode 2 = synchronous write
        let hr = (vt.transfer)(port, 2, bytes.len() as u32, bytes.as_ptr() as *mut u8, 0);
        if hr < 0 {
            return Err(format!("Transfer(sync) failed: {hr:#010x}"));
        }
        Ok(())
    }
}

// ---------- SysEx command builders (protocol verified vs urcontrol/yourc-tools/MemAPI RE) ----------
pub fn query_msg(param: u16, ch: u8) -> Vec<u8> {
    vec![
        0xF0, 0x43, 0x30, 0x3E, 0x14, 0x01, 0x04, 0x02, 0x00,
        ((param >> 7) & 0x7F) as u8, (param & 0x7F) as u8,
        0x00, 0x00, ch, 0xF7,
    ]
}

pub fn set_msg(param: u16, ch: u8, value: i32) -> Vec<u8> {
    let v = value as u32;
    vec![
        0xF0, 0x43, 0x10, 0x3E, 0x14, 0x01, 0x01, 0x00,
        ((param >> 7) & 0x7F) as u8, (param & 0x7F) as u8,
        0x00, 0x00, ch,
        ((v >> 28) & 0x7F) as u8,
        ((v >> 21) & 0x7F) as u8,
        ((v >> 14) & 0x7F) as u8,
        ((v >> 7) & 0x7F) as u8,
        (v & 0x7F) as u8,
        0xF7,
    ]
}

// ---------- high-level commands ----------
pub fn print_records(recs: &[Box<DeviceRecord>]) {
    for (i, r) in recs.iter().enumerate() {
        println!(
            "[{i}] {:04X}:{:04X} \"{}\" sr={} in={}ch out={}ch asio={} serial=\"{}\"\n     path={}",
            r.vid(), r.pid(), r.name(), r.sample_rate(), r.in_channels(), r.out_channels(),
            r.is_asio_device(), r.serial(), r.path()
        );
    }
}

pub fn open_ur22c_session(advise: bool, sink: *mut c_void) -> Result<BulkSession, String> {
    com_init()?;
    let bulk = create_bulk()?;
    let recs = enum_devices(bulk)?;
    if recs.is_empty() {
        return Err("no UR-C devices present".into());
    }
    print_records(&recs);
    let idx = recs
        .iter()
        .position(|r| r.vid() == 0x0499 && (r.pid() == 0x172F || r.name().to_lowercase().contains("ur22c")))
        .or_else(|| recs.iter().position(|r| r.vid() == 0x0499))
        .ok_or("no Yamaha (VID_0499) device found")?;
    let (dev, rec, port_count) = open_device(bulk, idx)?;
    println!(
        "[{} ms] opened device idx={idx}: \"{}\" ({} ports)",
        now_ms(),
        rec.name(),
        port_count
    );
    let mut ports = Vec::new();
    for i in 0..port_count {
        match get_port(dev, i) {
            Ok(p) => {
                ports.push(p);
                if advise {
                    if let Err(e) = advise_sink(p, sink, 5) {
                        println!("[warn] advise port {i}: {e}");
                    } else {
                        println!("[{} ms] port {i}: sink advised (mask=5)", now_ms());
                    }
                }
            }
            Err(e) => println!("[warn] port {i}: {e}"),
        }
    }
    Ok(BulkSession { bulk, dev, ports, port_count, record: rec })
}

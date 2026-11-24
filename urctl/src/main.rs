// urctl - UR22C SysEx transport spike (Phase 0)
// Commands:
//   urctl list                 enumerate all MIDI ports (* = Yamaha/Steinberg match)
//   urctl monitor [filter]     listen on matching MIDI IN ports, dump SysEx live
//   urctl send <out-idx> <hex> send raw bytes to OUT port <idx> (index from `list`)
//   urctl identity [filter]    send universal identity request, capture replies for 4s

use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

mod bulk;

const HINTS: [&str; 6] = ["ur22c", "ur24c", "ur44c", "ur816c", "yamaha", "steinberg"];

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn hexs(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02X}", x)).collect::<Vec<_>>().join(" ")
}

fn parse_hex(s: &str) -> Result<Vec<u8>, String> {
    let compact: String = s.chars().filter(|c| !c.is_whitespace() && *c != ':' && *c != ',' && *c != '-').collect();
    let compact = compact.trim_start_matches("0x").to_string();
    if compact.len() % 2 != 0 {
        return Err("hex string has odd length".into());
    }
    let mut out = Vec::new();
    for i in (0..compact.len()).step_by(2) {
        out.push(u8::from_str_radix(&compact[i..i + 2], 16).map_err(|_| format!("bad hex token near '{}'", &compact[i..i + 2]))?);
    }
    Ok(out)
}

fn hinted(name: &str, filter: Option<&str>) -> bool {
    let n = name.to_lowercase();
    match filter {
        Some(f) => n.contains(&f.to_lowercase()),
        None => HINTS.iter().any(|h| n.contains(h)),
    }
}

fn list_ports() {
    let out = MidiOutput::new("urctl").expect("cannot init MIDI output");
    println!("== MIDI OUT ports ==");
    for (i, p) in out.ports().iter().enumerate() {
        let name = out.port_name(p).unwrap_or_else(|_| "<unnamed>".into());
        println!("  [{i}] {} {}", name, if hinted(&name, None) { "*" } else { "" });
    }
    let inp = MidiInput::new("urctl").expect("cannot init MIDI input");
    println!("== MIDI IN ports ==");
    for (i, p) in inp.ports().iter().enumerate() {
        let name = inp.port_name(p).unwrap_or_else(|_| "<unnamed>".into());
        println!("  [{i}] {} {}", name, if hinted(&name, None) { "*" } else { "" });
    }
    println!("(* = Yamaha/Steinberg match; use that name substring as [filter])");
}

fn open_inputs(filter: Option<&str>) -> (usize, Vec<MidiInputConnection<()>>) {
    let mut conns = Vec::new();
    let mut opened = 0;
    let probe = MidiInput::new("urctl").expect("cannot init MIDI input");
    let ports = probe.ports();
    for (i, p) in ports.iter().enumerate() {
        let name = probe.port_name(p).unwrap_or_else(|_| "<unnamed>".into());
        if !hinted(&name, filter) {
            continue;
        }
        let tag = format!("IN{i}<{name}>");
        let value = tag.clone();
        match MidiInput::new("urctl").unwrap().connect(p, &name, move |stamp, bytes, ()| {
            println!("[{} ms] {value} RX stamp={}: {}", now_ms(), stamp, hexs(bytes));
        }, ()) {
            Ok(c) => {
                println!("[{} ms] listening on {tag}", now_ms());
                opened += 1;
                conns.push(c);
            }
            Err(e) => println!("[!!] cannot open {}: {e}", tag),
        }
    }
    (opened, conns)
}

fn open_outputs(filter: Option<&str>) -> Vec<(usize, String, MidiOutputConnection)> {
    let mut conns = Vec::new();
    let probe = MidiOutput::new("urctl").expect("cannot init MIDI output");
    let ports = probe.ports();
    let matched: Vec<(usize, String)> = ports
        .iter()
        .enumerate()
        .filter_map(|(i, p)| {
            let name = probe.port_name(p).unwrap_or_else(|_| "<unnamed>".into());
            hinted(&name, filter).then(|| (i, name))
        })
        .collect();
    for (i, name) in matched {
        match MidiOutput::new("urctl").unwrap().connect(&ports[i], &name) {
            Ok(c) => {
                println!("[{} ms] opened OUT{i}<{name}>", now_ms());
                conns.push((i, name, c));
            }
            Err(e) => println!("[!!] cannot open OUT{i}<{name}>: {e}"),
        }
    }
    conns
}

fn cmd_monitor(filter: Option<&str>) -> Result<(), String> {
    let (n, _conns) = open_inputs(filter);
    if n == 0 {
        return Err("no matching MIDI IN ports opened (run `urctl list` first)".into());
    }
    println!("monitoring... Ctrl+C to stop");
    loop {
        std::thread::sleep(Duration::from_secs(1));
    }
}

fn cmd_identity(filter: Option<&str>) -> Result<(), String> {
    let (n_in, _in_conns) = open_inputs(filter);
    if n_in == 0 {
        println!("[warn] no input listeners opened; replies will not be visible");
    }
    std::thread::sleep(Duration::from_millis(200));
    // Universal Non-Realtime identity request (broadcast device id 0x7F)
    let id_req = [0xF0u8, 0x7E, 0x7F, 0x06, 0x01, 0xF7];
    let mut outs = open_outputs(filter);
    if outs.is_empty() {
        return Err("no matching MIDI OUT ports to send on".into());
    }
    for (i, name, c) in outs.iter_mut() {
        match c.send(&id_req) {
            Ok(_) => println!("[{} ms] identity request -> OUT{i}<{name}>", now_ms()),
            Err(e) => println!("[!!] send failed OUT{i}<{name}>: {e}"),
        }
    }
    println!("waiting 4s for replies...");
    std::thread::sleep(Duration::from_secs(4));
    Ok(())
}

fn cmd_send(idx: usize, hexstr: &str) -> Result<(), String> {
    let bytes = parse_hex(hexstr)?;
    let out = MidiOutput::new("urctl").unwrap();
    let ports = out.ports();
    let p = ports.get(idx).ok_or(format!("OUT index {idx} out of range (see `urctl list`)"))?;
    let name = out.port_name(p).unwrap_or_default();
    let mut conn = MidiOutput::new("urctl")
        .unwrap()
        .connect(p, &name)
        .map_err(|e| format!("cannot open OUT{idx}<{name}>: {e}"))?;
    conn.send(&bytes).map_err(|e| format!("send failed: {e}"))?;
    println!("[{} ms] sent {}B -> OUT{idx}<{name}>: {}", now_ms(), bytes.len(), hexs(&bytes));
    std::thread::sleep(Duration::from_millis(150));
    Ok(())
}

const USAGE: &str = "\
urctl - UR22C control spike
MIDI (macOS/Linux-class path, inactive on Windows driver):
  urctl list                 enumerate all MIDI ports
  urctl monitor [filter]     listen on matching IN ports, dump SysEx live
  urctl send <out-idx> <hex> send raw bytes to OUT port <idx>
  urctl identity [filter]    send identity request, capture replies for 4s
bulklib COM (Windows official transport):
  urctl bulk-enum            enumerate UR-C devices via ysusb_bulklib64 COM
  urctl bulk-open            open UR22C, print device info + port count
  urctl bulk-query <param> [ch]   send SysEx query via bulk port, print reply (4s)
  urctl bulk-set <param> <value> [ch]  send SysEx set via bulk port
  urctl bulk-monitor [sec]   open all ports, listen for pushes (meters)";

fn cmd_bulk_enum() -> Result<(), String> {
    bulk::com_init()?;
    let b = bulk::create_bulk()?;
    let recs = bulk::enum_devices(b)?;
    if recs.is_empty() {
        println!("(no devices present)");
    } else {
        bulk::print_records(&recs);
    }
    unsafe { (bulk::vt::<bulk::IUsbBulkVt>(b).release)(b); }
    Ok(())
}

fn cmd_bulk_open() -> Result<(), String> {
    let sink = bulk::leak_sink();
    let s = bulk::open_ur22c_session(false, sink)?;
    println!(
        "port_count={} record: name=\"{}\" sr={} in={} out={}",
        s.port_count, s.record.name(), s.record.sample_rate(), s.record.in_channels(), s.record.out_channels()
    );
    s.release_all();
    Ok(())
}

fn cmd_bulk_query(param: u16, ch: u8) -> Result<(), String> {
    let sink = bulk::leak_sink();
    let s = bulk::open_ur22c_session(true, sink)?;
    let msg = bulk::query_msg(param, ch);
    let port = s.ports.first().copied().ok_or("no ports available")?;
    println!("[{} ms] sending QUERY param={param} ch={ch} on port 0: {}", bulk::now_ms(), bulk::hexs(&msg));
    bulk::transfer_sync(port, &msg)?;
    println!("waiting 4s for reply...");
    std::thread::sleep(Duration::from_secs(4));
    s.release_all();
    Ok(())
}

fn cmd_bulk_set(param: u16, value: i32, ch: u8) -> Result<(), String> {
    let sink = bulk::leak_sink();
    let s = bulk::open_ur22c_session(true, sink)?;
    let msg = bulk::set_msg(param, ch, value);
    let port = s.ports.first().copied().ok_or("no ports available")?;
    println!("[{} ms] sending SET param={param} ch={ch} value={value}: {}", bulk::now_ms(), bulk::hexs(&msg));
    bulk::transfer_sync(port, &msg)?;
    println!("waiting 3s for notifications...");
    std::thread::sleep(Duration::from_secs(3));
    s.release_all();
    Ok(())
}

fn cmd_bulk_monitor(secs: u64) -> Result<(), String> {
    let sink = bulk::leak_sink();
    let s = bulk::open_ur22c_session(true, sink)?;
    println!("bulk monitoring for {secs}s... (device pushes meters/notifications)");
    std::thread::sleep(Duration::from_secs(secs));
    s.release_all();
    Ok(())
}

fn cmd_bulk_send(hexstr: &str, secs: u64) -> Result<(), String> {
    let bytes = parse_hex(hexstr)?;
    let sink = bulk::leak_sink();
    let s = bulk::open_ur22c_session(true, sink)?;
    let port = s.ports.first().copied().ok_or("no ports available")?;
    println!("[{} ms] sending {}B: {}", bulk::now_ms(), bytes.len(), bulk::hexs(&bytes));
    bulk::transfer_sync(port, &bytes)?;
    println!("listening {secs}s...");
    std::thread::sleep(Duration::from_secs(secs));
    s.release_all();
    Ok(())
}

fn run(args: &[String]) -> Result<(), String> {
    let cmd = args.first().map(|s| s.as_str()).unwrap_or("help");
    match cmd {
        "list" => {
            list_ports();
            Ok(())
        }
        "monitor" => cmd_monitor(args.get(1).map(|s| s.as_str())),
        "identity" => cmd_identity(args.get(1).map(|s| s.as_str())),
        "send" => {
            let idx: usize = args
                .get(1)
                .and_then(|s| s.parse().ok())
                .ok_or("usage: urctl send <out-idx> <hexbytes>")?;
            let hexstr = args.get(2).ok_or("usage: urctl send <out-idx> <hexbytes>")?;
            cmd_send(idx, hexstr)
        }
        "bulk-enum" => cmd_bulk_enum(),
        "bulk-open" => cmd_bulk_open(),
        "bulk-query" => {
            let param: u16 = args.get(1).and_then(|s| s.parse().ok()).ok_or("usage: urctl bulk-query <param> [ch]")?;
            let ch: u8 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
            cmd_bulk_query(param, ch)
        }
        "bulk-set" => {
            let param: u16 = args.get(1).and_then(|s| s.parse().ok()).ok_or("usage: urctl bulk-set <param> <value> [ch]")?;
            let value: i32 = args.get(2).and_then(|s| s.parse().ok()).ok_or("usage: urctl bulk-set <param> <value> [ch]")?;
            let ch: u8 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);
            cmd_bulk_set(param, value, ch)
        }
        "bulk-monitor" => {
            let secs: u64 = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(15);
            cmd_bulk_monitor(secs)
        }
        "bulk-send" => {
            let hexstr = args.get(1).ok_or("usage: urctl bulk-send <hex> [wait_secs]")?;
            let secs: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(6);
            cmd_bulk_send(hexstr, secs)
        }
        _ => {
            println!("{USAGE}");
            Ok(())
        }
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Err(e) = run(&args) {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}

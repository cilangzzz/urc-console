// params.rs — 361-parameter registry parsed from the extracted MemAPI_UR22C table.
// Line format: " 12 id=0x00c par=0xffff sz=0x0101 attr=0x0000 f=['0x1','0x0','0x138','0x2','0x7f','0x0','0x67','0x0'] p28=... name=ChSendMixBus1Level @0x..."
// f[4]=max, f[5]=min (two's complement), f[6]=default. f[0]!=0 => channel-indexed (cc = input channel).

pub struct ParamDef {
    pub id: u16,
    pub name: String,
    pub max: i32,
    pub min: i32,
    pub default: i32,
    pub channel_indexed: bool,
}

pub struct ParamTable {
    defs: Vec<ParamDef>,
    index: std::collections::HashMap<String, usize>,
}

const RAW: &str = include_str!("paramtable.txt");

impl ParamTable {
    pub fn load() -> ParamTable {
        let mut defs = Vec::new();
        let mut index = std::collections::HashMap::new();
        for line in RAW.lines() {
            let line = line.trim();
            if !line.starts_with(|c: char| c.is_ascii_digit()) {
                continue;
            }
            let id = match find_hex(line, "id=") {
                Some(v) => v as u16,
                None => continue,
            };
            let name = match find_name(line) {
                Some(n) => n,
                None => continue,
            };
            let f = parse_farray(line).unwrap_or([0i64; 8]);
            let max = f[4] as i32;
            let min = f[5] as i32;
            let default = f[6] as i32;
            let channel_indexed = f[0] != 0 && f[0] != 0xffff_ffff;
            index.insert(name.clone(), defs.len());
            defs.push(ParamDef { id, name, max, min, default, channel_indexed });
        }
        ParamTable { defs, index }
    }

    pub fn by_name(&self, name: &str) -> Option<&ParamDef> {
        self.index.get(name).map(|i| &self.defs[*i])
    }

    pub fn by_id(&self, id: u16) -> Option<&ParamDef> {
        self.defs.iter().find(|d| d.id == id)
    }

    pub fn defs(&self) -> &[ParamDef] {
        &self.defs
    }
}

fn find_hex(line: &str, key: &str) -> Option<i64> {
    let p = line.find(key)? + key.len();
    let rest = &line[p..];
    let rest = rest.trim_start_matches("0x");
    let end = rest.find(|c: char| !(c.is_ascii_hexdigit())).unwrap_or(rest.len());
    i64::from_str_radix(&rest[..end], 16).ok()
}

fn find_name(line: &str) -> Option<String> {
    let p = line.find("name=")? + 5;
    let rest = &line[p..];
    let end = rest.find(|c: char| c == ' ' || c == '@').unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

fn parse_farray(line: &str) -> Option<[i64; 8]> {
    let p = line.find("f=['")? + 4;
    let rest = &line[p..];
    let end = rest.find("']")?;
    let mut out = [0i64; 8];
    for (i, tok) in rest[..end].split("', '").take(8).enumerate() {
        let t = tok.trim_start_matches('\'').trim_end_matches('\'');
        let (neg, t) = match t.strip_prefix('-') {
            Some(s) => (true, s),
            None => (false, t),
        };
        let v = i64::from_str_radix(t.trim_start_matches("0x"), 16).unwrap_or(0);
        out[i] = if neg { -v } else { v };
    }
    Some(out)
}

// Level<->dB display mapping (anchors from community docs: 0=-inf, 1=-74dB, 2=-72dB, 103=0dB, 127=+6dB)
pub fn level_to_db(v: i32) -> String {
    if v <= 0 {
        return "-INF".into();
    }
    let db = if v <= 103 {
        -74.0 + (v as f64 - 1.0) * (74.0 / 102.0)
    } else {
        (v as f64 - 103.0) * (6.0 / 24.0)
    };
    format!("{db:+.1}")
}

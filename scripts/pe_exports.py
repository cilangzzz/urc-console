import struct, sys

def parse_exports(path):
    data = open(path, 'rb').read()
    pe_off = struct.unpack_from('<I', data, 0x3c)[0]
    assert data[pe_off:pe_off+4] == b'PE\0\0', 'not PE'
    machine, nsec = struct.unpack_from('<HH', data, pe_off+4)
    opt_size = struct.unpack_from('<H', data, pe_off+20)[0]
    opt_off = pe_off + 24
    magic = struct.unpack_from('<H', data, opt_off)[0]
    if magic == 0x20b:  # PE32+
        dd_off = opt_off + 112
    else:
        dd_off = opt_off + 96
    exp_rva, exp_size = struct.unpack_from('<II', data, dd_off)
    sec_off = opt_off + opt_size
    secs = []
    for i in range(nsec):
        o = sec_off + i*40
        name = data[o:o+8].rstrip(b'\0').decode('ascii', 'replace')
        vsize, vaddr, rsize, raddr = struct.unpack_from('<IIII', data, o+8)
        secs.append((name, vaddr, vsize, raddr, rsize))
    def rva2off(rva):
        for name, vaddr, vsize, raddr, rsize in secs:
            if vaddr <= rva < vaddr + max(vsize, rsize):
                return raddr + (rva - vaddr)
        return None
    out = []
    if exp_rva == 0:
        return out, secs, None
    e = rva2off(exp_rva)
    if e is None:
        return out, secs, 'export dir not mapped'
    _, tstamp, mj, mn, name_rva, ordinal_base, nfuncs, nnames, afuncs, anames, aords = struct.unpack_from('<IIHHIIIIIII', data, e)
    dllname = ''
    no = rva2off(name_rva)
    if no is not None:
        dllname = data[no:data.index(b'\0', no)].decode('ascii', 'replace')
    names = []
    if anames:
        no = rva2off(anames)
        for i in range(nnames):
            srva = struct.unpack_from('<I', data, no + i*4)[0]
            so = rva2off(srva)
            nm = data[so:data.index(b'\0', so)].decode('ascii', 'replace') if so is not None else '?'
            ordv = struct.unpack_from('<H', data, rva2off(aords) + i*2)[0]
            frva = struct.unpack_from('<I', data, rva2off(afuncs) + ordv*4)[0]
            names.append((ordinal_base + ordv, nm, hex(frva)))
    return names, secs, dllname

for p in sys.argv[1:]:
    names, secs, dllname = parse_exports(p)
    print('=== %s  (dll name: %s)  exports: %d' % (p, dllname, len(names)))
    for o, nm, rva in names:
        print('  ord=%-4d rva=%-14s %s' % (o, rva, nm))

#!/usr/bin/env python3
"""
ams-to-paths.py — bake the glyphs the loader needs out of a legacy AMS font.

AMS Chhatrapati is a non-Unicode font: it carries no Devanagari codepoints at
all, only the 95 printable ASCII ones, with Devanagari shapes sitting on them.
Setting the name in it would mean putting `ica/taamaNaI` in the markup, which
stops the page source being the name and shows that string at display size on
any load where the font fails. Extracting the outlines instead keeps the
letterforms and leaves the document alone.

Emits assets/js/ams-glyphs.js — an SVG path and an advance width per character,
in font units, with the em size, so the loader can compose and scale them.

Composition is a plain sum of advances. This font has no `kern` and no `GPOS`,
which was checked before relying on it: with either of those present, laying
the glyphs out by advance alone would drift away from what a browser does.

Usage:  python3 tools/ams-to-paths.py <font.ttf> <out.js>
"""

import struct
import sys

# What the loader draws: the name, plus the alphabet its scramble cycles
# through on the way there. Everything else in the font is left behind.
NEEDED = set('icatmNIgvDe/0123456789'
             'kKgGcCjJTODZNPdQnfbBmyrlvSsh')


def u8(b, o):  return b[o]
def u16(b, o): return struct.unpack('>H', b[o:o + 2])[0]
def i16(b, o): return struct.unpack('>h', b[o:o + 2])[0]
def u32(b, o): return struct.unpack('>I', b[o:o + 4])[0]


def tables(b):
    out = {}
    for i in range(u16(b, 4)):
        o = 12 + 16 * i
        out[b[o:o + 4].decode('latin1')] = (u32(b, o + 8), u32(b, o + 12))
    return out


def cmap_ascii(b, t):
    """ASCII codepoint -> glyph id, from the (3,1) format-4 subtable."""
    off = t['cmap'][0]
    sub = None
    for i in range(u16(b, off + 2)):
        r = off + 4 + 8 * i
        if u16(b, r) == 3 and u16(b, off + u32(b, r + 4)) == 4:
            sub = off + u32(b, r + 4)
    if sub is None:
        raise SystemExit('no format-4 cmap subtable')

    segs = u16(b, sub + 6) // 2
    ends = [u16(b, sub + 14 + 2 * i) for i in range(segs)]
    starts = [u16(b, sub + 16 + segs * 2 + 2 * i) for i in range(segs)]
    deltas = [u16(b, sub + 16 + segs * 4 + 2 * i) for i in range(segs)]
    ro = sub + 16 + segs * 6
    ranges = [u16(b, ro + 2 * i) for i in range(segs)]

    out = {}
    for i in range(segs):
        for c in range(starts[i], min(ends[i], 0xFFFE) + 1):
            if not (0x20 <= c < 0x7F):
                continue
            if ranges[i] == 0:
                g = (c + deltas[i]) & 0xFFFF
            else:
                gi = ro + 2 * i + ranges[i] + 2 * (c - starts[i])
                g = u16(b, gi)
                if g:
                    g = (g + deltas[i]) & 0xFFFF
            if g:
                out[chr(c)] = g
    return out


def advances(b, t):
    n = u16(b, t['hhea'][0] + 34)             # numberOfHMetrics
    base = t['hmtx'][0]
    adv = [u16(b, base + 4 * i) for i in range(n)]
    total = u16(b, t['maxp'][0] + 4)
    return adv + [adv[-1]] * (total - n)      # the tail all share the last one


def loca(b, t, n, long_form):
    o = t['loca'][0]
    if long_form:
        return [u32(b, o + 4 * i) for i in range(n + 1)]
    return [u16(b, o + 2 * i) * 2 for i in range(n + 1)]


def contours(b, off):
    """Points of one simple glyph, as a list of contours of (x, y, on_curve)."""
    nc = i16(b, off)
    if nc < 0:
        return None                            # composite; handled by caller
    if nc == 0:
        return []

    p = off + 10
    ends = [u16(b, p + 2 * i) for i in range(nc)]
    p += 2 * nc
    p += 2 + u16(b, p)                         # skip hinting instructions
    npts = ends[-1] + 1

    flags = []
    while len(flags) < npts:
        f = u8(b, p); p += 1
        flags.append(f)
        if f & 8:                              # REPEAT
            r = u8(b, p); p += 1
            flags.extend([f] * r)
    flags = flags[:npts]

    xs, v = [], 0
    for f in flags:
        if f & 2:                              # X_SHORT
            d = u8(b, p); p += 1
            v += d if f & 16 else -d
        elif not (f & 16):                     # not X_SAME
            v += i16(b, p); p += 2
        xs.append(v)

    ys, v = [], 0
    for f in flags:
        if f & 4:                              # Y_SHORT
            d = u8(b, p); p += 1
            v += d if f & 32 else -d
        elif not (f & 32):                     # not Y_SAME
            v += i16(b, p); p += 2
        ys.append(v)

    out, start = [], 0
    for e in ends:
        out.append([(xs[i], ys[i], bool(flags[i] & 1)) for i in range(start, e + 1)])
        start = e + 1
    return out


def to_path(cs):
    """TrueType quadratic contours -> an SVG path.

    Off-curve points may run consecutively, with an implied on-curve point
    halfway between each pair; that midpoint has to be synthesised or the
    curve cuts corners. A contour can also open on an off-curve point, in
    which case the start is a midpoint too.
    """
    parts = []
    for pts in cs:
        if not pts:
            continue

        first = next((i for i, p in enumerate(pts) if p[2]), None)
        if first is None:                      # every point off-curve
            mx = (pts[0][0] + pts[-1][0]) / 2.0
            my = (pts[0][1] + pts[-1][1]) / 2.0
            start = (mx, my)
            ordered = pts[:]
        else:
            start = (pts[first][0], pts[first][1])
            ordered = pts[first + 1:] + pts[:first + 1]

        d = ['M%s %s' % (num(start[0]), num(start[1]))]
        ctrl = None
        for x, y, on in ordered:
            if on:
                if ctrl is None:
                    d.append('L%s %s' % (num(x), num(y)))
                else:
                    d.append('Q%s %s %s %s' % (num(ctrl[0]), num(ctrl[1]), num(x), num(y)))
                    ctrl = None
            else:
                if ctrl is not None:           # two off-curve in a row
                    mx, my = (ctrl[0] + x) / 2.0, (ctrl[1] + y) / 2.0
                    d.append('Q%s %s %s %s' % (num(ctrl[0]), num(ctrl[1]), num(mx), num(my)))
                ctrl = (x, y)
        if ctrl is not None:
            d.append('Q%s %s %s %s' % (num(ctrl[0]), num(ctrl[1]), num(start[0]), num(start[1])))
        d.append('Z')
        parts.append(''.join(d))
    return ''.join(parts)


def num(v):
    """Whole font units. At em 1000 drawn around 150px, one unit is 0.15px, so
    the decimals cost bytes and buy nothing."""
    return str(int(round(v)))


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]

    b = open(src, 'rb').read()
    t = tables(b)
    for need in ('glyf', 'loca', 'head', 'maxp', 'hhea', 'hmtx', 'cmap'):
        if need not in t:
            raise SystemExit('font is missing the %s table' % need)
    if 'kern' in t or 'GPOS' in t:
        raise SystemExit('this font has kerning; composing by advance alone would drift')

    em = u16(b, t['head'][0] + 18)
    long_loca = i16(b, t['head'][0] + 50) == 1
    n = u16(b, t['maxp'][0] + 4)
    off = loca(b, t, n, long_loca)
    adv = advances(b, t)
    cm = cmap_ascii(b, t)
    glyf = t['glyf'][0]

    out, skipped = {}, []
    for ch in sorted(NEEDED):
        g = cm.get(ch)
        if g is None:
            skipped.append(ch)
            continue
        if off[g] == off[g + 1]:               # blank glyph, e.g. space
            out[ch] = {'d': '', 'a': adv[g], 'b': [0, 0, 0, 0]}
            continue
        cs = contours(b, glyf + off[g])
        if cs is None:
            skipped.append(ch)                 # composite; none needed so far
            continue
        xs = [pt[0] for c in cs for pt in c]
        ys = [pt[1] for c in cs for pt in c]
        # the ink box as well as the advance: these glyphs overhang their
        # advance widths, and a cell sized to the advance leaves the overhang
        # sitting on the syllable next door
        out[ch] = {'d': to_path(cs), 'a': adv[g],
                   'b': [min(xs), max(xs), min(ys), max(ys)]}

    body = ',\n'.join(
        "    %s: { d: '%s', a: %d, b: [%s] }" % (
            js_key(ch), out[ch]['d'], out[ch]['a'],
            ','.join(str(int(round(v))) for v in out[ch]['b']))
        for ch in sorted(out)
    )
    js = HEADER % (src.split('/')[-1], em, body)
    open(dst, 'w', encoding='utf-8').write(js)

    size = len(js)
    print('%d glyphs, em %d, %.1f KB -> %s' % (len(out), em, size / 1024.0, dst))
    if skipped:
        print('skipped (no outline):', ' '.join(skipped))


def js_key(ch):
    return "'%s'" % (ch.replace('\\', '\\\\').replace("'", "\\'"))


HEADER = '''/* ============================================================================
   ams-glyphs.js — GENERATED by tools/ams-to-paths.py from %s. Do not edit.

   AMS Chhatrapati carries no Devanagari codepoints; the shapes sit on ASCII.
   These are the outlines the loader needs, lifted out of the font so the page
   can keep the real name in its markup instead of the keystrokes that would
   produce these shapes.

   `d` is an SVG path in font units with y pointing up, so it wants a negative
   y scale. `a` is the advance width. `b` is the ink box as [x0, x1, y0, y1] —
   these glyphs overhang their advances, so a cell sized to the advance puts
   the overhang on its neighbour. The font has no kern table and no GPOS, so
   laying glyphs out by advance alone matches what a browser would do.
   ========================================================================= */

window.CGAms = {
  em: %d,
  g: {
%s
  }
};
'''


if __name__ == '__main__':
    main()

// One-off probe: decode public/assets/Warriors_Map.png and print a 60x45
// terrain classification grid so we can reconcile it with world.ts.
const fs = require("fs");
const zlib = require("zlib");

const buf = fs.readFileSync("public/assets/Warriors_Map.png");
// --- parse chunks ---
let off = 8;
const idat = [];
let W = 0, H = 0, depth = 0, ctype = 0;
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString("ascii", off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === "IHDR") {
    W = data.readUInt32BE(0); H = data.readUInt32BE(4);
    depth = data[8]; ctype = data[9];
  } else if (type === "IDAT") idat.push(data);
  off += 12 + len;
  if (type === "IEND") break;
}
if (depth !== 8 || ctype !== 6) { console.error(`unexpected depth=${depth} ctype=${ctype}`); process.exit(1); }
const raw = zlib.inflateSync(Buffer.concat(idat));
const bpp = 4, stride = W * bpp;
const px = Buffer.alloc(H * stride);
// --- unfilter ---
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
for (let y = 0; y < H; y++) {
  const f = raw[y * (stride + 1)];
  const src = y * (stride + 1) + 1, dst = y * stride;
  for (let x = 0; x < stride; x++) {
    const rx = raw[src + x];
    const left = x >= bpp ? px[dst + x - bpp] : 0;
    const up = y > 0 ? px[dst - stride + x] : 0;
    const ul = y > 0 && x >= bpp ? px[dst - stride + x - bpp] : 0;
    let v;
    switch (f) {
      case 0: v = rx; break;
      case 1: v = rx + left; break;
      case 2: v = rx + up; break;
      case 3: v = rx + ((left + up) >> 1); break;
      default: v = rx + paeth(left, up, ul);
    }
    px[dst + x] = v & 0xff;
  }
}
// --- classify ---
const CLS = [
  ["~", (r, g, b) => b > r + 24 && b > g + 4],                                  // water
  ["T", (r, g, b) => g > r + 6 && g > b + 12 && g < 110],                        // dark pine/marsh green
  ["f", (r, g, b) => g > r + 4 && g >= b && g >= 60 && g < 160],                 // forest green
  [".", (r, g, b) => g > b + 20 && g >= r && g >= 150],                          // light moor grass
  ["m", (r, g, b) => r > g && g > b && r > 90 && r - b > 30],                    // mud/dirt brown
  ["s", (r, g, b) => r > 150 && g > 130 && b > 90 && r - b < 90 && r >= g && g > b], // sand/rock tan
  ["#", (r, g, b) => Math.abs(r - g) < 18 && Math.abs(g - b) < 18 && r > 70 && r < 210], // gray urban/rock
  ["w", () => true],                                                             // other (white/labels/paths light)
];
const GW = 60, GH = 45;
const cw = W / GW, ch = H / GH;
const rows = [];
for (let gy = 0; gy < GH; gy++) {
  let row = "";
  for (let gx = 0; gx < GW; gx++) {
    const counts = new Array(CLS.length).fill(0);
    const sums = [0, 0, 0]; let n = 0;
    for (let y = Math.floor(gy * ch); y < Math.floor((gy + 1) * ch); y += 2) {
      for (let x = Math.floor(gx * cw); x < Math.floor((gx + 1) * cw); x += 2) {
        const i = (y * W + x) * bpp;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        sums[0] += r; sums[1] += g; sums[2] += b; n++;
        for (let c = 0; c < CLS.length; c++) if (CLS[c][1](r, g, b)) { counts[c]++; break; }
      }
    }
    let best = 0;
    for (let c = 1; c < CLS.length; c++) if (counts[c] > counts[best]) best = c;
    row += CLS[best][0];
  }
  rows.push(row);
}
console.log(`PNG ${W}x${H} -> grid ${GW}x${GH} (legend: ~ water, T dark pine/marsh, f forest, . moor grass, m mud/dirt, s sand/rock, # gray urban/rock, w other/light)`);
for (const r of rows) console.log(r);

// patch70_draw.cjs — render the full customization surface in drawCat
const fs = require("fs");
const path = "src/game/draw.ts";
let S = fs.readFileSync(path, "utf8");
const R = (needle, replacement, label) => {
  if (S.split(needle).length !== 2) { console.error(`ABORT: ${label} (${S.split(needle).length - 1} hits)`); process.exit(1); }
  S = S.replace(needle, replacement);
  console.log(`ok [${label}]`);
};

// 1) CatSkin gains the extended (all-optional) fields — fully backward compatible
R(
  `export interface CatSkin {
  fur: string;
  furDark: string;
  eye: string;
  chest?: string;
  pattern?: "solid" | "tabby" | "tortie" | "bicolor";
  furLength?: number;
  tail?: "normal" | "short" | "fluffy" | "bob";
  ears?: "normal" | "tall" | "fold";
  size?: number;
  scar?: boolean;
}`,
  `export interface CatSkin {
  fur: string;
  furDark: string;
  eye: string;
  chest?: string;
  pattern?: string; // extended ids fall back to solid rendering
  furLength?: number;
  tail?: string;    // extended ids fall back to normal
  ears?: string;    // extended ids fall back to normal
  size?: number;
  scar?: boolean;
  // --- customization extensions (all optional; old saves unaffected) ---
  eye2?: string;            // heterochromia
  patternIntensity?: number; // 0..1 density of pattern overlays
  markings?: string[];       // white marking ids (catItems MARKING ids)
  scars?: string[];          // scar ids (catItems SCAR ids)
  acc?: Partial<Record<string, string>>; // accessory slot -> item id
  accColor?: string;         // shared accessory tint
}`,
  "CatSkin extended",
);

// 2) extended tail lengths in the tail constants
R(
  `  const tail = skin.tail ?? "normal";
  const tailLen = tail === "short" ? 0.5 : tail === "bob" ? 0.3 : 1;
  const tailW = tail === "fluffy" ? 6.5 : 4.5;`,
  `  const tail = skin.tail ?? "normal";
  const tailLen = tail === "short" ? 0.5 : tail === "bob" ? 0.3 : tail === "long" ? 1.25 : 1;
  const tailW = tail === "fluffy" ? 6.5 : tail === "slim" ? 3.2 : 4.5;`,
  "tail lengths",
);

// 3) fur fluff: chest ruff behind the head for long/fluffy coats
R(
  `  // head (groom pose dips toward the chest to lick it)
  const groomDip = pose === "groom" ? Math.max(0, Math.sin(time * 5.5)) : 0;`,
  `  // fur fluff: a chest ruff for long coats, drawn just before the head
  const fluff = (skin.furLength ?? 1) >= 1.3;
  if (fluff && pose !== "swim") {
    ctx.fillStyle = skin.fur;
    ctx.beginPath();
    const fx = pose === "sit" || pose === "groom" ? 4 : 9;
    const fy = pose === "sit" ? -14 : pose === "sleep" ? -7 : -9;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.15 + i * 0.18);
      ctx.moveTo(fx + Math.cos(a) * 7, fy + Math.sin(a) * 5);
      ctx.lineTo(fx + Math.cos(a) * 10, fy + Math.sin(a) * 8);
    }
    ctx.lineWidth = 3;
    ctx.strokeStyle = skin.fur;
    ctx.stroke();
  }

  // head (groom pose dips toward the chest to lick it)
  const groomDip = pose === "groom" ? Math.max(0, Math.sin(time * 5.5)) : 0;`,
  "chest fluff",
);

// 4) extended ears: rounded + tufted variants on the existing ear triangles
R(
  `  ctx.beginPath();
  ctx.moveTo(headX + 1, headY - 5);
  ctx.lineTo(headX + 3.5 - earDx, headY - earH - 0.5);
  ctx.lineTo(headX + 6 - earDx, headY - 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();`,
  `  ctx.beginPath();
  ctx.moveTo(headX + 1, headY - 5);
  ctx.lineTo(headX + 3.5 - earDx, headY - earH - 0.5);
  ctx.lineTo(headX + 6 - earDx, headY - 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // rounded ear tips + tufts
  if (skin.ears === "rounded") {
    ctx.fillStyle = skin.fur;
    ctx.beginPath();
    ctx.arc(headX - 3 + earDx, headY - earH + 1.5, 2, 0, Math.PI * 2);
    ctx.arc(headX + 3.5 - earDx, headY - earH - 0.5 + 1.5, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (skin.ears === "tufted") {
    ctx.strokeStyle = skin.fur;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(headX - 3 + earDx, headY - earH + 0.5);
    ctx.lineTo(headX - 4.5 + earDx, headY - earH - 3.5);
    ctx.moveTo(headX + 3.5 - earDx, headY - earH - 0.5);
    ctx.lineTo(headX + 4.5 - earDx, headY - earH - 4.5);
    ctx.stroke();
  }`,
  "ear variants",
);

// 5) replace the single legacy scar block with the full multi-scar renderer
R(
  `  // scars
  if (skin.scar) {
    ctx.strokeStyle = "rgba(200, 90, 70, 0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(headX - 2, headY - 5);
    ctx.lineTo(headX + 1.5, headY - 1);
    ctx.stroke();
  }`,
  `  // scars: legacy single scar + the multi-scar customization set
  const scars = new Set(skin.scars ?? []);
  ctx.strokeStyle = "rgba(200, 90, 70, 0.85)";
  ctx.lineWidth = 1;
  if (skin.scar || scars.has("cheek")) {
    ctx.beginPath();
    ctx.moveTo(headX - 2, headY - 5);
    ctx.lineTo(headX + 1.5, headY - 1);
    ctx.stroke();
  }
  if (scars.has("brow")) {
    ctx.beginPath();
    ctx.moveTo(headX + 0.5, headY - 3.5);
    ctx.lineTo(headX + 3.5, headY - 2.5);
    ctx.stroke();
  }
  if (scars.has("nose")) {
    ctx.beginPath();
    ctx.moveTo(headX + 4.5, headY + 1.5);
    ctx.lineTo(headX + 6, headY + 0.5);
    ctx.stroke();
  }
  if (scars.has("ear")) {
    // a notch cut into the far ear edge
    ctx.strokeStyle = "rgba(40, 25, 15, 0.9)";
    ctx.beginPath();
    ctx.moveTo(headX - 2.2 + earDx, headY - earH + 3);
    ctx.lineTo(headX - 1 + earDx, headY - earH + 4.5);
    ctx.stroke();
    ctx.strokeStyle = "rgba(200, 90, 70, 0.85)";
  }
  if (scars.has("shoulder")) {
    ctx.beginPath();
    ctx.moveTo(-6, pose === "sit" ? -10 : -8);
    ctx.lineTo(-2, pose === "sit" ? -6 : -5);
    ctx.stroke();
  }
  if (scars.has("side")) {
    ctx.beginPath();
    ctx.moveTo(-2, pose === "sit" ? -6 : -5);
    ctx.lineTo(2, pose === "sit" ? -8 : -7);
    ctx.stroke();
  }`,
  "multi scars",
);

// 6) heterochromia: the two eye loops gain per-eye colors
R(
  `  ctx.fillStyle = skin.eye;
  for (const ex of [headX + 3.5, headX + 0.6]) {
    ctx.beginPath();
    ctx.ellipse(ex, headY - 0.5, 1.6, 1.6 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }`,
  `  const eyeColors = skin.eye2 ? [skin.eye2, skin.eye] : [skin.eye, skin.eye];
  ctx.fillStyle = eyeColors[1]; // far eye
  ctx.beginPath();
  ctx.ellipse(headX + 0.6, headY - 0.5, 1.6, 1.6 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = eyeColors[0]; // near eye
  ctx.beginPath();
  ctx.ellipse(headX + 3.5, headY - 0.5, 1.6, 1.6 * blink, 0, 0, Math.PI * 2);
  ctx.fill();`,
  "heterochromia",
);

// 7) after whiskers (before the shake droplets): white markings + accessories
R(
  `  // shake droplets: spray off the head/back in an arc, fading over the pose`,
  `  // --- white markings (multi-select, pose-anchored) ---
  const mk = new Set(skin.markings ?? []);
  if (mk.size > 0 && pose !== "swim") {
    ctx.fillStyle = "rgba(244, 238, 226, 0.95)";
    // muzzle / chin / nose / blaze on the head
    if (mk.has("muzzle")) { ctx.beginPath(); ctx.ellipse(headX + 4, headY + 2.5, 3.2, 2.4, 0, 0, Math.PI * 2); ctx.fill(); }
    if (mk.has("chin")) { ctx.beginPath(); ctx.ellipse(headX + 4.5, headY + 4.2, 2, 1.2, 0, 0, Math.PI * 2); ctx.fill(); }
    if (mk.has("nose")) { ctx.fillRect(headX + 3.4, headY - 2.5, 1.2, 3.4); }
    if (mk.has("blaze")) { ctx.beginPath(); ctx.moveTo(headX + 3, headY - 6); ctx.lineTo(headX + 5.4, headY - 6); ctx.lineTo(headX + 4.4, headY - 0.5); ctx.lineTo(headX + 3.6, headY - 0.5); ctx.closePath(); ctx.fill(); }
    // chest / belly / throat on the body
    if (mk.has("chest")) { ctx.beginPath(); ctx.ellipse(6, pose === "sit" ? -4 : -4.5, 4.5, pose === "sit" ? 7 : 4.5, 0, 0, Math.PI * 2); ctx.fill(); }
    if (mk.has("belly") && pose !== "sleep") { ctx.beginPath(); ctx.ellipse(0, pose === "sit" ? -2 : -3.2, 6.5, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
    // paws / socks on the visible legs
    if (mk.has("paws")) {
      ctx.fillRect(-9, pose === "walk" ? -1 : -2, 4, 3);
      ctx.fillRect(5, pose === "walk" ? -1 : -2, 4, 3);
    }
    if (mk.has("socks")) {
      ctx.fillRect(-9, pose === "walk" ? -4 : -3.4, 4, pose === "walk" ? 6 : 5);
      ctx.fillRect(5, pose === "walk" ? -4 : -3.4, 4, pose === "walk" ? 6 : 5);
    }
    // tail tip: a pale cap over the tail end
    if (mk.has("tailtip")) {
      ctx.strokeStyle = "rgba(244, 238, 226, 0.95)";
      ctx.lineWidth = tailW;
      ctx.beginPath();
      if (pose === "sit") { ctx.moveTo(-14 * tailLen, -2); ctx.quadraticCurveTo(-16 * tailLen, 1, -16 * tailLen, 6); }
      else if (pose === "sleep") { ctx.moveTo(-11, 0); ctx.quadraticCurveTo(-12 * tailLen, 2, -12 * tailLen, 4); }
      else { ctx.moveTo(-19 * tailLen, -16 + tailSway * 0.4); ctx.quadraticCurveTo(-22 * tailLen, -18 + tailSway * 0.7, -24 * tailLen, -20 + tailSway); }
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    // pale ear rims
    if (mk.has("ears")) {
      ctx.strokeStyle = "rgba(244, 238, 226, 0.95)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(headX - 4.5 + earDx, headY - 4.5); ctx.lineTo(headX - 3 + earDx, headY - earH + 1);
      ctx.moveTo(headX + 2 - earDx, headY - 5.6); ctx.lineTo(headX + 3.5 - earDx, headY - earH - 1);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // --- accessories (one per slot, tinted by accColor) ---
  const tint = skin.accColor ?? "#d95f5f";
  const acc = skin.acc ?? {};
  // NECK: collars / ribbons / garlands — around the neck base
  if (acc.neck) {
    const nx = pose === "sit" || pose === "groom" ? 4 : 8;
    const ny = pose === "sit" ? -10 : pose === "sleep" ? -6 : -7.5;
    ctx.strokeStyle = acc.neck.startsWith("collar-") || acc.neck === "bell" || acc.neck === "tag"
      ? ({ "collar-red": "#c23a3a", "collar-blue": "#3a6ac2", "collar-brown": "#7a5230", "collar-yellow": "#d9b23a", "collar-purple": "#8a4ac2", "collar-green": "#4a8a5c", "bell": "#c23a3a", "tag": "#3a6ac2" } as Record<string, string>)[acc.neck] ?? "#c23a3a"
      : tint;
    ctx.lineWidth = acc.neck === "ribbon" || acc.neck === "garland" ? 2 : 2.6;
    ctx.beginPath();
    ctx.ellipse(nx, ny, 5.6, 2.2, 0, 0, Math.PI);
    ctx.stroke();
    ctx.lineWidth = 1;
    if (acc.neck === "bell") { ctx.fillStyle = "#d9b23a"; ctx.beginPath(); ctx.arc(nx + 4.5, ny + 1.5, 1.4, 0, Math.PI * 2); ctx.fill(); }
    if (acc.neck === "tag") { ctx.fillStyle = "#d9d9d9"; ctx.beginPath(); ctx.arc(nx + 4.5, ny + 1.5, 1.3, 0, Math.PI * 2); ctx.fill(); }
    if (acc.neck === "ribbon") { ctx.fillStyle = tint; ctx.beginPath(); ctx.moveTo(nx + 5, ny); ctx.lineTo(nx + 9, ny - 2.5); ctx.lineTo(nx + 9, ny + 2.5); ctx.closePath(); ctx.fill(); }
    if (acc.neck === "garland") { ctx.fillStyle = tint; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(nx - 3 + i * 2.6, ny + 1.8 - (i % 2), 1.2, 0, Math.PI * 2); ctx.fill(); } }
    if (acc.neck === "scarf") { ctx.fillStyle = "#7fae4e"; ctx.beginPath(); ctx.ellipse(nx, ny + 1, 6.2, 2.8, 0, 0, Math.PI); ctx.fill(); }
  }
  // HEAD: flowers/crowns/leaves — on top of the head, between the ears
  if (acc.head) {
    const hx = pose === "sit" || pose === "groom" ? 4 : 9;
    const hy = pose === "sit" ? -22 : pose === "sleep" ? -14 : -17;
    if (acc.head === "flower" || acc.head === "flowercrown" || acc.head === "berries") {
      ctx.fillStyle = tint;
      const petals = acc.head === "flowercrown" ? 4 : 3;
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(hx + (acc.head === "flowercrown" ? -6 + i * 4 : 5.5) + Math.cos(a) * 1.6, hy + Math.sin(a) * 1.6, acc.head === "flowercrown" ? 1.3 : 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#f4e9d8";
      ctx.beginPath();
      ctx.arc(hx + (acc.head === "flowercrown" ? 0 : 5.5), hy, 1, 0, Math.PI * 2);
      ctx.fill();
      if (acc.head === "berries") { ctx.fillStyle = "#a33a5c"; ctx.beginPath(); ctx.arc(hx + 3, hy + 2.5, 1, 0, Math.PI * 2); ctx.arc(hx + 1.6, hy + 3.2, 0.8, 0, Math.PI * 2); ctx.fill(); }
    }
    if (acc.head === "leaf" || acc.head === "leafcrown") {
      ctx.fillStyle = "#6a9a4a";
      if (acc.head === "leafcrown") {
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(hx - 7 + i * 3.4, hy + (i % 2) * 1.2, 2.2, 1, i * 0.5, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.beginPath(); ctx.ellipse(hx + 5.5, hy + 1, 3, 1.3, -0.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (acc.head === "feather") {
      ctx.strokeStyle = "#c9c2b8";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(hx - 2, hy + 3);
      ctx.quadraticCurveTo(hx - 5, hy - 4, hx - 3, hy - 7);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }
  // EAR: tiny items at the near ear base
  if (acc.ear) {
    const ex = headX + 3.5 - earDx;
    const ey = headY - earH - 1;
    if (acc.ear === "flower") { ctx.fillStyle = tint; for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; ctx.beginPath(); ctx.arc(ex + Math.cos(a) * 1.4, ey + Math.sin(a) * 1.4, 1, 0, Math.PI * 2); ctx.fill(); } }
    if (acc.ear === "feather") { ctx.strokeStyle = "#c9c2b8"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ex, ey + 3); ctx.quadraticCurveTo(ex + 2, ey - 3, ex + 1, ey - 6); ctx.stroke(); ctx.lineWidth = 1; }
    if (acc.ear === "leaf") { ctx.fillStyle = "#6a9a4a"; ctx.beginPath(); ctx.ellipse(ex + 1, ey + 1, 2.2, 1, -0.6, 0, Math.PI * 2); ctx.fill(); }
  }
  // BODY: bundles on the back
  if (acc.body) {
    const bx = -2;
    const by = pose === "sit" ? -14 : pose === "sleep" ? -9 : pose === "crouch" ? -9 : -12;
    if (acc.body === "herbs") {
      ctx.strokeStyle = "#6a9a4a";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { ctx.moveTo(bx + i * 2 - 2, by + 2); ctx.lineTo(bx + i * 2 - 1, by - 4 + i); }
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    if (acc.body === "leaves") { ctx.fillStyle = "#6a9a4a"; ctx.beginPath(); ctx.ellipse(bx, by - 1, 3.4, 1.8, 0.3, 0, Math.PI * 2); ctx.fill(); }
    if (acc.body === "moss") { ctx.fillStyle = "#7a9a5a"; ctx.beginPath(); ctx.ellipse(bx, by, 4.5, 2, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  // PAW: bands / wraps on the near leg
  if (acc.paw) {
    const px2 = 7;
    const py2 = pose === "walk" ? -3 : -2;
    if (acc.paw === "wrap") {
      ctx.fillStyle = "#e8e6e0";
      ctx.fillRect(px2 - 1, py2 - 3, 4.4, 5);
      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(px2 - 1, py2 - 1.4, 4.4, 0.8);
    } else {
      ctx.fillStyle = acc.paw === "band-red" ? tint : "#3a6ac2";
      ctx.fillRect(px2 - 1, py2 - 1.4, 4.4, 2);
    }
  }
  // TAIL: band / ribbon / tuft at the tail base
  if (acc.tail) {
    const tx = pose === "sit" ? -12 : -13;
    const ty = pose === "sit" ? -1 : pose === "sleep" ? 0 : -11;
    if (acc.tail === "band") {
      ctx.strokeStyle = tint;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 2);
      ctx.lineTo(tx - 1, ty + 3);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    if (acc.tail === "ribbon") {
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.moveTo(tx, ty); ctx.lineTo(tx - 4, ty - 4); ctx.lineTo(tx - 5.5, ty - 0.5); ctx.closePath();
      ctx.moveTo(tx, ty); ctx.lineTo(tx - 4.5, ty + 3.5); ctx.lineTo(tx - 6.5, ty + 1); ctx.closePath();
      ctx.fill();
    }
    if (acc.tail === "tuft") {
      ctx.strokeStyle = "#c9c2b8";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(tx, ty); ctx.lineTo(tx - 3, ty - 5); ctx.moveTo(tx, ty); ctx.lineTo(tx - 5, ty - 3); ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  // shake droplets: spray off the head/back in an arc, fading over the pose`,
  "markings + accessories",
);

// 8) extended patterns: add renderers for the new ids (before the legacy checks)
R(
  `  // pattern: tabby stripes
  if (skin.pattern === "tabby") {`,
  `  // extended patterns: mackerel / spotted / speckled / calico / masked / colorpoint
  const pi = skin.patternIntensity ?? 0.7;
  if (skin.pattern === "mackerel") {
    ctx.strokeStyle = skin.furDark;
    ctx.lineWidth = 1.1;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 2.6 - 0.5, pose === "sit" ? -16 : -12.5);
      ctx.lineTo(i * 2.6 + 0.5, pose === "sit" ? -7 : -5.5);
      ctx.stroke();
    }
  } else if (skin.pattern === "spotted") {
    ctx.fillStyle = skin.furDark;
    const spots: [number, number, number][] = [
      [-7, -6, 1.8], [-3, -10, 2], [1, -7, 1.7], [5, -10, 1.9], [8, -6, 1.5], [-5, -3, 1.6], [3, -4, 1.7],
    ];
    for (const [sx, sy, sr] of spots) {
      ctx.beginPath();
      ctx.ellipse(sx, sy, sr, sr * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (skin.pattern === "speckled") {
    ctx.fillStyle = skin.furDark;
    ctx.globalAlpha = 0.5 * pi + 0.25;
    for (let i = 0; i < 22; i++) {
      const a = i * 2.399;
      const rx = Math.cos(a) * (2 + (i % 5) * 2.2);
      const ry = (pose === "sit" ? -10 : -8) + Math.sin(a) * 3.4;
      ctx.beginPath();
      ctx.arc(rx, ry, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (skin.pattern === "calico") {
    ctx.fillStyle = "#f4ede0";
    ctx.beginPath();
    ctx.ellipse(3, pose === "sit" ? -6 : -5, 8, pose === "sit" ? 6 : 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.furDark;
    ctx.beginPath();
    ctx.ellipse(-5, pose === "sit" ? -11 : -9, 4, 3, 0.4, 0, Math.PI * 2);
    ctx.ellipse(1, pose === "sit" ? -14 : -11.5, 3, 2.4, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin.pattern === "masked") {
    ctx.fillStyle = skin.furDark;
    const mh = pose === "sit" ? -16 : pose === "sleep" ? -8 : -11;
    ctx.beginPath();
    ctx.ellipse((pose === "sit" || pose === "groom" ? 4 : 9) + 3, mh + 1, 5.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin.pattern === "colorpoint") {
    ctx.fillStyle = skin.furDark;
    // dark ears, legs, tail (points)
    ctx.beginPath();
    ctx.moveTo(headX - 5.5 + earDx, headY - 3.5);
    ctx.lineTo(headX - 3 + earDx, headY - earH);
    ctx.lineTo(headX - 0.5 + earDx, headY - 4.5);
    ctx.closePath();
    ctx.moveTo(headX + 1, headY - 5);
    ctx.lineTo(headX + 3.5 - earDx, headY - earH - 0.5);
    ctx.lineTo(headX + 6 - earDx, headY - 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-9, pose === "walk" ? -1.5 : -2, 4, 3.5);
    ctx.fillRect(5, pose === "walk" ? -1.5 : -2, 4, 3.5);
  }

  // pattern: tabby stripes
  if (skin.pattern === "tabby") {`,
  "extended patterns",
);

fs.writeFileSync(path, S);
console.log("patch70 complete");

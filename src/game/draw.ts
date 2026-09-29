// WarriorCatsRPG — programmatic sprite drawing: parameterized cats (patterns,
// tails, ears, poses), prey animals, and camp/territory props.

export interface CatSkin {
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
}

export type CatPose = "walk" | "sit" | "sleep" | "crouch" | "groom" | "stretch" | "swim" | "shake";

/** Dark outline derived from the pelt so sprites read crisply on any ground. */
function outlineOf(skin: CatSkin): string {
  const n = (skin.furDark || skin.fur).replace("#", "");
  if (n.length !== 6) return "#241a10";
  const f = 0.45;
  const r = Math.round(parseInt(n.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(n.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(n.slice(4, 6), 16) * f);
  return `#${[r, g, b].map((v) => Math.max(12, v).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Draw a cat. (x, y) is the ground point under the cat's center.
 * `facing` mirrors the sprite; `phase` desyncs walk cycles between cats.
 */
export function drawCat(
  ctx: CanvasRenderingContext2D,
  skin: CatSkin,
  x: number,
  y: number,
  facing: 1 | -1,
  pose: CatPose,
  time: number,
  phase: number,
  /** optional body-level acting overlay: yawn/alert/tail-flick/blink/talk */
  fx?: { yawn?: boolean; alert?: boolean; tailFlick?: boolean; talking?: boolean; wet?: boolean; hop?: number },
) {
  const size = skin.size ?? 1;
  const moving = pose === "walk" || pose === "swim";
  const SWIM_BOB_HZ = 1.1;
  const bob = moving
    ? Math.abs(Math.sin(time * 9 + phase)) * 1.6
    : Math.sin(time * 1.4 + phase) * 0.5;
  const swimBob = pose === "swim"
    ? Math.sin(time * SWIM_BOB_HZ * Math.PI * 2 + phase) * 1.8
    : 0;
  // shake-off pose: rapid left/right wobble + visible droplet spray (rain,
  // snow, or the post-swim shake). 0.55s long, matching the engine's poseUntil.
  const shakeT = pose === "shake" ? time * 26 : 0;
  const shakeWobble = pose === "shake" ? Math.sin(shakeT) * 1.6 : 0;
  const shakeWet = pose === "shake" && (fx?.wet ?? false);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 15 * size, 6 * size, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * size, size);
  ctx.translate(0, -bob + swimBob);
  if (pose === "swim") {
    // lower body: only head/back/tail stay above the surface line
    ctx.translate(0, 2.5);
  }
  if (pose === "shake") {
    ctx.translate(shakeWobble, 0);
  }

  // breathing: gentle body scale while idle (never while moving)
  const breath = pose === "walk" || pose === "swim" || pose === "shake"
    ? 1
    : 1 + Math.sin(time * 1.8 + phase) * 0.012;
  // hop squash & stretch: compress at takeoff/landing, extend mid-air
  const hopP = fx?.hop ?? -1;
  const squash = hopP >= 0 ? 1 + Math.sin(hopP * Math.PI) * 0.08 : 1;
  const tail = skin.tail ?? "normal";
  const tailLen = tail === "short" ? 0.5 : tail === "bob" ? 0.3 : tail === "long" ? 1.25 : 1;
  const tailW = tail === "fluffy" ? 6.5 : tail === "slim" ? 3.2 : 4.5;

  // tail
  const tailSway = Math.sin(time * 2.2 + phase) * (moving ? 5 : 9);
  ctx.strokeStyle = skin.furDark;
  ctx.lineWidth = tailW;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (pose === "swim") {
    // tail streams behind, tip above the wake
    ctx.moveTo(-11, -5);
    ctx.quadraticCurveTo(-20 * tailLen, -6 + tailSway * 0.3, -26 * tailLen, -12 + tailSway * 0.6);
  } else if (pose === "sit") {
    ctx.moveTo(-10, -4);
    ctx.quadraticCurveTo(-18 * tailLen, -2, -16 * tailLen, 6);
  } else if (pose === "sleep") {
    ctx.moveTo(-8, -3);
    ctx.quadraticCurveTo(-14, 0, -12 * tailLen, 4);
  } else {
    ctx.moveTo(-11, -8);
    ctx.quadraticCurveTo(-20 * tailLen, -14 + tailSway * 0.4, -24 * tailLen, -20 + tailSway);
  }
  ctx.stroke();

  // body
  ctx.fillStyle = skin.fur;
  ctx.strokeStyle = outlineOf(skin);
  ctx.lineWidth = 1;
  ctx.save();
  ctx.scale(breath / Math.sqrt(squash), breath * Math.sqrt(squash)); // subtle volume change, same silhouette
  ctx.beginPath();
  if (pose === "swim") {
    // stretched, streamlined body half-submerged
    ctx.ellipse(0, -4.5, 12.5, 5.2, 0, 0, Math.PI * 2);
  } else if (pose === "sit") {
    ctx.ellipse(0, -7, 9, 11, 0, 0, Math.PI * 2);
  } else if (pose === "sleep") {
    ctx.ellipse(0, -5, 12, 6, 0, 0, Math.PI * 2);
  } else if (pose === "crouch") {
    ctx.ellipse(0, -5, 12.5, 5.5, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(0, -7, 11.5, 7, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // extended patterns: mackerel / spotted / speckled / calico / masked / colorpoint
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
    // dark ears (computed locally — head coords are declared later), legs
    const cpx = pose === "sit" || pose === "groom" ? 4 : 9;
    const cpy = pose === "swim" ? -8 : pose === "sit" ? -16 : pose === "sleep" ? -8 : pose === "crouch" ? -8 : -11;
    const eH = skin.ears === "tall" ? 12 : skin.ears === "fold" ? 6 : 10;
    ctx.beginPath();
    ctx.moveTo(cpx - 5.5, cpy - 3.5);
    ctx.lineTo(cpx - 3, cpy - eH);
    ctx.lineTo(cpx - 0.5, cpy - 4.5);
    ctx.closePath();
    ctx.moveTo(cpx + 1, cpy - 5);
    ctx.lineTo(cpx + 3.5, cpy - eH - 0.5);
    ctx.lineTo(cpx + 6, cpy - 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-9, pose === "walk" ? -1.5 : -2, 4, 3.5);
    ctx.fillRect(5, pose === "walk" ? -1.5 : -2, 4, 3.5);
  }

  // pattern: tabby stripes
  if (skin.pattern === "tabby") {
    ctx.strokeStyle = skin.furDark;
    ctx.lineWidth = 1.6;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 3.6 - 1, pose === "sit" ? -16 : -12.5);
      ctx.quadraticCurveTo(i * 3.6, pose === "sit" ? -12 : -9, i * 3.6 + 1, pose === "sit" ? -7 : -5.5);
      ctx.stroke();
    }
  } else if (skin.pattern === "tortie") {
    ctx.fillStyle = skin.furDark;
    const spots: [number, number, number][] = [
      [-5, -9, 2.6], [2, -11, 3], [6, -6, 2.4], [-1, -5, 2.2], [-7, -4, 2],
    ];
    for (const [sx, sy, sr] of spots) {
      ctx.beginPath();
      ctx.ellipse(sx, sy, sr, sr * 0.75, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (skin.pattern === "bicolor") {
    ctx.fillStyle = skin.furDark;
    ctx.beginPath();
    ctx.ellipse(-2, -11, 8, 4.5, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  // chest
  if (skin.chest && pose !== "sleep") {
    ctx.fillStyle = skin.chest;
    ctx.beginPath();
    ctx.ellipse(6, pose === "sit" ? -4 : -4.5, 4.5, pose === "sit" ? 7 : 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // legs
  if (pose === "swim") {
    // paddling paws just under the surface: quick small strokes
    const paddle = Math.sin(time * SWIM_BOB_HZ * Math.PI * 4 + phase);
    ctx.fillStyle = skin.furDark;
    ctx.fillRect(-9, -3 + paddle * 1.6, 4, 4.5);
    ctx.fillStyle = skin.fur;
    ctx.fillRect(5, -3 - paddle * 1.6, 4, 4.5);
  } else if (pose === "walk") {
    ctx.fillStyle = skin.furDark;
    ctx.fillRect(-9, -4 + Math.sin(time * 9 + phase) * 2.5, 4, 7);
    ctx.fillStyle = skin.fur;
    ctx.fillRect(5, -4 + Math.sin(time * 9 + phase + Math.PI) * 2.5, 4, 7);
  } else if (pose === "crouch") {
    ctx.fillStyle = skin.furDark;
    ctx.fillRect(-9, -3, 4, 6);
    ctx.fillStyle = skin.fur;
    ctx.fillRect(5, -3, 4, 6);
  } else if (pose === "sleep") {
    // tucked paws — small nubs
    ctx.fillStyle = skin.furDark;
    ctx.fillRect(-8, -2, 3, 3);
    ctx.fillRect(5, -2, 3, 3);
  } else {
    ctx.fillStyle = skin.furDark;
    ctx.fillRect(-9, -4, 4, 7);
    ctx.fillStyle = skin.fur;
    ctx.fillRect(5, -4, 4, 7);
  }

  // fur fluff: a chest ruff for long coats, drawn just before the head
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
  const groomDip = pose === "groom" ? Math.max(0, Math.sin(time * 5.5)) : 0;
  const stretchOut = pose === "stretch" ? 3.5 + Math.max(0, Math.sin(time * 2.2)) * 2 : 0;
  const headX = (pose === "sit" || pose === "groom" ? 4 : pose === "stretch" ? 13 : 9) - groomDip * 1.5 + stretchOut * 0.4;
  const headY =
    (pose === "swim" ? -8 : pose === "sit" ? -16 : pose === "sleep" ? -8 : pose === "crouch" ? -8 : -11) + groomDip * 5;
  ctx.fillStyle = skin.fur;
  ctx.strokeStyle = outlineOf(skin);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(headX, headY, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ears (alert pricks both ears upright and forward)
  const earH = skin.ears === "tall" ? 12 : skin.ears === "fold" ? 6 : 10;
  const earDx = fx?.alert ? -2 : 0;
  ctx.beginPath();
  ctx.moveTo(headX - 5.5 + earDx, headY - 3.5);
  ctx.lineTo(headX - 3 + earDx, headY - earH);
  ctx.lineTo(headX - 0.5 + earDx, headY - 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
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
  }
  ctx.fillStyle = "#c98a8a";
  ctx.beginPath();
  ctx.moveTo(headX + 2.2, headY - 5.6);
  ctx.lineTo(headX + 3.5, headY - 8.8);
  ctx.lineTo(headX + 4.8, headY - 5.2);
  ctx.closePath();
  ctx.fill();

  // scars: legacy single scar + the multi-scar customization set
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
  }

  // muzzle (a yawn opens the mouth: dark maw + tiny pink tongue)
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.ellipse(headX + 4, headY + 2.5, 3, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (fx?.yawn) {
    const maw = Math.sin(time * 2.6) * 0.5 + 0.5; // gentle open-close loop
    ctx.fillStyle = "#241a16";
    ctx.beginPath();
    ctx.ellipse(headX + 4.2, headY + 3.4 + maw * 0.8, 2.6, 1.4 + maw * 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d98a8a";
    ctx.beginPath();
    ctx.ellipse(headX + 4.2, headY + 4.6 + maw * 1.4, 1.2, 0.8 + maw * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (fx?.talking) {
    // subtle mouth movement while this cat speaks to the player
    ctx.fillStyle = "rgba(60, 40, 35, 0.85)";
    const jaw = Math.abs(Math.sin(time * 6)) * 1.6;
    ctx.beginPath();
    ctx.ellipse(headX + 4.4, headY + 3.2, 1.1, 0.5 + jaw, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // eyes — closed while sleeping, blinking otherwise; both visible (3/4 view)
  const blink =
    pose === "sleep" ? 0.08 : Math.sin(time * 0.9 + phase * 3) > 0.985 ? 0.15 : 1;
  const eyeColors = skin.eye2 ? [skin.eye2, skin.eye] : [skin.eye, skin.eye];
  ctx.fillStyle = eyeColors[1]; // far eye
  ctx.beginPath();
  ctx.ellipse(headX + 0.6, headY - 0.5, 1.6, 1.6 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = eyeColors[0]; // near eye
  ctx.beginPath();
  ctx.ellipse(headX + 3.5, headY - 0.5, 1.6, 1.6 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  if (blink > 0.5) {
    ctx.fillStyle = "#141414";
    for (const ex of [headX + 3.9, headX + 1]) {
      ctx.beginPath();
      ctx.ellipse(ex, headY - 0.5, 0.75, 1.25 * blink, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // catchlight
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (const ex of [headX + 4.2, headX + 1.3]) {
      ctx.beginPath();
      ctx.arc(ex, headY - 1.1, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // whiskers
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(headX + 6, headY + 1.5);
  ctx.lineTo(headX + 11, headY + 0.5);
  ctx.moveTo(headX + 6, headY + 2.5);
  ctx.lineTo(headX + 11, headY + 3);
  ctx.stroke();

  // --- white markings (multi-select, pose-anchored) ---
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

  // shake droplets: spray off the head/back in an arc, fading over the pose
  if (pose === "shake") {
    const life = (Math.sin(time * 26) + 1) / 2; // 0..1 pulsing with the wobble
    ctx.fillStyle = shakeWet ? "rgba(190, 220, 245, 0.85)" : "rgba(235, 245, 255, 0.8)"; // water vs snow
    for (let i = 0; i < 7; i++) {
      const a = -0.4 - i * 0.42;
      const d = 10 + ((i * 5 + Math.floor(time * 40)) % 14);
      const dx = Math.cos(a) * d - 4;
      const dy = Math.sin(a) * d - 14 - life * 3;
      ctx.beginPath();
      ctx.arc(dx, dy, 1.4 - (d % 3) * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  // tail flick: drawn OUTSIDE the mirrored transform so it always sweeps to
  // the same side regardless of facing (a visible, readable tail gesture)
  if (fx?.tailFlick) {
    const flick = Math.sin(time * 5.5) * 8;
    ctx.save();
    ctx.translate(x, y - 4);
    ctx.strokeStyle = skin.furDark;
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.quadraticCurveTo(-20, -8 - flick * 0.4, -24, -14 - flick);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Prey
// ---------------------------------------------------------------------------

export type PreySprite = "mouse" | "rabbit" | "squirrel" | "bird" | "fish" | "frog";

export function drawPrey(
  ctx: CanvasRenderingContext2D,
  kind: PreySprite,
  x: number,
  y: number,
  facing: 1 | -1,
  hopping: boolean,
  time: number,
  seed: number,
  /** true while the freshly-killed prey is still visible before despawning */
  dead = false,
) {
  const bob = hopping ? Math.abs(Math.sin(time * 12 + seed)) * 3 : 0;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x, y, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  if (dead) {
    // killed prey: knocked over; the engine despawns it shortly after
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.rotate(Math.PI / 2.4);
  } else {
    ctx.translate(x, y - bob);
    ctx.scale(facing, 1);
  }

  switch (kind) {
    case "mouse": {
      ctx.strokeStyle = "#9c9ca4";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.quadraticCurveTo(-9, -2, -11, 0);
      ctx.stroke();
      ctx.fillStyle = "#8f8f96";
      ctx.beginPath();
      ctx.ellipse(0, -2.5, 5.5, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(5, -4, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c98a8a";
      ctx.beginPath();
      ctx.arc(5.4, -5.4, 1.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "rabbit": {
      ctx.fillStyle = "#b09a80";
      ctx.beginPath();
      ctx.ellipse(0, -4, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(7, -7, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8f7a63";
      ctx.beginPath();
      ctx.ellipse(6.5, -11, 1.4, 4.4, -0.25, 0, Math.PI * 2);
      ctx.ellipse(9.4, -10.4, 1.4, 4.2, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(8, -7, 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b09a80";
      ctx.beginPath();
      ctx.arc(-7, -2.5, 2.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "squirrel": {
      ctx.fillStyle = "#a5622d";
      ctx.beginPath();
      ctx.ellipse(0, -3.5, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(5, -6.5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8a4f22";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-5, -3);
      ctx.quadraticCurveTo(-11, -8 + Math.sin(time * 3 + seed) * 2, -9, -12);
      ctx.stroke();
      ctx.fillStyle = "#c9c2b8";
      ctx.beginPath();
      ctx.arc(5, -8.8, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "bird": {
      const peck = Math.sin(time * 6 + seed) > 0.6 ? 1.5 : 0;
      ctx.fillStyle = "#6a7d8a";
      ctx.beginPath();
      ctx.ellipse(0, -4 + peck, 5, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(4.5, -7 + peck, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d9a83a";
      ctx.beginPath();
      ctx.moveTo(6.6, -7 + peck);
      ctx.lineTo(9, -6.2 + peck);
      ctx.lineTo(6.6, -5.6 + peck);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#4a5a66";
      ctx.beginPath();
      ctx.moveTo(-3, -4);
      ctx.quadraticCurveTo(-8, -6, -9, -2);
      ctx.quadraticCurveTo(-5, -1.5, -3, -2.5);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "fish": {
      ctx.fillStyle = "#7fa8c9";
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.ellipse(0, -2, 6, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-5, -2);
      ctx.lineTo(-9, -4.5);
      ctx.lineTo(-9, 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case "frog": {
      const hop = hopping ? Math.abs(Math.sin(time * 8 + seed)) * 2 : 0;
      ctx.fillStyle = "#5f8f4e";
      ctx.beginPath();
      ctx.ellipse(0, -2.5 - hop, 5, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(3.4, -4.6 - hop, 1.9, 0, Math.PI * 2);
      ctx.arc(5.6, -4.2 - hop, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(3.8, -4.8 - hop, 0.6, 0, Math.PI * 2);
      ctx.arc(5.9, -4.4 - hop, 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Deterministic house variation from position: two nearby houses never look
 * identical. Used for silhouette, roof color and trim — Pokémon-style cozy
 * variety without any randomness frame to frame.
 */
function houseVariant(x: number, y: number): number {
  let h = (Math.floor(x) * 73856093) ^ (Math.floor(y) * 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const HOUSE_WALLS = ["#e8d9b8", "#e2c9a2", "#f0e0c8", "#dcc5a5", "#eadcc0", "#d9c19b"];
const HOUSE_ROOFS = ["#b0563f", "#7a5232", "#5d7a8c", "#5e7d52", "#a8683a", "#8a5a44", "#6e5a7d"];
const HOUSE_TRIMS = ["#8c4a38", "#5c4328", "#44607a", "#4a6a40", "#8a5430", "#6a4534"];

export function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opts?: { doorway?: boolean }) {
  const v = houseVariant(x, y);
  const twoStory = v > 0.78;      // a few tall houses anchor the street
  const sideWing = v > 0.42 && v <= 0.58; // attached side extension
  const dormer = v > 0.58 && v <= 0.7;    // dormer window in the roof
  const roofStyle = v > 0.2 ? (v < 0.5 ? "gable" : "hip") : "flat"; // varied silhouettes
  const wall = HOUSE_WALLS[Math.floor(v * 6) % 6];
  const roof = HOUSE_ROOFS[Math.floor(v * 97) % 7];
  const trim = HOUSE_TRIMS[Math.floor(v * 53) % 6];

  // yard shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.42, w * 0.55, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // side wing (gives some houses an L-shape)
  if (sideWing) {
    ctx.fillStyle = wall;
    ctx.fillRect(x + w * 0.42, y - h * 0.1, w * 0.22, h * 0.5);
    ctx.fillStyle = roof;
    ctx.fillRect(x + w * 0.42, y - h * 0.22, w * 0.22, h * 0.14);
    // wing window
    ctx.fillStyle = "#87b7d9";
    ctx.fillRect(x + w * 0.47, y + h * 0.06, w * 0.1, h * 0.14);
  }

  // walls (main block)
  ctx.fillStyle = wall;
  ctx.fillRect(x - w * 0.42, y - h * 0.4, w * 0.84, h * 0.78);
  // second-floor band on two-story houses
  if (twoStory) {
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    ctx.fillRect(x - w * 0.42, y - h * 0.4, w * 0.84, h * 0.1);
  }
  // corner trim (clean readable edges)
  ctx.strokeStyle = "rgba(90,60,30,0.35)";
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.strokeRect(x - w * 0.42, y - h * 0.4, w * 0.84, h * 0.78);

  // roof — three silhouettes, warm residential palette
  ctx.fillStyle = roof;
  if (roofStyle === "gable") {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y - h * 0.35);
    ctx.lineTo(x, y - (twoStory ? h * 1.0 : h * 0.85));
    ctx.lineTo(x + w * 0.5, y - h * 0.35);
    ctx.closePath();
    ctx.fill();
  } else if (roofStyle === "hip") {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y - h * 0.35);
    ctx.lineTo(x - w * 0.2, y - (twoStory ? h * 0.95 : h * 0.8));
    ctx.lineTo(x + w * 0.2, y - (twoStory ? h * 0.95 : h * 0.8));
    ctx.lineTo(x + w * 0.5, y - h * 0.35);
    ctx.closePath();
    ctx.fill();
  } else {
    // gentle terraced flat roof with a parapet — colorful town style
    ctx.fillRect(x - w * 0.52, y - h * 0.52, w * 1.04, h * 0.18);
    ctx.fillStyle = trim;
    ctx.fillRect(x - w * 0.52, y - h * 0.38, w * 1.04, h * 0.05);
  }
  // roof shading + ridge highlight
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.beginPath();
  ctx.moveTo(x + w * 0.08, y - h * 0.42);
  ctx.lineTo(x + w * 0.5, y - h * 0.35);
  ctx.lineTo(x + w * 0.08, y - h * 0.35);
  ctx.closePath();
  ctx.fill();

  // dormer window
  if (dormer) {
    ctx.fillStyle = wall;
    ctx.fillRect(x + w * 0.14, y - h * 0.62, w * 0.16, h * 0.2);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.11, y - h * 0.62);
    ctx.lineTo(x + w * 0.22, y - h * 0.74);
    ctx.lineTo(x + w * 0.33, y - h * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#87b7d9";
    ctx.fillRect(x + w * 0.18, y - h * 0.58, w * 0.08, h * 0.1);
  }

  // chimney on some houses
  if (v > 0.33 && v <= 0.58) {
    ctx.fillStyle = "#9a5a48";
    ctx.fillRect(x - w * 0.3, y - h * 0.78, w * 0.09, h * 0.3);
    ctx.fillStyle = "#7a4438";
    ctx.fillRect(x - w * 0.31, y - h * 0.82, w * 0.11, h * 0.06);
  }

  // windows: frames + shutters + sills, symmetric
  const winY = y - h * 0.24;
  const winW = w * 0.14;
  const winH = h * 0.16;
  const drawWindow = (wx: number, shutters: boolean) => {
    ctx.fillStyle = trim;
    ctx.fillRect(wx - winW * 0.65, winY - winH * 0.18, winW * 1.3, winH * 1.36);
    ctx.fillStyle = "#87b7d9";
    ctx.fillRect(wx - winW * 0.5, winY - winH * 0.06, winW, winH);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(wx - winW * 0.5, winY - winH * 0.06, winW, winH * 0.35);
    ctx.fillStyle = trim;
    ctx.fillRect(wx - winW * 0.05, winY - winH * 0.06, winW * 0.1, winH); // mullion
    if (shutters) {
      ctx.fillStyle = trim;
      ctx.fillRect(wx - winW * 0.95, winY - winH * 0.06, winW * 0.4, winH);
      ctx.fillRect(wx + winW * 0.55, winY - winH * 0.06, winW * 0.4, winH);
    }
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(wx - winW * 0.65, winY + winH * 1.18, winW * 1.3, winH * 0.14); // sill
  };
  drawWindow(x - w * 0.26, v > 0.1);
  drawWindow(x + w * 0.26, v > 0.1);
  if (twoStory) {
    // upper row
    ctx.fillStyle = "#87b7d9";
    ctx.fillRect(x - w * 0.3, y - h * 0.66, winW, winH * 0.8);
    ctx.fillRect(x + w * 0.16, y - h * 0.66, winW, winH * 0.8);
    ctx.fillStyle = trim;
    ctx.fillRect(x - w * 0.32, y - h * 0.68, winW * 1.2, winH * 0.1);
    ctx.fillRect(x + w * 0.14, y - h * 0.68, winW * 1.2, winH * 0.1);
  }

  if (opts?.doorway) {
    // open doorway: a dark rounded-top gap set into the facade with a warm
    // welcome glow — the ONE door, part of the wall itself
    const dw = Math.max(14, w * 0.17);
    ctx.fillStyle = "#0a0a0c";
    ctx.beginPath();
    ctx.moveTo(x - dw / 2, y + h * 0.38);
    ctx.lineTo(x - dw / 2, y - h * 0.02);
    ctx.quadraticCurveTo(x, y - h * 0.2, x + dw / 2, y - h * 0.02);
    ctx.lineTo(x + dw / 2, y + h * 0.38);
    ctx.closePath();
    ctx.fill();
    // door frame
    ctx.strokeStyle = trim;
    ctx.lineWidth = Math.max(1.2, w * 0.025);
    ctx.stroke();
    // welcome mat + warm light spilling out
    const g = ctx.createRadialGradient(x, y + h * 0.3, 2, x, y + h * 0.3, dw * 1.5);
    g.addColorStop(0, "rgba(255, 214, 140, 0.35)");
    g.addColorStop(1, "rgba(255, 214, 140, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y + h * 0.38, dw * 1.2, h * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // closed front door with frame and round handle
    ctx.fillStyle = trim;
    ctx.fillRect(x - w * 0.09, y - h * 0.14, w * 0.18, h * 0.52);
    ctx.fillStyle = "#6a4a34";
    ctx.fillRect(x - w * 0.07, y - h * 0.12, w * 0.14, h * 0.5);
    ctx.fillStyle = "#e8c76a";
    ctx.beginPath();
    ctx.arc(x + w * 0.045, y + h * 0.12, Math.max(1, w * 0.016), 0, Math.PI * 2);
    ctx.fill();
  }

  // flower box under one window (cozy touch on ~half the houses)
  if (v > 0.62) {
    const bx = x - w * 0.26;
    ctx.fillStyle = trim;
    ctx.fillRect(bx - winW * 0.55, winY + winH * 1.0, winW * 1.1, winH * 0.16);
    ctx.fillStyle = "#d97a8a";
    ctx.beginPath();
    ctx.arc(bx - winW * 0.3, winY + winH * 0.98, winW * 0.14, 0, Math.PI * 2);
    ctx.arc(bx, winY + winH * 0.98, winW * 0.14, 0, Math.PI * 2);
    ctx.arc(bx + winW * 0.3, winY + winH * 0.98, winW * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6fae5c";
    ctx.fillRect(bx - winW * 0.5, winY + winH * 0.94, winW, winH * 0.05);
  }
}

export function drawBarn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.42, w * 0.55, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a8442e";
  ctx.fillRect(x - w * 0.45, y - h * 0.45, w * 0.9, h * 0.85);
  ctx.fillStyle = "#7a3322";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y - h * 0.4);
  ctx.lineTo(x, y - h * 0.9);
  ctx.lineTo(x + w * 0.5, y - h * 0.4);
  ctx.closePath();
  ctx.fill();
  // big open barn doorway — black gap (barn is enterable)
  ctx.fillStyle = "#0a0a0c";
  ctx.fillRect(x - w * 0.12, y - h * 0.08, w * 0.24, h * 0.5);
  ctx.strokeStyle = "#5a2418";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - w * 0.12, y - h * 0.08, w * 0.24, h * 0.5);
}

export function drawFence(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#8a6f52";
  const posts = Math.max(2, Math.floor(w / 22));
  for (let i = 0; i <= posts; i++) {
    const px = x - w / 2 + (w / posts) * i;
    ctx.fillRect(px - 2, y - 10, 4, 14);
  }
  ctx.fillRect(x - w / 2, y - 8, w, 3);
  ctx.fillRect(x - w / 2, y - 3, w, 3);
}

export function drawReeds(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, time: number) {
  ctx.strokeStyle = "#5f7d43";
  ctx.lineWidth = 1.6;
  const sway = Math.sin(time * 1.4 + x * 0.03) * 3;
  for (let i = 0; i < 7; i++) {
    const bx = x - w * 0.4 + (w * 0.8 * i) / 6;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.quadraticCurveTo(bx + sway * 0.5, y - h * 0.6, bx + sway, y - h);
    ctx.stroke();
  }
}

export function drawHerbPatch(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const sway = Math.sin(time * 1.6 + x) * 1;
  ctx.strokeStyle = "#4c8a47";
  ctx.lineWidth = 1.4;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 3, y);
    ctx.quadraticCurveTo(x + i * 4 + sway, y - 6, x + i * 5 + sway, y - 9);
    ctx.stroke();
  }
  ctx.fillStyle = "#e5c95c";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(x + i * 5 + sway, y - 10, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawFlowerBed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "#7a5b3a";
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.5, h * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  const colors = ["#d977a0", "#e5c95c", "#d96b2f"];
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.arc(x - w * 0.3 + i * w * 0.15, y - 3 - (i % 2) * 4, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawCave(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.4, w * 0.6, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7d7f84";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y + h * 0.3);
  ctx.lineTo(x - w * 0.35, y - h * 0.5);
  ctx.lineTo(x + w * 0.35, y - h * 0.5);
  ctx.lineTo(x + w * 0.5, y + h * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#17140f";
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.2, h * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  // faint moonstone glow
  const g = ctx.createRadialGradient(x, y, 2, x, y, w * 0.32);
  g.addColorStop(0, "rgba(200, 220, 255, 0.35)");
  g.addColorStop(1, "rgba(200, 220, 255, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, w * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A dark, arched den entrance drawn INTO the object's south face — reads as a
 * real opening a cat can walk into (replaces the old floating dot marker).
 */
export function drawDenEntrance(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  const h = w * 0.62;
  ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x - w / 2, y - h * 0.45);
  ctx.quadraticCurveTo(x - w / 2 + w * 0.18, y - h, x, y - h);
  ctx.quadraticCurveTo(x + w / 2 - w * 0.18, y - h, x + w / 2, y - h * 0.45);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fill();
  // warm rim light around the mouth
  ctx.strokeStyle = "rgba(240, 220, 170, 0.35)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // subtle inner depth fade
  const g = ctx.createLinearGradient(0, y - h, 0, y);
  g.addColorStop(0, "rgba(60, 46, 30, 0.25)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.fill();
}

export function drawFreshKillPile(ctx: CanvasRenderingContext2D, x: number, y: number, extra = 0) {
  const mice: [number, number, string][] = [
    [-6, 0, "#8f8f96"],
    [5, 3, "#a5764a"],
    [0, -5, "#7a7a80"],
    [-3, -8, "#9c8a6a"],
  ];
  // NPC hunters deposit prey here: the pile visibly grows (up to +6)
  for (let i = 0; i < extra; i++) {
    mice.push([(i % 2 ? 10 : -11) + (i > 2 ? 3 : 0), 6 + Math.floor(i / 2) * 4, i % 2 ? "#b08a5a" : "#98a06a"]);
  }
  for (const [dx, dy, c] of mice) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + dx + 5, y + dy);
    ctx.quadraticCurveTo(x + dx + 9, y + dy - 2, x + dx + 11, y + dy);
    ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x + dx, y + dy, 5, 3, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + dx - 5, y + dy - 1, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawTallRock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.42, w * 0.62, h * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8b8d92";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y + h * 0.35);
  ctx.lineTo(x - w * 0.3, y - h * 0.7);
  ctx.lineTo(x + w * 0.05, y - h * 0.95);
  ctx.lineTo(x + w * 0.4, y - h * 0.45);
  ctx.lineTo(x + w * 0.52, y + h * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#9fa1a6";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.3, y - h * 0.7);
  ctx.lineTo(x + w * 0.05, y - h * 0.95);
  ctx.lineTo(x + w * 0.12, y - h * 0.3);
  ctx.lineTo(x - w * 0.18, y - h * 0.15);
  ctx.closePath();
  ctx.fill();
  // leader's den crack
  ctx.fillStyle = "#241c12";
  ctx.beginPath();
  ctx.ellipse(x + w * 0.28, y - h * 0.1, w * 0.07, h * 0.26, 0.15, 0, Math.PI * 2);
  ctx.fill();
}

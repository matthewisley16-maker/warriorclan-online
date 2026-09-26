// WarriorCatsRPG — programmatic sprite drawing: parameterized cats (patterns,
// tails, ears, poses), prey animals, and camp/territory props.

export interface CatSkin {
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
}

export type CatPose = "walk" | "sit" | "sleep" | "crouch" | "groom" | "stretch";

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
) {
  const size = skin.size ?? 1;
  const moving = pose === "walk";
  const bob = moving
    ? Math.abs(Math.sin(time * 9 + phase)) * 1.6
    : Math.sin(time * 1.4 + phase) * 0.5;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 15 * size, 6 * size, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * size, size);
  ctx.translate(0, -bob);

  const tail = skin.tail ?? "normal";
  const tailLen = tail === "short" ? 0.5 : tail === "bob" ? 0.3 : 1;
  const tailW = tail === "fluffy" ? 6.5 : 4.5;

  // tail
  const tailSway = Math.sin(time * 2.2 + phase) * (moving ? 5 : 9);
  ctx.strokeStyle = skin.furDark;
  ctx.lineWidth = tailW;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (pose === "sit") {
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
  ctx.beginPath();
  if (pose === "sit") {
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
  if (pose === "walk") {
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

  // head (groom pose dips toward the chest to lick it)
  const groomDip = pose === "groom" ? Math.max(0, Math.sin(time * 5.5)) : 0;
  const headX = (pose === "sit" || pose === "groom" ? 4 : 9) - groomDip * 1.5;
  const headY =
    (pose === "sit" ? -16 : pose === "sleep" ? -8 : pose === "crouch" ? -8 : -11) + groomDip * 5;
  ctx.fillStyle = skin.fur;
  ctx.strokeStyle = outlineOf(skin);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(headX, headY, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ears
  const earH = skin.ears === "tall" ? 12 : skin.ears === "fold" ? 6 : 10;
  ctx.beginPath();
  ctx.moveTo(headX - 5.5, headY - 3.5);
  ctx.lineTo(headX - 3, headY - earH);
  ctx.lineTo(headX - 0.5, headY - 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(headX + 1, headY - 5);
  ctx.lineTo(headX + 3.5, headY - earH - 0.5);
  ctx.lineTo(headX + 6, headY - 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#c98a8a";
  ctx.beginPath();
  ctx.moveTo(headX + 2.2, headY - 5.6);
  ctx.lineTo(headX + 3.5, headY - 8.8);
  ctx.lineTo(headX + 4.8, headY - 5.2);
  ctx.closePath();
  ctx.fill();

  // scars
  if (skin.scar) {
    ctx.strokeStyle = "rgba(200, 90, 70, 0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(headX - 2, headY - 5);
    ctx.lineTo(headX + 1.5, headY - 1);
    ctx.stroke();
  }

  // muzzle
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.ellipse(headX + 4, headY + 2.5, 3, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // eyes — closed while sleeping, blinking otherwise; both visible (3/4 view)
  const blink =
    pose === "sleep" ? 0.08 : Math.sin(time * 0.9 + phase * 3) > 0.985 ? 0.15 : 1;
  ctx.fillStyle = skin.eye;
  for (const ex of [headX + 3.5, headX + 0.6]) {
    ctx.beginPath();
    ctx.ellipse(ex, headY - 0.5, 1.6, 1.6 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
  }
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

  ctx.restore();
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
) {
  const bob = hopping ? Math.abs(Math.sin(time * 12 + seed)) * 3 : 0;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x, y, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(facing, 1);

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

export function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.42, w * 0.55, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // walls
  ctx.fillStyle = "#c9b8a0";
  ctx.fillRect(x - w * 0.42, y - h * 0.4, w * 0.84, h * 0.78);
  // roof
  ctx.fillStyle = "#8a5a44";
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y - h * 0.35);
  ctx.lineTo(x, y - h * 0.85);
  ctx.lineTo(x + w * 0.5, y - h * 0.35);
  ctx.closePath();
  ctx.fill();
  // door + windows
  ctx.fillStyle = "#6a4a34";
  ctx.fillRect(x - w * 0.07, y - h * 0.12, w * 0.14, h * 0.5);
  ctx.fillStyle = "#7fa8c9";
  ctx.fillRect(x - w * 0.3, y - h * 0.28, w * 0.14, h * 0.16);
  ctx.fillRect(x + w * 0.16, y - h * 0.28, w * 0.14, h * 0.16);
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
  ctx.fillStyle = "#e8dcc8";
  ctx.fillRect(x - w * 0.1, y - h * 0.18, w * 0.2, h * 0.55);
  ctx.strokeStyle = "#7a3322";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - w * 0.1, y - h * 0.18, w * 0.2, h * 0.55);
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

export function drawFreshKillPile(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const mice: [number, number, string][] = [
    [-6, 0, "#8f8f96"],
    [5, 3, "#a5764a"],
    [0, -5, "#7a7a80"],
    [-3, -8, "#9c8a6a"],
  ];
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

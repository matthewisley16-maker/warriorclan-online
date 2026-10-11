// Tail animation acceptance suite (§1–§5, §21–§24 of the tail/customization
// repair task). Reproduces and then guards the three reported tail failures:
//
//  1. TWO TAILS ON OPPOSITE SIDES — the "tail flick" was stroked OUTSIDE the
//     facing mirror at a fixed screen-left position while the body tail was
//     mirrored, so a left-facing cat (e.g. mid-conversation) grew a second tail
//     behind its head.
//  2. FROZEN TAIL — the sit/sleep/groom/lie families had no time term at all,
//     so the tail was motionless exactly while a conversation held the cat in
//     the sit pose.
//  3. SNAPPING — each pose family had its own hard anchors, so switching pose
//     teleported the tail tip ~33px in a single frame.
//
// Every assertion drives the REAL renderer (drawCat) and the REAL tail
// controller (src/game/tail.ts) through a recording canvas mock.
//
// Run: bun scripts/check-tail.ts

import fs from "node:fs";
import { drawCat, normalizeSkin } from "../src/game/draw";
import { resetTailStates, tailStateCount } from "../src/game/tail";
import type { CatPose, CatSkin } from "../src/game/draw";

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  if (ok) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

// ---------------------------------------------------------------------------
// A recording canvas: applies the full transform stack so the numbers we read
// back are SCREEN coordinates (the double-tail bug is invisible in local ones).
// ---------------------------------------------------------------------------
interface Op {
  kind: "stroke" | "fill";
  path: "quad" | "ellipse" | "rect" | "arc" | "other";
  pts: number[]; // [x,y] pairs in SCREEN space
  local: number[]; // the same points in the cat's LOCAL (body-relative) space
  style: string;
  width: number;
  index: number;
}
interface Recorder {
  ctx: CanvasRenderingContext2D;
  ops: Op[];
}
function makeCtx(): Recorder {
  const ops: Op[] = [];
  let width = 1;
  let fillStyle = "";
  let strokeStyle = "";
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack: [number, string, string, typeof m][] = [];
  let path: Op["path"] = "other";
  let pts: number[] = [];
  let localPts: number[] = [];
  const ap = (x: number, y: number): [number, number] => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  const rec = (kind: Op["kind"]) =>
    ops.push({
      kind,
      path,
      pts: [...pts],
      local: [...localPts],
      // fill and stroke styles are tracked separately: a single variable made
      // every recorded fill report the outline colour (both are set before the
      // path is filled), which hid the body layer from the layering check
      style: kind === "fill" ? fillStyle : strokeStyle,
      width,
      index: ops.length,
    });
  const ctx: Record<string, unknown> = {
    save() { stack.push([width, fillStyle, strokeStyle, { ...m }]); },
    restore() { const s = stack.pop(); if (s) { width = s[0]; fillStyle = s[1]; strokeStyle = s[2]; m = s[3]; } },
    translate(x: number, y: number) { const [nx, ny] = ap(x, y); m.e = nx; m.f = ny; },
    scale(sx: number, sy: number) { m.a *= sx; m.c *= sx; m.b *= sy; m.d *= sy; },
    rotate(r: number) {
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      const { a, b, c, d } = m;
      m.a = a * cos + c * sin; m.b = b * cos + d * sin; m.c = c * cos - a * sin; m.d = d * cos - b * sin;
    },
    beginPath() { pts = []; localPts = []; path = "other"; },
    moveTo(x: number, y: number) { pts.push(...ap(x, y)); localPts.push(x, y); },
    lineTo(x: number, y: number) { pts.push(...ap(x, y)); localPts.push(x, y); },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) { pts.push(...ap(cx, cy), ...ap(x, y)); localPts.push(cx, cy, x, y); path = "quad"; },
    ellipse(x: number, y: number, rx: number, ry: number) { pts.push(...ap(x, y), rx, ry); localPts.push(x, y, rx, ry); path = "ellipse"; },
    arc(x: number, y: number, r: number) { pts.push(...ap(x, y), r); localPts.push(x, y, r); path = "arc"; },
    rect(x: number, y: number, w: number, h: number) { pts.push(...ap(x, y), w, h); localPts.push(x, y, w, h); path = "rect"; },
    roundRect(x: number, y: number, w: number, h: number) { pts.push(...ap(x, y), w, h); localPts.push(x, y, w, h); path = "rect"; },
    fillRect() {},
    strokeRect() {}, fill() { rec("fill"); }, stroke() { rec("stroke"); }, clip() {}, closePath() {},
    get lineWidth() { return width; }, set lineWidth(v: number) { width = v; },
    lineCap: "butt", lineJoin: "round", globalAlpha: 1,
    get strokeStyle() { return strokeStyle; }, set strokeStyle(v: string) { strokeStyle = v; },
    get fillStyle() { return fillStyle; }, set fillStyle(v: string) { fillStyle = v; },
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillText() {}, setTransform() {}, clearRect() {}, canvas: { width: 400, height: 400 },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

/** The cat's own tail: the widest stroke (the pale tail-tip cap is excluded by
 *  its lighter style, and it is only present when that marking is equipped). */
function tailStrokes(ops: Op[]): Op[] {
  return ops.filter((o) => o.kind === "stroke" && o.width >= 3.2 && !o.style.includes("244, 238, 226"));
}
function tipOf(ops: Op[]): [number, number] {
  const t = tailStrokes(ops)[0];
  const p = t?.pts ?? [];
  return [p[p.length - 2] ?? NaN, p[p.length - 1] ?? NaN];
}
/** The tail tip relative to the CAT (screen coords include the body's own bob,
 *  dance bounce and shake wobble, which are legitimate motion and would mask
 *  how the tail itself moves). */
function localTipOf(ops: Op[]): [number, number] {
  const t = tailStrokes(ops)[0];
  const p = t?.local ?? [];
  return [p[p.length - 2] ?? NaN, p[p.length - 1] ?? NaN];
}
function drawAt(
  skin: CatSkin,
  pose: CatPose,
  opts: { facing?: 1 | -1; time?: number; talking?: boolean; tailFlick?: boolean; id?: string; size?: number } = {},
): Recorder {
  const r = makeCtx();
  drawCat(r.ctx, { ...skin, size: opts.size ?? skin.size ?? 1 }, 100, 100, opts.facing ?? 1, pose, opts.time ?? 1, 0, {
    tailId: opts.id ?? "test",
    talking: opts.talking,
    tailFlick: opts.tailFlick,
  });
  return r;
}

const BASE: CatSkin = { fur: "#d96b2f", furDark: "#b04f1d", eye: "#4fae6e" };
const ALL_POSES: CatPose[] = [
  "walk", "sit", "sleep", "crouch", "groom", "stretch", "swim", "shake",
  "lie", "yawn", "sniff", "stalk", "pounce", "leap", "play", "bow",
  "scratch", "challenge", "dance1", "dance2", "dance3", "dance4",
];

console.log("\n--- 1. exactly ONE tail, in every pose and every state (§3/§4) ---");
{
  let bad = 0;
  const detail: string[] = [];
  for (const pose of ALL_POSES) {
    for (const facing of [1, -1] as const) {
      for (const tailFlick of [false, true]) {
        resetTailStates();
        const r = drawAt(BASE, pose, { facing, tailFlick, talking: true, id: `one:${pose}:${facing}:${tailFlick}` });
        const n = tailStrokes(r.ops).length;
        if (n !== 1) {
          bad++;
          detail.push(`${pose} f${facing} flick=${tailFlick} → ${n} tails`);
        }
      }
    }
  }
  check(bad === 0, `every pose/facing/flick draws exactly one tail (${ALL_POSES.length * 4} cases)`, detail[0]);

  // the removed bug, kept as an explicit regression: a flicking left-facing cat
  // must NOT grow a second tail on the far side of the body
  resetTailStates();
  const leftFlick = drawAt(BASE, "sit", { facing: -1, tailFlick: true, talking: true, id: "regress" });
  const tail = tailStrokes(leftFlick.ops)[0]!;
  const headX = tail.pts[0] ?? 100; // base x (screen)
  const tipX = tail.pts[tail.pts.length - 2] ?? 100;
  check(
    Math.sign(tipX - 100) === Math.sign(headX - 100),
    "left-facing talking cat keeps its tail on the body's side",
    `base=${headX.toFixed(1)} tip=${tipX.toFixed(1)}`,
  );
}

console.log("\n--- 2. the tail stays ATTACHED behind the cat when it turns (§2) ---");
{
  let bad = 0;
  let mirrorBad = 0;
  for (const pose of ALL_POSES) {
    resetTailStates();
    const right = tailStrokes(drawAt(BASE, pose, { facing: 1, id: `mir:${pose}` }).ops)[0]!;
    resetTailStates();
    const left = tailStrokes(drawAt(BASE, pose, { facing: -1, id: `mir:${pose}` }).ops)[0]!;
    const rTip = [right.pts[right.pts.length - 2]!, right.pts[right.pts.length - 1]!];
    const lTip = [left.pts[left.pts.length - 2]!, left.pts[left.pts.length - 1]!];
    // facing=1: tail behind the cat = screen LEFT of the ground point; facing=-1: mirrored
    if (!(rTip[0]! < 100 && lTip[0]! > 100)) {
      bad++;
      continue;
    }
    // and the mirrored shape is the exact mirror of the original
    const rBase = [right.pts[0]!, right.pts[1]!];
    const lBase = [left.pts[0]!, left.pts[1]!];
    if (Math.abs(rBase[0]! - 100 + (lBase[0]! - 100)) > 0.01 || Math.abs(rBase[1]! - lBase[1]!) > 0.01) mirrorBad++;
    if (Math.abs(rTip[0]! - 100 + (lTip[0]! - 100)) > 0.01 || Math.abs(rTip[1]! - lTip[1]!) > 0.01) mirrorBad++;
  }
  check(bad === 0, "the tail is always on the body's trailing side (all poses)", `${bad} bad`);
  check(mirrorBad === 0, "the tail is an exact mirror when the cat turns (no drift)", `${mirrorBad} bad`);
}

console.log("\n--- 3. the tail is ALIVE in every state, including while talking (§2/§3/§5) ---");
{
  const MIN: Partial<Record<CatPose, number>> = {
    sit: 3, groom: 3, walk: 4, swim: 4, crouch: 1.5, stalk: 1.5, dance1: 5, sleep: 0.8, lie: 0.8, play: 2,
  };
  const amp = (pose: CatPose, talking: boolean): number => {
    resetTailStates();
    let lo = Infinity;
    let hi = -Infinity;
    for (let f = 0; f < 180; f++) {
      const r = drawAt(BASE, pose, { time: 1 + f / 60, talking, id: `amp:${pose}:${talking}` });
      const y = tipOf(r.ops)[1];
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    return hi - lo;
  };
  let dead = 0;
  const detail: string[] = [];
  for (const [pose, min] of Object.entries(MIN) as [CatPose, number][]) {
    const a = amp(pose, false);
    if (a < min) {
      dead++;
      detail.push(`${pose} ${a.toFixed(2)}px < ${min}`);
    }
  }
  check(dead === 0, `no pose family has a frozen tail (${Object.keys(MIN).length} families)`, detail[0]);
  // the conversation case: sitting + talking must keep moving (and move more)
  const sitIdle = amp("sit", false);
  const sitTalk = amp("sit", true);
  check(sitTalk > sitIdle * 1.15 && sitTalk > 3, "a talking cat's tail moves more than its idle tail", `idle ${sitIdle.toFixed(2)} talk ${sitTalk.toFixed(2)}`);
}

console.log("\n--- 4. no snapping: a pose change EASES (§2/§3) ---");
{
  // walk up, sit down to talk, flick: the exact dialogue sequence
  resetTailStates();
  let worst = 0;
  let prev: [number, number] | null = null;
  let t = 3;
  for (let f = 0; f < 150; f++) {
    const pose: CatPose = f < 12 ? "walk" : "sit";
    const r = drawAt(BASE, pose, {
      time: t,
      facing: -1,
      talking: f >= 12,
      tailFlick: f > 60 && f < 64,
      id: "dialogue",
    });
    const p = tipOf(r.ops);
    if (prev) worst = Math.max(worst, Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
    t += 1 / 60;
  }
  check(worst <= 5, "walk→sit→talk+flick never moves the tip more than 5px per frame", `worst ${worst.toFixed(2)}px`);

  // convergence: 0.5s after the pose change the tail has arrived at the sit shape
  resetTailStates();
  for (let f = 0; f < 30; f++) drawAt(BASE, "sit", { time: 5 + f / 60, id: "converge" });
  const a = tipOf(drawAt(BASE, "sit", { time: 5 + 30 / 60, id: "converge" }).ops);
  resetTailStates();
  const target = tipOf(drawAt(BASE, "sit", { time: 5 + 30 / 60, id: "target" }).ops);
  check(Math.hypot(a[0] - target[0], a[1] - target[1]) < 0.5, "the tail settles onto its target shape within half a second", `${Math.hypot(a[0] - target[0], a[1] - target[1]).toFixed(3)}px`);

  // random-state stress: the tail never disappears, flickers off, or explodes
  resetTailStates();
  let missing = 0;
  let thin = 0;
  let jump = 0;
  let last: [number, number] | null = null;
  let tt = 10;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let f = 0; f < 900; f++) {
    const pose = ALL_POSES[Math.floor(rnd() * ALL_POSES.length)]!;
    const r = drawAt(BASE, pose, {
      time: tt,
      facing: rnd() < 0.5 ? -1 : 1,
      talking: rnd() < 0.5,
      tailFlick: rnd() < 0.2,
      id: "stress",
    });
    const tails = tailStrokes(r.ops);
    if (tails.length !== 1) missing++;
    else if ((tails[0]!.width ?? 0) < 3.2) thin++;
    // LOCAL (body-relative) coordinates: a facing flip mirrors the whole sprite
    // in one frame, which is correct and must not be counted as a tail jump
    const p = localTipOf(r.ops);
    if (last) {
      const d = Math.hypot(p[0] - last[0], p[1] - last[1]);
      if (d > 5) jump++;
    }
    last = p;
    tt += 1 / 60;
  }
  check(missing === 0, "900 random state changes: the tail is always drawn (never disappears)", `${missing} frames missing`);
  check(thin === 0, "the tail never thins to an invisible sliver", `${thin} frames`);
  check(jump === 0, "the tail never jumps while the cat keeps facing the same way", `${jump} jumps`);
}

console.log("\n--- 5. tail marking + tail accessories stay ON the tail (§21) ---");
{
  const mk: CatSkin = { ...BASE, markings: ["tailtip"] };
  let detached = 0;
  const detail: string[] = [];
  for (const pose of ALL_POSES) {
    resetTailStates();
    const r = drawAt(mk, pose, { id: `cap:${pose}` });
    const tail = tailStrokes(r.ops)[0]!;
    const cap = r.ops.filter((o) => o.kind === "stroke" && o.style.includes("244, 238, 226")).pop();
    if (!cap) {
      detached++;
      detail.push(`${pose}: no tail-tip cap`);
      continue;
    }
    const gap = Math.hypot(cap.pts[cap.pts.length - 2]! - tail.pts[tail.pts.length - 2]!, cap.pts[cap.pts.length - 1]! - tail.pts[tail.pts.length - 1]!);
    if (gap > 1.5) {
      detached++;
      detail.push(`${pose}: cap ${gap.toFixed(1)}px off the tail tip`);
    }
  }
  check(detached === 0, `the pale tail-tip caps the real tail in all ${ALL_POSES.length} poses (was detached/missing)`, detail[0]);

  // tail accessories are anchored to the tail base, including mid-transition
  let worstAcc = 0;
  for (const accId of ["band", "ribbon", "bow", "flower", "feather", "berries", "wrap", "leaf", "tuft"]) {
    const skin: CatSkin = { ...BASE, acc: { tail: accId } };
    resetTailStates();
    let t = 7;
    for (let f = 0; f < 90; f++) {
      const pose: CatPose = f < 20 ? "walk" : "sit";
      const r = drawAt(skin, pose, { time: t, tailFlick: f % 30 === 0, id: `acc:${accId}` });
      const tail = tailStrokes(r.ops)[0]!;
      const base = [tail.pts[0]!, tail.pts[1]!];
      // every extra op this accessory adds must start near the tail base
      const extra = r.ops.filter((o) => o.kind === "fill" || (o.kind === "stroke" && o.width < 3.2));
      for (const o of extra) {
        const d = Math.hypot((o.pts[0] ?? 0) - base[0]!, (o.pts[1] ?? 0) - base[1]!);
        if (o.pts.length && d < 22) worstAcc = Math.max(worstAcc, d);
      }
      t += 1 / 60;
    }
  }
  check(worstAcc <= 22, "tail accessories sit on the tail base through a transition", `max ${worstAcc.toFixed(1)}px`);

  // layering: the body is painted AFTER the tail, so the tail base is covered
  resetTailStates();
  const r = drawAt(BASE, "sit", { id: "layer" });
  const tailIdx = tailStrokes(r.ops)[0]!.index;
  const bodyIdx = r.ops.findIndex((o) => o.kind === "fill" && o.style === BASE.fur);
  check(bodyIdx > tailIdx, "the body layer is painted over the tail base (correct layering)", `tail@${tailIdx} body@${bodyIdx}`);
}

console.log("\n--- 6. size / partial-skin safety (§6/§7) ---");
{
  // a bigger cat has a bigger tail (scales with `size`)
  resetTailStates();
  const small = tailStrokes(drawAt(BASE, "walk", { size: 1, id: "size" }).ops)[0]!;
  resetTailStates();
  const big = tailStrokes(drawAt(BASE, "walk", { size: 1.05, id: "size" }).ops)[0]!;
  const dSmall = Math.hypot(small.pts[0]! - 100, small.pts[0]! * 0 + (small.pts[1]! - 100));
  const dBig = Math.hypot(big.pts[0]! - 100, big.pts[1]! - 100);
  check(Math.abs(dBig / dSmall - 1.05) < 0.01, "the tail scales with the cat (size 1 → 1.05)", `ratio ${(dBig / dSmall).toFixed(3)}`);

  // an EMPTY/partial skin renders the default cat instead of throwing — the
  // first frame used to throw, which killed the editor's rAF loop for good
  let threw = 0;
  let blank = 0;
  for (const pose of ALL_POSES) {
    for (const skin of [{}, { fur: "#d96b2f" }, { furDark: "#000" }] as unknown as CatSkin[]) {
      resetTailStates();
      try {
        const r = drawAt(skin, pose, { id: "partial" });
        if (tailStrokes(r.ops).length !== 1) blank++;
      } catch {
        threw++;
      }
    }
  }
  check(threw === 0, "a partial/empty skin never throws (editor preview survives)", `${threw} throws`);
  check(blank === 0, "a partial skin still renders a complete cat with a tail", `${blank} blank`);

  // the controller's state is bounded (no leak over a long session)
  resetTailStates();
  for (let i = 0; i < 800; i++) drawAt(BASE, "sit", { id: `leak:${i}` });
  check(tailStateCount() <= 260, "tail controller state stays bounded (no leak)", `${tailStateCount()} tracked`);
}

console.log("\n--- 7. the editor's LIVE preview really shows the cat (§6/§7/§8) ---");
{
  // The preview draws through the same call the editor makes: a size/130 scale
  // onto a size × size*0.85 canvas, ground point at (65, height/scale - N) with
  // N read from the editor itself so this test can never drift from the code.
  const editorSrc = fs.readFileSync("src/pages/CatCustomizer.tsx", "utf8");
  const headRoom = Number(/canvas\.height \/ scale - (\d+)/.exec(editorSrc)?.[1] ?? NaN);
  check(Number.isFinite(headRoom) && headRoom >= 10, "the editor's preview stage keeps tail head-room", `offset=${headRoom}`);
  const previewBox = (size: number, skin: CatSkin) => {
    resetTailStates();
    const r = makeCtx();
    const scale = size / 130;
    const h = size * 0.85;
    r.ctx.setTransform(1, 0, 0, 1, 0, 0);
    r.ctx.scale(scale, scale);
    drawCat(r.ctx, skin, 65, h / scale - headRoom, 1, "sit", 1.4, 0, { tailId: "editor:preview" });
    const xs: number[] = [];
    const ys: number[] = [];
    for (const o of r.ops) {
      for (let i = 0; i + 1 < o.pts.length; i += 2) {
        xs.push(o.pts[i]!);
        ys.push(o.pts[i + 1]!);
      }
    }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), w: size, h };
  };
  let clipped = 0;
  let tiny = 0;
  const detail: string[] = [];
  for (const size of [150, 240, 320, 420]) {
    for (const skin of [normalizeSkin({}), normalizeSkin({ fur: "#2b2b33", tail: "long", acc: { neck: "collar-red" } })] as CatSkin[]) {
      const b = previewBox(size, skin);
      if (b.minX < -1 || b.minY < -1 || b.maxX > size + 1 || b.maxY > b.h + 1) {
        clipped++;
        detail.push(`size ${size}: box ${b.minX.toFixed(0)},${b.minY.toFixed(0)}→${b.maxX.toFixed(0)},${b.maxY.toFixed(0)}`);
      }
      if (b.maxY - b.minY < b.h * 0.15) tiny++;
    }
  }
  check(clipped === 0, "the preview cat is fully inside the stage at every editor size (never clipped)", detail[0]);
  check(tiny === 0, "the preview cat is big enough to read (never a speck)");

  const editor = fs.readFileSync("src/pages/CatCustomizer.tsx", "utf8");
  check(
    /<CatPreviewLarge skin=\{skin\} pose=\{pose\} size=\{previewSize\} \/>/.test(editor),
    "the preview is fed the editor's live skin (so an option change redraws it)",
  );
  // §6: the preview canvas must sit ABOVE the decorative stage panel
  check(
    /<canvas ref=\{canvasRef\} width=\{size\} height=\{size \* 0\.85\} className="relative z-10 h-full w-full" \/>/.test(editor) &&
      /absolute inset-0 rounded-3xl bg-gradient-to-b/.test(editor),
    "the preview canvas is layered above the stage background (never covered by UI)",
  );

  // §9: the preview is animated — breathing/bob, blinking and a live tail — and
  // animating it never mutates the cat it is showing
  const eyeRyAt = (ops: Op[], eyeColor: string): number => {
    const o = ops.find((x) => x.kind === "fill" && x.style === eyeColor && x.path === "ellipse");
    return o?.pts[3] ?? NaN;
  };
  const previewSkin: CatSkin = normalizeSkin({ fur: "#d96b2f", furDark: "#b04f1d", eye: "#4fae6e", tail: "normal" });
  const snapshot = JSON.stringify(previewSkin);
  resetTailStates();
  let topLo = Infinity;
  let topHi = -Infinity;
  let blinked = false;
  let baseRy = NaN;
  let tailLo = Infinity;
  let tailHi = -Infinity;
  for (let f = 0; f < 420; f++) {
    const r = drawAt(previewSkin, "sit", { time: f / 60, id: "editor:preview" });
    const top = Math.min(...r.ops.flatMap((o) => o.pts.filter((_, i) => i % 2 === 1)));
    topLo = Math.min(topLo, top);
    topHi = Math.max(topHi, top);
    const ry = eyeRyAt(r.ops, previewSkin.eye);
    if (Number.isNaN(baseRy)) baseRy = ry;
    else if (Math.abs(ry - baseRy) > 0.3) blinked = true;
    const ty = tipOf(r.ops)[1];
    tailLo = Math.min(tailLo, ty);
    tailHi = Math.max(tailHi, ty);
  }
  check(tailHi - tailLo > 3, "preview: the tail is visibly alive", `${(tailHi - tailLo).toFixed(2)}px`);
  check(topHi - topLo > 0.4, "preview: the cat breathes / bobs (idle body motion)", `${(topHi - topLo).toFixed(2)}px`);
  check(blinked, "preview: the cat blinks (eye animation)", `base ry=${baseRy}`);
  check(JSON.stringify(previewSkin) === snapshot, "animating the preview never mutates the saved appearance (§9)");
  check(
    /function useRenderEffect\(fn: \(\) => void \| \(\(\) => void\)\) \{\n  const cleanupRef = useRef<\(\(\) => void\) \| void>\(undefined\);\n  useEffect\(\(\) => \{/.test(editor),
    "the preview effect re-runs after EVERY render (no stale closure)",
  );
  check(/normalizeSkin\(initialSkin\) as CustomSkin/.test(editor), "the editor starts from a renderable cat, never `{}`");
}

console.log("\n--- 8. every caller feeds the controller a stable id (§4/§30) ---");
{
  const engine = fs.readFileSync("src/game/engine.ts", "utf8");
  const menu = fs.readFileSync("src/game/menuScene.ts", "utf8");
  const ui = fs.readFileSync("src/pages/gameUi.tsx", "utf8");
  const editor = fs.readFileSync("src/pages/CatCustomizer.tsx", "utf8");
  check(/tailId: "player"/.test(engine), "the local player's cat has its own tail state");
  check(/tailId: `npc:\$\{n\.def\.id\}`/.test(engine), "every NPC has its own tail state");
  check(/tailId: `p:\$\{r\.userId\}`/.test(engine), "every remote player has its own tail state");
  check(/tailId: `menu:/.test(menu), "the menu scene cats have their own tail state");
  check(/tailId: `portrait:/.test(ui), "the NPC portrait has its own tail state");
  check(/tailId: "editor:preview"/.test(editor), "the customization preview has its own tail state");
  check(!/tail flick: drawn OUTSIDE the mirrored transform/.test(fs.readFileSync("src/game/draw.ts", "utf8")), "the old second (unmirrored) tail stroke is gone");
}

console.log(failures === 0 ? "\nALL TAIL CHECKS PASS" : `\n${failures} TAIL CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

// Sprite-alignment / layering acceptance suite for the cat renderer.
//
// Reproduces the two reported defect classes in the customization + game cats:
//
//  A. ATTACHMENT — head-acting (nod / shake / look / sniff) was implemented as a
//     canvas translate that wrapped the REST OF THE CAT, so body-anchored layers
//     (chest/belly/leg markings, collars, back/paw items) and the tail slid off
//     their attachments whenever the head moved. The fix folds the offset into
//     the head's own anchor (headX/headY) so only head-anchored parts move.
//  B. DEPTH — the tail was drawn behind the body but its accessory (band/bow/…)
//     was drawn LAST, on top of the whole cat, so it floated in front of the
//     body/legs. Tail layers now share the tail's depth.
//
// Everything drives the REAL renderer (drawCat) through a recording canvas that
// evaluates the full transform stack, so the numbers are body-local coordinates.
//
// Run: bun scripts/check-align.ts

import fs from "node:fs";
import { drawCat, normalizeSkin, type CatPose, type CatSkin } from "../src/game/draw";
import { resetTailStates } from "../src/game/tail";

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  if (ok) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

// ---------------------------------------------------------------------------
// Recording canvas (applies the transform stack; `local` = body-relative).
// ---------------------------------------------------------------------------
interface Op {
  kind: "stroke" | "fill";
  path: "quad" | "ellipse" | "rect" | "arc" | "other";
  pts: number[];
  local: number[];
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
    ops.push({ kind, path, pts: [...pts], local: [...localPts], style: kind === "fill" ? fillStyle : strokeStyle, width, index: ops.length });
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
    fillRect() {}, strokeRect() {}, fill() { rec("fill"); }, stroke() { rec("stroke"); }, clip() {}, closePath() {},
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

function drawAt(skin: CatSkin, pose: CatPose, fx: Record<string, unknown> = {}, time = 0.37): Op[] {
  resetTailStates();
  const r = makeCtx();
  drawCat(r.ctx, normalizeSkin(skin), 0, 0, 1, pose, time, 0, fx);
  return r.ops;
}
const opWith = (ops: Op[], pred: (o: Op) => boolean): Op | undefined => ops.find(pred);
/** Position of a marked op in BODY-local space. */
const at = (o: Op | undefined): [number, number] => [o?.local[0] ?? NaN, o?.local[1] ?? NaN];
const moved = (a: [number, number], b: [number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

const FULL: CatSkin = {
  fur: "#d96b2f", furDark: "#b04f1d", eye: "#4fae6e", chest: "#f4e9d8",
  pattern: "solid", furLength: 1, tail: "normal", ears: "normal", size: 1, scar: false,
  markings: ["chest", "belly", "paws", "socks", "blaze", "muzzle"], scars: ["leg", "shoulder"],
  acc: { neck: "collar-red", body: "satchel", paw: "band-gold", tail: "bow", head: "flower", ear: "flower" },
};

// body-anchored probe ops (must NOT move with the head)
const chestMark = (ops: Op[]) => at(opWith(ops, (o) => o.kind === "fill" && o.style.includes("244, 238, 226") && o.path === "ellipse" && o.local[2] === 4.5));
const bellyMark = (ops: Op[]) => at(opWith(ops, (o) => o.kind === "fill" && o.style.includes("244, 238, 226") && o.path === "ellipse" && o.local[2] === 6.5 && o.local[3] === 2.2));
const collar = (ops: Op[]) => at(opWith(ops, (o) => o.kind === "stroke" && o.style === "#c23a3a"));
const tailBow = (ops: Op[]) => at(opWith(ops, (o) => o.kind === "fill" && o.path === "other" && o.local.length === 12 && (o.local[0] ?? 0) < -8));
// head-anchored probe ops (must MOVE with the head)
const headCircle = (ops: Op[]) => at(opWith(ops, (o) => o.kind === "fill" && o.path === "arc" && o.local[2] === 6.5));
const muzzleMark = (ops: Op[]) => at(opWith(ops, (o) => o.kind === "fill" && o.style.includes("244, 238, 226") && o.path === "ellipse" && o.local[2] === 3.2));

console.log("\n--- 1. head-acting moves ONLY the head (attachment points) ---");
{
  const still = drawAt(FULL, "sit", {});
  const nod = drawAt(FULL, "sit", { head: "nod" }, 0.37); // |sin(1.554)|·2.2 ≈ 2.2px down
  // head-anchored parts move by the head offset
  const dh = moved(headCircle(still), headCircle(nod));
  check(dh > 1.5, "the head (and its features) moves on a nod", `${dh.toFixed(2)}px`);
  const dm = moved(muzzleMark(still), muzzleMark(nod));
  check(Math.abs(dm - dh) < 0.05, "a face marking rides the head exactly", `mark ${dm.toFixed(2)} vs head ${dh.toFixed(2)}`);

  // body-anchored parts must stay put
  check(moved(chestMark(still), chestMark(nod)) < 0.01, "the chest marking stays on the chest", `drift ${moved(chestMark(still), chestMark(nod)).toFixed(3)}px`);
  check(moved(bellyMark(still), bellyMark(nod)) < 0.01, "the belly marking stays on the belly", `drift ${moved(bellyMark(still), bellyMark(nod)).toFixed(3)}px`);
  check(moved(collar(still), collar(nod)) < 0.01, "the collar wraps the neck (does not ride the head)", `drift ${moved(collar(still), collar(nod)).toFixed(3)}px`);
  check(moved(tailBow(still), tailBow(nod)) < 0.01, "the tail bow stays on the tail", `drift ${moved(tailBow(still), tailBow(nod)).toFixed(3)}px`);

  // every head fx behaves the same way, in every pose
  let worstBody = 0;
  let minHead = Infinity;
  // poses that draw the body markings tested above (swim/lying skip them)
  const poses: CatPose[] = ["sit", "walk", "crouch", "groom", "stretch"];
  for (const pose of poses) {
    for (const fx of [{ head: "nod" }, { head: "shake" }, { head: "look" }, { head: "sniff" }]) {
      const a = drawAt(FULL, pose, {});
      const b = drawAt(FULL, pose, fx as Record<string, unknown>);
      worstBody = Math.max(worstBody, moved(chestMark(a), chestMark(b)), moved(collar(a), collar(b)), moved(tailBow(a), tailBow(b)));
      minHead = Math.min(minHead, moved(headCircle(a), headCircle(b)));
    }
  }
  check(worstBody < 0.01, "no head fx drags a body/collar layer in any pose", `worst ${worstBody.toFixed(3)}px`);
  check(minHead > 0.4, "the head still acts in every pose", `min ${minHead.toFixed(2)}px`);
}

console.log("\n--- 2. layering / depth (the base body is the base, tail behind) ---");
{
  const ops = drawAt(FULL, "sit", {});
  // exactly one base body ellipse and one head — no duplicated base sprites
  const bodies = ops.filter((o) => o.kind === "fill" && o.style === FULL.fur && o.path === "ellipse" && o.local[2] === 9 && o.local[3] === 11);
  const heads = ops.filter((o) => o.kind === "fill" && o.path === "arc" && o.local[2] === 6.5);
  check(bodies.length === 1, "exactly one base body sprite is drawn (never duplicated)", `${bodies.length}`);
  check(heads.length === 1, "exactly one head sprite is drawn (never duplicated)", `${heads.length}`);

  const bodyIdx = bodies[0]!.index;
  const tailIdx = ops.findIndex((o) => o.kind === "stroke" && o.width >= 3.2 && !o.style.includes("244, 238, 226"));
  check(tailIdx >= 0 && tailIdx < bodyIdx, "the tail is behind the body", `tail@${tailIdx} body@${bodyIdx}`);
  const bowIdx = opWith(ops, (o) => o.kind === "fill" && o.local.length === 12 && (o.local[0] ?? 0) < -8)!.index;
  check(bowIdx < bodyIdx, "the tail accessory shares the tail's depth (behind the body)", `bow@${bowIdx} body@${bodyIdx}`);

  // the base body is opaque and large: it covers a real area of the sprite
  check(bodies[0]!.local[2]! * bodies[0]!.local[3]! > 90, "the base body is a full-size sprite, not a sliver");
}

console.log("\n--- 3. the editor preview shows the whole, centred cat ---");
{
  const editor = fs.readFileSync("src/pages/CatCustomizer.tsx", "utf8");
  const m = /const scale = size \/ (\d+);/.exec(editor);
  const design = Number(m?.[1] ?? NaN);
  check(Number.isFinite(design) && design > 0, "the preview scale is a named design box", `size/${design}`);
  const headRoom = Number(/canvas\.height \/ scale - (\d+)/.exec(editor)?.[1] ?? NaN);
  check(Number.isFinite(headRoom) && headRoom >= 10, "the preview keeps vertical head-room");

  const box = (size: number, skin: CatSkin, pose: CatPose) => {
    resetTailStates();
    const r = makeCtx();
    const scale = size / design;
    const h = size * 0.85;
    r.ctx.setTransform(1, 0, 0, 1, 0, 0);
    r.ctx.scale(scale, scale);
    drawCat(r.ctx, normalizeSkin(skin), 65, h / scale - headRoom, 1, pose, 1.4, 0, { tailId: "editor:preview" });
    const xs: number[] = [];
    const ys: number[] = [];
    for (const o of r.ops) for (let i = 0; i + 1 < o.pts.length; i += 2) { xs.push(o.pts[i]!); ys.push(o.pts[i + 1]!); }
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), w: size, h };
  };
  const poses: CatPose[] = ["sit", "walk", "sleep", "swim", "groom", "stretch", "crouch", "shake", "dance1"];  let clipped = 0;
  const bad: string[] = [];
  for (const size of [150, 240, 320, 420]) {
    for (const pose of poses) {
      const b = box(size, FULL, pose);
      if (b.minX < -1 || b.minY < -1 || b.maxX > size + 1 || b.maxY > b.h + 1) {
        clipped++;
        bad.push(`${pose}@${size}: ${b.minX.toFixed(0)},${b.minY.toFixed(0)} → ${b.maxX.toFixed(0)},${b.maxY.toFixed(0)} in ${size}×${b.h.toFixed(0)}`);
      }
    }
  }
  check(clipped === 0, "the preview cat is fully inside the stage in every pose/size (never clipped)", bad[0]);
  // centred on the BODY (its ground anchor sits on the stage's horizontal centre)
  let worstOff = 0;
  for (const size of [150, 240, 320, 420]) {
    for (const pose of poses) {
      resetTailStates();
      const r = makeCtx();
      const scale = size / design;
      r.ctx.setTransform(1, 0, 0, 1, 0, 0);
      r.ctx.scale(scale, scale);
      drawCat(r.ctx, FULL, 65, (size * 0.85) / scale - headRoom, 1, pose, 1.4, 0, { tailId: "editor:preview" });
      const body = r.ops.filter((o) => o.kind === "fill" && o.style === FULL.fur && o.path === "ellipse").sort((a, b) => (b.local[2]! * b.local[3]!) - (a.local[2]! * a.local[3]!))[0];
      worstOff = Math.max(worstOff, Math.abs((body?.pts[0] ?? -1) - size / 2) / size);
    }
  }
  check(worstOff < 0.06, "the preview cat is centred on the stage (body anchor on the centre line)", `worst ${(worstOff * 100).toFixed(1)}%`);
}

console.log("\n--- 4. the item thumbnails show the whole cat (never cut feet/tail off) ---");
{
  const editor = fs.readFileSync("src/pages/CatCustomizer.tsx", "utf8");
  const dm = /drawCat\(ctx, normalizeSkin\(skin\), (\d+), (\d+), 1, "sit"/.exec(editor);
  const thumbScale = /ctx\.scale\((\d+) \/ (\d+), (\d+) \/ (\d+)\);/.exec(editor);
  check(!!dm && !!thumbScale, "the item thumbnail draws the real cat at a known transform");
  if (dm && thumbScale) {
    const cx = Number(dm[1]);
    const cy = Number(dm[2]);
    const num = Number(thumbScale[1]);
    const den = Number(thumbScale[2]);
    const cw = 72;
    const ch = 58;
    const localW = cw / (num / den);
    const localH = ch / (num / den);
    // the cat's canonical box (see drawCat) is x[-26,26], y[-34,12] about (0,0)
    const fits = cx - 26 >= -1 && cx + 26 <= localW + 1 && cy - 34 >= -1 && cy + 12 <= localH + 1;
    check(fits, "the item thumbnail cat is fully inside its canvas", `box x[${cx - 26},${cx + 26}] y[${cy - 34},${cy + 12}] in ${localW.toFixed(0)}×${localH.toFixed(0)}`);
  }
}

console.log(failures === 0 ? "\nALL ALIGNMENT CHECKS PASS" : `\n${failures} ALIGNMENT CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

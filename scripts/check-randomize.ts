// Randomize acceptance suite (PART A + PART C of the customization repair).
//
// RANDOMIZE must produce a properly ASSEMBLED cat, every single time, through
// the same appearance model as the preview and the save system:
//
//   1. CATALOG <-> RENDERER agreement: every value the randomizer can pick is a
//      real catalog value AND is actually drawn by `drawCat` (no "valid" id the
//      renderer would silently ignore).
//   2. 30 consecutive rolls (chained, from varied starting skins — a WARRIORS
//      preset look, a bare skin, and the previous roll) are each:
//        - catalog-valid: no unknown ids, no duplicate slots, tints only for
//          equipped slots, heterochromia only when the eyes differ;
//        - assembled: exactly ONE base body + ONE head, no NaN, no op outside
//          the cat's own sprite box (nothing scattered), in every pose;
//        - attached + correctly layered: every equipped accessory lands on the
//          part it belongs to, its markings decorate the region they name, the
//          tail accessory shares the tail's depth (behind the body) and the
//          collar/back/paw art sits ON the body;
//        - identity-clean: a rolled look never keeps another cat's preset/morph
//          tag or a stale pale chest band.
//   3. SAVE ROUND TRIP (one model, end to end): a rolled look passes the REAL
//      server validator, is written by the REAL mutation, reloads byte-identical
//      through the client's load path, and still renders as exactly one
//      assembled cat.
//
// Everything drives the REAL renderer through a recording canvas that evaluates
// the full transform stack, so all coordinates are body-local.
//
// Run: bun scripts/check-randomize.ts

import fs from "node:fs";
import { drawCat, normalizeSkin, type CatPose, type CatSkin } from "../src/game/draw";
import { resetTailStates } from "../src/game/tail";
import { fullSkin } from "../src/pages/gameUi";
import { appearanceVersion } from "../src/game/saveShared";
import {
  CAT_ITEMS,
  COAT_COLORS,
  EYE_COLORS,
  ACCESSORY_COLORS,
  ACC_SLOT_CATS,
  accessoryValues,
  accessoriesFor,
  itemInSlot,
  randomSkin,
  sanitizeSkin,
  PATTERN_IDS,
  TAIL_IDS,
  EAR_IDS,
  NOSE_IDS,
  FACE_IDS,
  MARKING_IDS,
  SCAR_IDS,
  FUR_STYLES,
  type AccessorySlot,
  type CustomSkin,
} from "../src/game/catItems";
import { CHARACTER_PRESETS } from "../src/game/presets";
import { getPlayer, ensurePlayer } from "../src/convex/players";
import { saveAppearance as saveAppearanceFn } from "../src/convex/customization";

let failures = 0;
function check(ok: boolean, label: string, detail = "") {
  if (ok) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

const SLOTS: AccessorySlot[] = ["head", "ear", "neck", "body", "paw", "tail"];
const PREFIX: Record<AccessorySlot, string> = { head: "hd-", ear: "er-", neck: "nk-", body: "bd-", paw: "pw-", tail: "tl-" };

// ---------------------------------------------------------------------------
// Recording canvas (applies the transform stack; `local` = body-relative)
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
function makeCtx() {
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
      const cos = Math.cos(r), sin = Math.sin(r);
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
    fillRect(x: number, y: number, w: number, h: number) {
      // rect fills are a REAL draw op (paw bands, white paw/socks/nose markings)
      pts = [];
      localPts = [];
      pts.push(...ap(x, y), w, h);
      localPts.push(x, y, w, h);
      path = "rect";
      rec("fill");
    },
    strokeRect() {}, fill() { rec("fill"); }, stroke() { rec("stroke"); }, clip() {}, closePath() {},
    setLineDash() {},
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

function drawAt(skin: CatSkin, pose: CatPose, time = 1.4): Op[] {
  resetTailStates();
  const r = makeCtx();
  drawCat(r.ctx, normalizeSkin(skin), 0, 0, 1, pose, time, 0, { tailId: "randomize:probe" });
  return r.ops;
}

interface Box { minX: number; minY: number; maxX: number; maxY: number; n: number }
// `pts` are the TRANSFORMED points (the draw happens at (0,0) with unit scale,
// so they ARE body-local). `local` is what the artist wrote — for art drawn
// inside its own translate (the moth/butterfly) that is NOT a position, so every
// position test uses `pts`. Extremes (radii/lengths) are excluded per shape.
const locOf = (o: Op): number[] => {
  if (o.path === "ellipse" || o.path === "rect") return o.pts.slice(0, 2);
  if (o.path === "arc") return o.pts.slice(0, 2);
  return o.pts.slice();
};
const boxOf = (ops: Op[]): Box => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
  for (const o of ops) {
    const pts = locOf(o);
    for (let i = 0; i + 1 < pts.length; i += 2) {
      minX = Math.min(minX, pts[i]!); maxX = Math.max(maxX, pts[i]!);
      minY = Math.min(minY, pts[i + 1]!); maxY = Math.max(maxY, pts[i + 1]!);
      n++;
    }
  }
  return { minX, minY, maxX, maxY, n };
};
/** The point an op is anchored at: an arc/ellipse centre (its first point), a
 *  rect's centre. Radii/widths are NOT positions — averaging them in would drag
 *  the "position" of a multi-arc accessory art off to nowhere. */
const anchorOf = (o: Op): [number, number] =>
  o.path === "rect" && o.pts.length >= 4
    ? [o.pts[0]! + o.pts[2]! / 2, o.pts[1]! + o.pts[3]! / 2]
    : [o.pts[0] ?? NaN, o.pts[1] ?? NaN];
const centroid = (ops: Op[]): [number, number] => {
  let sx = 0, sy = 0, n = 0;
  for (const o of ops) { const [x, y] = anchorOf(o); sx += x; sy += y; n++; }
  return n ? [sx / n, sy / n] : [NaN, NaN];
};
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const near = (o: Op, p: [number, number], r: number) => dist(centroid([o]), p) <= r;

/** The cat's canonical sprite box (see drawCat): nothing may sit outside it. */
const BOX = { minX: -34, minY: -44, maxX: 34, maxY: 24 };
const fitsCanonicalBox = (b: Box) => b.minX >= BOX.minX && b.minY >= BOX.minY && b.maxX <= BOX.maxX && b.maxY <= BOX.maxY;

const baseBodies = (ops: Op[], fur: string) =>
  ops.filter((o) => o.kind === "fill" && o.style === fur && o.path === "ellipse");
/** Geometry signature — a sprite drawn TWICE shows up as a repeated signature
 *  (a legit extra fur ellipse, e.g. the thick-coat shag, never satisfies it). */
const geometryOf = (o: Op) => o.local.slice(0, 4).map((v) => v.toFixed(1)).join(",");
const noDuplicateBodies = (bodies: Op[]) => bodies.length >= 1 && new Set(bodies.map(geometryOf)).size === bodies.length;
const heads = (ops: Op[]) => ops.filter((o) => o.kind === "fill" && o.path === "arc" && o.local[2] === 6.5);
const sig = (o: Op) => `${o.kind}|${o.path}|${o.local.map((v) => v.toFixed(2)).join(",")}|${o.style}`;
/** Ops present in `full` but not in `plain` — i.e. exactly one slot's art. */
function addedOps(full: Op[], plain: Op[]): Op[] {
  const counts = new Map<string, number>();
  for (const o of plain) counts.set(sig(o), (counts.get(sig(o)) ?? 0) + 1);
  const out: Op[] = [];
  for (const o of full) {
    const c = counts.get(sig(o)) ?? 0;
    if (c > 0) counts.set(sig(o), c - 1);
    else out.push(o);
  }
  return out;
}
const withoutSlot = (skin: CustomSkin, slot: AccessorySlot): CustomSkin => {
  const acc = { ...(skin.acc ?? {}) };
  delete acc[slot];
  const accColors = { ...(skin.accColors ?? {}) };
  delete accColors[slot];
  return { ...skin, acc, accColors };
};

// ---------------------------------------------------------------------------
// 1. the randomizer's pool == the renderer's vocabulary
// ---------------------------------------------------------------------------
console.log("\n--- 1. every catalog value the randomizer can pick is really drawn ---");
{
  // BEHAVIOURAL, not a scrape: put the value on a plain cat and prove the
  // renderer draws something different for it. That is the real question ("can
  // the randomizer equip an id that renders as nothing?"), and it cannot be
  // fooled by how the renderer happens to spell its conditionals.
  const PLAIN: CatSkin = { fur: "#c9c2b8", furDark: "#8f8f96", eye: "#4fae6e", pattern: "solid", furLength: 1, tail: "normal", ears: "normal", size: 1, scar: false };
  // width matters: the slim/fluffy tails share one curve and differ only in
  // stroke weight, so a signature without it would call them "not drawn"
  const opSignature = (ops: Op[]) => ops.map((o) => `${o.kind}${o.path}${o.width}${o.local.map((v) => v.toFixed(2)).join(",")}${o.style}`).join(";");
  const plainSig = opSignature(drawAt(PLAIN, "sit"));
  const draws = (variant: Partial<CatSkin>) => opSignature(drawAt({ ...PLAIN, ...variant }, "sit")) !== plainSig;

  const notDrawn: string[] = [];
  let values = 0;
  for (const slot of SLOTS) {
    const catalog = accessoryValues(slot);
    check(catalog.length >= 5, `slot "${slot}" offers ${catalog.length} catalog items`);
    for (const v of catalog) {
      values++;
      if (!draws({ acc: { [slot]: v } as CatSkin["acc"] })) notDrawn.push(`${slot}:${v}`);
    }
  }
  check(
    notDrawn.length === 0,
    "every catalog accessory value has real renderer art (no silently ignored ids)",
    notDrawn.join(", ") || `${values} accessory values`,
  );

  const vocab: [string, string[], (v: string) => Partial<CatSkin>][] = [
    ["pattern", PATTERN_IDS.filter((p) => p !== "solid"), (v) => ({ pattern: v })],
    ["tail shape", TAIL_IDS.filter((t) => t !== "normal"), (v) => ({ tail: v })],
    ["ear shape", EAR_IDS.filter((e) => e !== "normal"), (v) => ({ ears: v })],
    ["nose color", NOSE_IDS, (v) => ({ nose: v })],
    ["face marking", FACE_IDS, (v) => ({ face: v })],
    ["fur style", FUR_STYLES, (v) => ({ furStyle: v })],
    ["white marking", MARKING_IDS, (v) => ({ markings: [v] })],
    ["scar", SCAR_IDS, (v) => ({ scars: [v] })],
  ];
  for (const [label, list, variant] of vocab) {
    const missing = list.filter((v) => !draws(variant(v)));
    check(missing.length === 0, `every catalog ${label} is drawn by drawCat`, missing.join(", ") || `${list.length} values`);
  }
}

// ---------------------------------------------------------------------------
// 2. 30 consecutive rolls: valid, assembled, attached, correctly layered
// ---------------------------------------------------------------------------
console.log("\n--- 2. 30 consecutive randomizations stay properly assembled ---");
{
  const presetLook: CustomSkin = {
    ...(CHARACTER_PRESETS[0]!.skin as CustomSkin),
    morph: "morph-lion",
    presetId: CHARACTER_PRESETS[0]!.id,
    chest: "#f4e9d8",
    acc: { neck: "collar-blue", tail: "bow" },
    accColors: { neck: "#5b8fd6" },
  };
  const legacyLook: CustomSkin = { fur: "#8f8f96", furDark: "#5c5c60", eye: "#d9a83a" };
  const starts: (CustomSkin | undefined)[] = [undefined, presetLook, legacyLook];
  const withTailAcc: CustomSkin = {
    fur: "#a5622d", furDark: "#6e4220", eye: "#4fae6e", tail: "fluffy",
    markings: ["tailtip", "chest"], acc: { tail: "bow", neck: "collar-red" }, accColor: "#b07ad9",
  };

  const catalogAccValues = new Map<string, Set<string>>();
  for (const slot of SLOTS) catalogAccValues.set(slot, new Set(accessoryValues(slot)));
  const catalogItems = new Set(CAT_ITEMS.map((i) => i.id));

  let rolls = 0;
  let invalid = 0;
  let broken = 0;
  let detached = 0;
  let worstExtra = 0;
  const detail: string[] = [];
  const POSES: CatPose[] = ["sit", "walk", "sleep", "swim", "groom", "crouch", "stretch", "dance1"];

  let prev: CustomSkin | undefined = starts[0];
  for (let n = 0; n < 30; n++) {
    const base = n < 3 ? starts[n] : n === 7 ? withTailAcc : prev;
    const roll = randomSkin(base);
    prev = roll;
    rolls++;
    const problems: string[] = [];

    // --- 2a. catalog validity -------------------------------------------------
    if (!COAT_COLORS.some((c) => c.hex === roll.fur)) problems.push(`coat ${roll.fur} is not a palette color`);
    if (!EYE_COLORS.some((c) => c.hex === roll.eye)) problems.push(`eye ${roll.eye} is not a palette color`);
    if (!PATTERN_IDS.includes(roll.pattern ?? "")) problems.push(`pattern ${roll.pattern} is not in the catalog`);
    if (!TAIL_IDS.includes(roll.tail ?? "")) problems.push(`tail ${roll.tail} is not in the catalog`);
    if (!EAR_IDS.includes(roll.ears ?? "")) problems.push(`ears ${roll.ears} is not in the catalog`);
    if (roll.furStyle !== undefined && !FUR_STYLES.includes(roll.furStyle)) problems.push(`furStyle ${roll.furStyle}`);
    if (roll.nose !== undefined && !NOSE_IDS.includes(roll.nose)) problems.push(`nose ${roll.nose}`);
    if (roll.face !== undefined && !FACE_IDS.includes(roll.face)) problems.push(`face ${roll.face}`);
    for (const m of roll.markings ?? []) if (!MARKING_IDS.includes(m)) problems.push(`marking ${m}`);
    for (const s of roll.scars ?? []) if (!SCAR_IDS.includes(s)) problems.push(`scar ${s}`);
    if ((roll.markings ?? []).length !== new Set(roll.markings ?? []).size) problems.push("duplicate markings");
    if (roll.accColor !== undefined && !ACCESSORY_COLORS.includes(roll.accColor)) problems.push(`accColor ${roll.accColor}`);
    // one accessory per slot, every value rendered, tints only for equipped slots
    for (const slot of SLOTS) {
      const v = roll.acc?.[slot];
      if (v === undefined) {
        if (roll.accColors?.[slot] !== undefined) problems.push(`${slot}: tint without an item`);
        continue;
      }
      if (!catalogAccValues.get(slot)!.has(v)) problems.push(`${slot}: "${v}" is not a catalog item`);
      if (!catalogItems.has(PREFIX[slot] + v)) problems.push(`${slot}: "${v}" has no catalog entry`);
      const tint = roll.accColors?.[slot];
      if (tint !== undefined && !/#[0-9a-f]{6}/i.test(tint)) problems.push(`${slot}: bad tint ${tint}`);
    }
    if (Object.keys(roll.acc ?? {}).length > SLOTS.length) problems.push("more accessories than slots");
    if (roll.eye2 !== undefined && roll.eye2 === roll.eye) problems.push("heterochromia with identical eyes");
    if (roll.accColors && Object.keys(roll.accColors).some((k) => !SLOTS.includes(k as AccessorySlot))) problems.push("unknown tint slot");
    // the renderer + the save validator both need these exact fields
    const stored = normalizeSkin(roll as CatSkin);
    for (const f of ["fur", "furDark", "eye", "furLength", "size"] as const) {
      if (typeof (stored as Record<string, unknown>)[f] !== (f === "furLength" || f === "size" ? "number" : "string")) {
        problems.push(`${f} is missing/undefined`);
      }
    }
    // a rolled cat owns no other cat's identity
    if (roll.morph !== undefined || roll.presetId !== undefined) problems.push(`kept identity morph=${roll.morph} preset=${roll.presetId}`);

    // --- 2b. assembly + attachment (every pose) -------------------------------
    for (const pose of POSES) {
      let ops: Op[];
      try {
        ops = drawAt(roll as CatSkin, pose);
      } catch (err) {
        problems.push(`${pose}: drawCat threw (${String(err)})`);
        continue;
      }
      const nan = ops.filter((o) => o.local.some((v) => !Number.isFinite(v)));
      if (nan.length) problems.push(`${pose}: ${nan.length} ops with non-finite coordinates`);
      const bodies = baseBodies(ops, normalizeSkin(roll as CatSkin).fur);
      const headOps = heads(ops);
      if (!noDuplicateBodies(bodies)) {
        problems.push(`${pose}: ${bodies.length} base-body ellipses [${bodies.map(geometryOf).join(" | ")}]`);
      }
      if (headOps.length !== 1) problems.push(`${pose}: ${headOps.length} heads`);
      const biggest = bodies.slice().sort((a, b) => b.local[2]! * b.local[3]! - a.local[2]! * a.local[3]!)[0];
      if (biggest && biggest.local[2]! * biggest.local[3]! < 45) problems.push(`${pose}: the base body is a sliver (${biggest.local[2]}x${biggest.local[3]})`);
      if (pose === "sit" || pose === "walk") {
        const extra = boxOf(ops);
        const over = Math.max(BOX.minX - extra.minX, BOX.minY - extra.minY, extra.maxX - BOX.maxX, extra.maxY - BOX.maxY);
        worstExtra = Math.max(worstExtra, over);
        if (over > 0) problems.push(`${pose}: art escapes the cat's box by ${over.toFixed(1)}px`);
      }
    }

    // --- 2c. per-slot attachment points + depth (sit pose) --------------------
    const full = drawAt(roll as CatSkin, "sit");
    const body = baseBodies(full, normalizeSkin(roll as CatSkin).fur)[0];
    const head = heads(full)[0];
    const bodyIdx = body?.index ?? -1;
    const headIdx = head?.index ?? -1;
    const headC: [number, number] = [head?.pts[0] ?? NaN, head?.pts[1] ?? NaN];
    const bodyC: [number, number] = [body?.pts[0] ?? NaN, body?.pts[1] ?? NaN];
    const bodyR: [number, number] = [body?.local[2] ?? 9, body?.local[3] ?? 11];
    // the tail stroke is the first thick, non-marking stroke
    const tailStroke = full.find((o) => o.kind === "stroke" && o.width >= 3.2 && !o.style.includes("244, 238, 226"));
    const tailBase: [number, number] = [tailStroke?.pts[0] ?? NaN, tailStroke?.pts[1] ?? NaN];
    // learn the neck anchor by drawing the same cat with a red collar
    const neckProbe = drawAt({ ...(roll as CustomSkin), acc: { ...(roll.acc ?? {}), neck: "collar-red" } } as CatSkin, "sit");
    const neckOp = neckProbe.find((o) => o.kind === "stroke" && o.style === "#c23a3a");
    const neckC: [number, number] = [neckOp?.pts[0] ?? NaN, neckOp?.pts[1] ?? NaN];
    const inBodyEllipse = (p: [number, number], pad: number) =>
      Number.isFinite(p[0]) &&
      Math.hypot((p[0] - bodyC[0]) / (bodyR[0] + pad), (p[1] - bodyC[1]) / (bodyR[1] + pad)) <= 1.35;

    for (const slot of SLOTS) {
      if (!roll.acc?.[slot]) continue;
      const art = addedOps(full, drawAt(withoutSlot(roll, slot) as CatSkin, "sit"));
      if (!art.length) {
        problems.push(`${slot}: equipped "${roll.acc[slot]}" but nothing was drawn`);
        continue;
      }
      const c = centroid(art);
      const ok =
        slot === "head" || slot === "ear"
          ? dist(c, headC) <= 14
          : slot === "neck"
            ? dist(c, neckC) <= 13
            : slot === "tail"
              ? dist(c, tailBase) <= 14
              : inBodyEllipse(c, 5);
      if (!ok) {
        detached++;
        detail.push(
          `${slot}:${roll.acc[slot]} centroid (${c[0].toFixed(1)},${c[1].toFixed(1)}) vs head(${headC[0].toFixed(1)},${headC[1].toFixed(1)}) neck(${neckC[0].toFixed(1)},${neckC[1].toFixed(1)}) tail(${tailBase[0].toFixed(1)},${tailBase[1].toFixed(1)}) ops=[${art.slice(0, 6).map((o) => `${o.kind}${o.path}${o.local.slice(0, 4).map((v) => v.toFixed(1)).join(",")}${o.style}`).join(" ")}]`,
        );
      }
      if (slot === "tail") {
        if (art.some((o) => o.index > bodyIdx)) problems.push("tail accessory is drawn in front of the body");
      } else if (slot === "neck" || slot === "body" || slot === "paw") {
        if (art.some((o) => o.index < bodyIdx)) problems.push(`${slot} accessory is drawn behind the body`);
      } else if (art.some((o) => o.index < headIdx)) {
        problems.push(`${slot} accessory is drawn behind the head`);
      }
    }

    // --- 2d. markings decorate their own region ------------------------------
    const white = (o: Op) => o.style.includes("244, 238, 226");
    const plainNoMarks = drawAt({ ...(roll as CustomSkin), markings: [] } as CatSkin, "sit");
    const marks = addedOps(full, plainNoMarks).filter(white);
    const headMarks = new Set(["muzzle", "chin", "nose", "blaze", "ears"]);
    const bodyMarks = new Set(["chest", "belly", "paws", "socks"]);
    const wanted = (roll.markings ?? []).filter((m) => headMarks.has(m) || bodyMarks.has(m));
    const headMarkOps = marks.filter((o) => near(o, headC, 12));
    const bodyMarkOps = marks.filter((o) => !near(o, headC, 12));
    if (wanted.length) {
      if (!marks.length) problems.push(`markings [${wanted.join(",")}] drew nothing`);
      const headWant = wanted.filter((m) => headMarks.has(m));
      if (headWant.length && !headMarkOps.length) problems.push(`face/ear markings [${headWant.join(",")}] are not on the head`);
      const bodyWant = wanted.filter((m) => bodyMarks.has(m));
      if (bodyWant.length && !bodyMarkOps.length) problems.push(`body markings [${bodyWant.join(",")}] are not on the body`);
      for (const o of bodyMarkOps) {
        // ops drawn BEFORE the body belong to the tail layer: the pale tail-tip
        // legitimately caps the tail (it is not a body marking)
        if (o.index < bodyIdx) continue;
        if (!inBodyEllipse(centroid([o]), 4)) problems.push(`a body marking is drawn off the body (${centroid([o]).map((v) => v.toFixed(1)).join(",")})`);
      }
    }

    if (problems.length) {
      invalid++;
      broken++;
      detail.push(`roll ${n}: ${problems.slice(0, 3).join(" | ")}`);
    }
    console.log(
      `${String(n).padStart(2)} fur=${roll.fur} pat=${roll.pattern} ears=${roll.ears} tail=${roll.tail} mark=[${(roll.markings ?? []).join(",")}] acc=${JSON.stringify(roll.acc)} ${problems.length ? "❌" : "ok"}`,
    );
  }

  check(rolls === 30, "30 consecutive randomizations were rolled", `${rolls}`);
  check(invalid === 0, "every roll is catalog-valid (no unknown/undefined values, one item per slot)", detail[0]);
  check(broken === 0, "every roll renders as exactly one assembled cat in every pose", detail[0]);
  check(detached === 0, "every equipped accessory is anchored to its own part (nothing detached)", detail[0]);
  check(worstExtra <= 0, "no roll scatters art outside the cat's sprite box", `worst overflow ${worstExtra.toFixed(2)}px`);
}

// ---------------------------------------------------------------------------
// 3. the randomizer IS the preview/save model (no second implementation)
// ---------------------------------------------------------------------------
console.log("\n--- 3. randomize edits this cat through the shared model ---");
{
  const editor = fs.readFileSync("src/pages/CatCustomizer.tsx", "utf8");
  const calls = (editor.match(/randomSkin\(/g) ?? []).length;
  check(calls === 1, "the editor has exactly ONE randomizer call site", `${calls}`);
  check(/const rolled = sanitizeSkin\(randomSkin\(skin\)\)/.test(editor), "the roll is validated before it is applied");
  check(/setSkin\(rolled\)/.test(editor), "randomize writes the cat's appearance (never scatters sprites/camera/pose)");
  check(!/setFacing\(|setPose\(|ctx\.translate\(/.test(editor.slice(editor.indexOf("const randomize"), editor.indexOf("const savePreset"))), "randomize touches no camera/pose/transform state");
  check(
    !/const \[accColor, setAccColor\]/.test(editor) && !/\{ \.\.\.skin, accColor \}/.test(editor),
    "accessory tints live only on the skin (no second copy that randomize would miss)",
  );
  check(/sanitizeSkin/.test(editor) && /sanitizeSkin/.test(fs.readFileSync("src/game/catItems.ts", "utf8")), "preview, save and randomize share the ONE sanitizer");

  // the sanitizer is total: garbage in -> a complete, renderable cat out
  const junkVariants: Partial<CustomSkin>[] = [
    {},
    { fur: "not-a-color", eye: "nope", pattern: "no-such-pattern", tail: "no-such-tail", ears: "no-such-ears" },
    { acc: { head: "no-such-item", neck: "#ff0000", tail: "bow" } as CustomSkin["acc"], accColors: { body: "#123456", tail: "bad" }, markings: ["nope", "chest"], scars: ["nope"] },
    { fur: "#2c2c30", furDark: "#18181c", eye: "#d9a83a", pattern: "tabby", tail: "short", ears: "fold", acc: { neck: "collar-stud" }, accColors: { neck: "#3a3a40" } },
  ];
  let ok = 0;
  const notes: string[] = [];
  for (const junk of junkVariants) {
    const s = sanitizeSkin(junk);
    const ops = drawAt(s as CatSkin, "sit");
    const fine =
      typeof s.fur === "string" && !!s.furDark && !!s.eye && PATTERN_IDS.includes(s.pattern ?? "") &&
      TAIL_IDS.includes(s.tail ?? "") && EAR_IDS.includes(s.ears ?? "") &&
      !(s.acc?.head === ("no-such-item" as never)) && !(s.accColors && "body" in s.accColors) &&
      (s.markings ?? []).every((m) => MARKING_IDS.includes(m)) &&
      baseBodies(ops, s.fur).length === 1 && heads(ops).length === 1;
    if (fine) ok++;
    else notes.push(JSON.stringify(s));
  }
  check(ok === junkVariants.length, "sanitizeSkin turns junk/partial skins into a complete assembled cat", notes[0]);
}

// ---------------------------------------------------------------------------
// 4. save → reload round trip for a ROLLED look (real mutation + validator)
// ---------------------------------------------------------------------------
console.log("\n--- 4. a rolled cat saves, reloads and renders identically ---");
{
  interface Doc { _id: string; [k: string]: unknown }
  const rows: Doc[] = [];
  const db = {
    query: () => {
      const api: Record<string, unknown> = {
        withIndex: () => api,
        first: async () => rows[0] ?? null,
      };
      return api;
    },
    get: async () => rows[0] ?? null,
    insert: async (_t: string, doc: Record<string, unknown>) => {
      rows.push({ _id: `players:${rows.length + 1}`, ...doc });
      return rows[rows.length - 1]!._id;
    },
    patch: async (id: string, patch: Record<string, unknown>) => {
      const row = rows.find((r) => r._id === id);
      if (!row) throw new Error("no row");
      Object.assign(row, patch);
    },
  };
  const ctx = { auth: { getUserIdentity: async () => ({ subject: "u1|s", issuer: "t", tokenIdentifier: "t" }) }, db };
  const call = (fn: unknown, args: unknown) =>
    (fn as { _handler: (c: unknown, a: unknown) => Promise<unknown> })._handler(ctx, args);
  await call(ensurePlayer, { mode: "open", appearance: fullSkin(null as never), catName: "Rusty" });

  // the server's REAL validator
  interface VS { type: string; value?: unknown; fieldType?: VS; optional?: boolean; keys?: VS; values?: VS }
  const problemsOf = (schema: VS, val: unknown, path: string): string[] => {
    const out: string[] = [];
    if (val === undefined) { if (!schema.optional) out.push(`${path}: required`); return out; }
    switch (schema.type) {
      case "object": {
        if (typeof val !== "object" || val === null || Array.isArray(val)) return [`${path}: not an object`];
        const fields = (schema.value ?? {}) as Record<string, VS>;
        const obj = val as Record<string, unknown>;
        for (const [k, f] of Object.entries(fields)) {
          if (obj[k] === undefined) { if (!f.optional) out.push(`${path}.${k}: missing`); continue; }
          out.push(...problemsOf({ ...(f.fieldType ?? f), optional: f.optional }, obj[k], `${path}.${k}`));
        }
        for (const k of Object.keys(obj)) if (!(k in fields)) out.push(`${path}.${k}: unexpected`);
        break;
      }
      case "string": if (typeof val !== "string") out.push(`${path}: not a string`); break;
      case "number": if (typeof val !== "number") out.push(`${path}: not a number`); break;
      case "boolean": if (typeof val !== "boolean") out.push(`${path}: not a boolean`); break;
      case "array": (val as unknown[]).forEach((x, i) => out.push(...problemsOf(schema.value as VS, x, `${path}[${i}]`))); break;
      case "record": for (const [k, v] of Object.entries(val as Record<string, unknown>)) out.push(...problemsOf(schema.values as VS, v, `${path}.${k}`)); break;
      default: break;
    }
    return out;
  };
  const argsSchema = JSON.parse((saveAppearanceFn as unknown as { exportArgs: () => string }).exportArgs()) as VS;

  let saved = 0;
  let reloaded = 0;
  let validated = 0;
  let rendered = 0;
  let prevRoll: CustomSkin | undefined;
  const bad: string[] = [];
  for (let n = 0; n < 20; n++) {
    const roll = randomSkin(n === 0 ? undefined : prevRoll);
    prevRoll = roll;
    const payload = normalizeSkin(fullSkin(roll as never));
    if (problemsOf(argsSchema, { appearance: payload, appearanceVersion: appearanceVersion(payload) }, "args").length === 0) validated++;
    const res = (await call(saveAppearanceFn, { appearance: payload, appearanceVersion: appearanceVersion(payload) })) as { ok?: boolean };
    if (res?.ok === true) saved++;
    // the client's LOAD path: stored row -> getPlayer -> fullSkin -> drawCat
    const row = (await call(getPlayer, {})) as Doc;
    const onLoad = fullSkin(row.appearance as never);
    if (JSON.stringify(onLoad) === JSON.stringify(payload) && appearanceVersion(onLoad) === appearanceVersion(payload)) reloaded++;
    const ops = drawAt(onLoad as CatSkin, "sit");
    if (noDuplicateBodies(baseBodies(ops, onLoad.fur)) && heads(ops).length === 1) rendered++;
    else bad.push(`roll ${n} renders [${baseBodies(ops, onLoad.fur).map(geometryOf).join(" | ")}] bodies / ${heads(ops).length} heads after reload`);
  }
  check(validated === 20, "every rolled cat passes the server's REAL save validator", `${validated}/20`);
  check(saved === 20, "the backend confirms every rolled save", `${saved}/20`);
  check(reloaded === 20, "every rolled cat reloads byte-identical (nothing lost, nothing invented)", bad[0]);
  check(rendered === 20, "the reloaded cat still renders as one assembled cat", bad[0]);
  check(rows.length === 1, "all 20 rolls stayed on the ONE character row (no duplicates)", `${rows.length} rows`);
}

console.log(failures === 0 ? "\nALL RANDOMIZE CHECKS PASS" : `\n${failures} RANDOMIZE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

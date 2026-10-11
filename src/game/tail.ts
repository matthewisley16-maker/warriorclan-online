// WarriorCatsRPG — §4 THE authoritative tail animation controller.
//
// WHY THIS EXISTS
// The tail used to be drawn in two different places with two different ideas of
// where it was: the body tail inside the mirrored (facing) transform, and a
// separate "tail flick" stroke drawn OUTSIDE that transform at a fixed
// screen-left position. With the cat facing left the two strokes landed on
// OPPOSITE sides of the body — a second tail, on the wrong side, jumping
// between positions (exactly the "tail glitches when talking to cats" report;
// the dialogue loop fires tailFxUntil while the cat sits).
//
// It also had no state: every pose family had its own hard-coded anchors, so
// switching into the sitting pose that a conversation forces moved the tail tip
// ~33px in a single frame, and the sit/sleep/groom families had no time term at
// all — the tail was simply frozen while talking.
//
// This module is now the ONE place that decides tail geometry:
//   - `tailTarget()`  — the pure, animated target shape for a pose/state
//   - `tailGeom()`    — that shape, SMOOTHED per cat (no snapping on pose change)
// and everything that touches the tail (the tail stroke itself, the pale
// tail-tip marking, every tail accessory) reads the same geometry, so they can
// never disagree again.
//
// The smoothing state is bounded (old entries are evicted) so a long session
// with hundreds of cats/cards cannot leak.

export type TailFamilyHint = "stand" | "crouch" | "sit" | "sleep" | "swim" | "dance";

export interface TailInput {
  /** Stable per-cat identity ("player", "npc:firestar", "p:userid", …).
   *  When absent, cats are bucketed by phase — smoothing is then shared
   *  between cats with the same phase, which is cosmetic only. */
  id?: string;
  /** Tail family the body pose belongs to (draw.ts computes it from CatPose). */
  family: TailFamilyHint;
  /** raw pose id — only used for the dance beats */
  pose: string;
  /** tail item id: normal | short | bob | long | fluffy | slim */
  tail?: string;
  /** seconds (the same clock the body animation uses) */
  time: number;
  /** per-cat desync */
  phase: number;
  /** the body is travelling (walk/run/crouch-slide): tighter, faster sway */
  bodyMoving: boolean;
  /** emote/acting: a deliberate whip — folded INTO the same curve */
  tailFlick?: boolean;
  /** in conversation: the tail keeps a live, gentle motion (never frozen) */
  talking?: boolean;
  /** alert/curious: the tail lifts off the ground */
  alert?: boolean;
}

export interface TailGeom {
  baseX: number;
  baseY: number;
  ctrlX: number;
  ctrlY: number;
  tipX: number;
  tipY: number;
  width: number;
}

/** Length multiplier of the tail item (matches the original art). */
function lengthOf(tail?: string): number {
  return tail === "short" ? 0.5 : tail === "bob" ? 0.3 : tail === "long" ? 1.25 : 1;
}

/** Stroke width of the tail item (matches the original art). */
export function tailWidthOf(tail?: string): number {
  return tail === "fluffy" ? 6.5 : tail === "slim" ? 3.2 : 4.5;
}

const TAU_S = 0.11; // smoothing time constant (s) — eases a pose change over ~0.3s
// §2/§5 HARD guarantee: the tail tip can never move faster than this, so no
// pose change, cutscene cut or network snap-back can ever make it JUMP (the
// reported "tail snaps / teleports" behaviour). 260px/s covers the whole tail
// length in ~0.1s, so a transition still reads as immediate.
const MAX_TIP_SPEED = 260;
const MAX_TRACKED = 260; // bounded controller state (no unbounded growth)

/**
 * The animated target tail for one cat, in the cat's LOCAL space (negative x =
 * behind the cat, before the facing mirror is applied by the caller).
 *
 * Every family animates. Sitting still with a motionless tail was the visible
 * half of the "tail stops working" bug; a talking cat gets a live loop instead.
 */
export function tailTarget(i: TailInput): TailGeom {
  const t = i.time;
  const ph = i.phase;
  const L = lengthOf(i.tail);
  const width = tailWidthOf(i.tail);
  const flick = i.tailFlick ? 1 : 0;
  const talk = i.talking ? 1 : 0;
  const alert = i.alert ? 1 : 0;

  // A deliberate flick: a fast lateral sweep with a sharp upward lift, applied
  // to the ONE curve (never a second stroke).
  const sweep = flick ? Math.sin(t * 5.5) * 5.5 : 0;
  const lift = flick ? 8 : 0;

  let baseX: number;
  let baseY: number;
  let ctrlX: number;
  let ctrlY: number;
  let tipX: number;
  let tipY: number;

  switch (i.family) {
    case "sit": {
      // curled along the ground beside the body, tip sweeping in a lazy figure;
      // a talking cat keeps a quicker, more interested loop (the sit-and-talk
      // pose was where the tail looked completely dead); alert lifts it.
      const s = Math.sin(t * 1.5 + ph) * (3.1 + talk * 1.7) + Math.sin(t * 0.55 + ph * 1.7) * 1.5;
      baseX = -10;
      baseY = -4;
      ctrlX = -18 * L;
      ctrlY = -2 + s * 0.6 - alert * 2.4 - lift * 0.35;
      tipX = -16 * L - sweep * 0.35;
      tipY = 6 + s - alert * 5 - lift;
      break;
    }
    case "sleep": {
      // tucked around the body: alive, but only breathing-soft movement
      const s = Math.sin(t * 0.9 + ph) * 1.35 + Math.sin(t * 0.42 + ph) * 0.5;
      baseX = -8;
      baseY = -3;
      ctrlX = -14 * L;
      ctrlY = 0 + s * 0.5;
      tipX = -12 * L - sweep * 0.3;
      tipY = 4 + s - lift * 0.6;
      break;
    }
    case "swim": {
      // streams behind with the wake; bob is supplied by the caller's transform
      const s = Math.sin(t * 2.6 + ph) * 4.4;
      baseX = -11;
      baseY = -5;
      ctrlX = -20 * L;
      ctrlY = -6 + s * 0.3;
      tipX = -26 * L - sweep * 0.3;
      tipY = -12 + s * 0.6 - lift * 0.5;
      break;
    }
    case "crouch": {
      // hunting/stalking: held LOW and mostly still, with a slow tip twitch —
      // a still tail is the point of a stalk, but it must never look dead
      const s = Math.sin(t * 0.85 + ph) * (i.bodyMoving ? 1.2 : 2.2) + Math.sin(t * 4.2 + ph) * 0.5;
      baseX = -11;
      baseY = -8;
      ctrlX = -20 * L;
      ctrlY = -12 + s * 0.35;
      tipX = -25 * L - sweep * 0.4;
      tipY = -13 + s - lift * 0.8;
      break;
    }
    case "dance": {
      // upright, waving high on the beat (each dance has its own beat)
      const beat = i.pose === "dance2" ? t * 6.2 : i.pose === "dance3" ? t * 7.4 : i.pose === "dance4" ? t * 3.6 : t * 4.6;
      const w = Math.sin(beat * 2) ;
      baseX = -10;
      baseY = -8;
      ctrlX = -17 * L;
      ctrlY = -16 + w * 6;
      tipX = -20 * L - sweep * 0.5;
      tipY = -26 + w * 8 - lift;
      break;
    }
    default: {
      // stand / walk / run: streams out behind, tip above the ground line.
      // A walking tail is tighter and quicker; an idle cat gets a lazy swish;
      // alert lifts the whole tail up.
      const amp = i.bodyMoving ? 4.6 : 7.2;
      const rate = i.bodyMoving ? 2.6 : 1.9;
      const s = Math.sin(t * rate + ph) * amp + Math.sin(t * 0.7 + ph * 1.7) * (i.bodyMoving ? 0.8 : 1.8);
      baseX = -11;
      baseY = -8;
      ctrlX = -20 * L;
      ctrlY = -14 + s * 0.4 - alert * 3 - lift * 0.4;
      tipX = -24 * L - sweep * 0.45;
      tipY = -20 + s - alert * 7 - lift;
      break;
    }
  }

  return { baseX, baseY, ctrlX, ctrlY, tipX, tipY, width };
}

/** A point on the tail's quadratic curve, u ∈ [0,1] (0 = base, 1 = tip). */
export function tailPoint(g: TailGeom, u: number): { x: number; y: number } {
  const k = 1 - u;
  return {
    x: k * k * g.baseX + 2 * k * u * g.ctrlX + u * u * g.tipX,
    y: k * k * g.baseY + 2 * k * u * g.ctrlY + u * u * g.tipY,
  };
}

/** Unit direction of the curve at u (for attaching accessories along the tail). */
export function tailTangent(g: TailGeom, u: number): { x: number; y: number } {
  const a = tailPoint(g, Math.max(0, u - 0.02));
  const b = tailPoint(g, Math.min(1, u + 0.02));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

// ---------------------------------------------------------------------------
// Smoothing controller: one blend per cat, so a pose change eases instead of
// snapping (the conversation sit-pose used to jump the tip ~33px in one frame).
// ---------------------------------------------------------------------------

interface TailState {
  g: TailGeom;
  t: number;
}

const states = new Map<string, TailState>();

/** Test/debug hook: forget every smoothed tail (next frame snaps to target). */
export function resetTailStates(): void {
  states.clear();
}

/** How many cats currently hold blending state (bounded; §22 leak guard). */
export function tailStateCount(): number {
  return states.size;
}

function keyOf(i: TailInput): string {
  return i.id ?? `phase:${Math.round(i.phase)}`;
}

function evict(now: number): void {
  if (states.size <= MAX_TRACKED) return;
  // drop anything that has not been drawn for 3s, then (if still over) the
  // oldest entries — a long session with hundreds of item cards stays bounded
  for (const [k, s] of states) if (now - s.t > 3) states.delete(k);
  if (states.size <= MAX_TRACKED) return;
  const oldest = [...states.entries()].sort((a, b) => a[1].t - b[1].t);
  for (let n = 0; n < oldest.length - MAX_TRACKED; n++) states.delete(oldest[n]![0]);
}

/**
 * The smoothed tail for this cat this frame.
 *
 *   - first time we see a cat → the target (nothing to ease from)
 *   - same-frame repeat call   → the previous geometry (never double-advance)
 *   - clock jump / new session → the target (snap, so a fresh page is correct)
 *   - otherwise                → exponential ease toward the target
 */
export function tailGeom(i: TailInput): TailGeom {
  const target = tailTarget(i);
  const key = keyOf(i);
  const prev = states.get(key);
  if (!prev) {
    states.set(key, { g: target, t: i.time });
    evict(i.time);
    return target;
  }
  const dt = i.time - prev.t;
  if (!Number.isFinite(dt) || dt <= 0) return prev.g; // same frame: no drift
  if (dt > 0.5) {
    states.set(key, { g: target, t: i.time }); // clock reset: start clean
    return target;
  }
  const a = 1 - Math.exp(-dt / TAU_S);
  const g: TailGeom = {
    baseX: prev.g.baseX + (target.baseX - prev.g.baseX) * a,
    baseY: prev.g.baseY + (target.baseY - prev.g.baseY) * a,
    ctrlX: prev.g.ctrlX + (target.ctrlX - prev.g.ctrlX) * a,
    ctrlY: prev.g.ctrlY + (target.ctrlY - prev.g.ctrlY) * a,
    tipX: prev.g.tipX + (target.tipX - prev.g.tipX) * a,
    tipY: prev.g.tipY + (target.tipY - prev.g.tipY) * a,
    width: prev.g.width + (target.width - prev.g.width) * a,
  };
  // rate limit (see MAX_TIP_SPEED): if this frame would teleport the tip,
  // shorten the step along the same path — the shape is preserved, only the
  // speed is capped, so it still converges within a few frames
  const dx = g.tipX - prev.g.tipX;
  const dy = g.tipY - prev.g.tipY;
  const step = Math.hypot(dx, dy);
  const maxStep = Math.max(0.4, MAX_TIP_SPEED * dt);
  if (step > maxStep) {
    const k = maxStep / step;
    g.baseX = prev.g.baseX + (g.baseX - prev.g.baseX) * k;
    g.baseY = prev.g.baseY + (g.baseY - prev.g.baseY) * k;
    g.ctrlX = prev.g.ctrlX + (g.ctrlX - prev.g.ctrlX) * k;
    g.ctrlY = prev.g.ctrlY + (g.ctrlY - prev.g.ctrlY) * k;
    g.tipX = prev.g.tipX + dx * k;
    g.tipY = prev.g.tipY + dy * k;
  }
  states.set(key, { g, t: i.time });
  evict(i.time);
  return g;
}

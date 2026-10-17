// WarriorCatsRPG — animation core: ONE state machine for every cat.
//
// The renderer (draw.ts) is a pure function of the values this module
// produces, so the *animation state* lives in exactly one place: player, NPCs
// and remote players all run through the same `CatAnimator`. That is what
// stops the old problems from coming back:
//
//  * walking while standing still — the gait phase only advances with REAL
//    travelled distance (`advance` takes the cat's own x/y), so a stationary
//    cat has a resting phase and `moving === false` (no leg cycling in place);
//  * dialogue stacking loops — `setScene()` owns the transition, and a
//    conversation pose is a state, never a second animation loop;
//  * snapping turns — `easeFacing()` walks the drawn facing through the turn
//    (through 0, the squash), while the game's own facing stays instant so
//    collision and interaction are unaffected;
//  * fake "animation" — the gait is a real four-leg cycle (stance legs planted
//    and sliding back, swing legs lifted and reaching forward), not the whole
//    sprite bobbed up and down.
//
// The module is dependency-free and canvas-free on purpose: it can be imported
// headless by the check suites and by the engine alike.

export type Gait = "idle" | "walk" | "run" | "crouch" | "swim";

/** Distance travelled per full four-leg cycle, in px (one stride). */
export const STRIDE_PX: Record<Gait, number> = {
  idle: 26,
  walk: 30,
  run: 44,
  crouch: 24,
  swim: 34,
};

/** How high a swing paw lifts, in px. */
const LIFT_PX: Record<Gait, number> = { idle: 0.6, walk: 2.1, run: 3.4, crouch: 1.2, swim: 1.8 };
/** Body bob amplitude for two footfalls per cycle. */
const BOB_PX: Record<Gait, number> = { idle: 0.4, walk: 1.15, run: 1.9, crouch: 0.7, swim: 0.6 };
/**
 * Fore/aft travel of a paw over one stance, in px.
 *
 * A stance paw must stay planted on the ground: over a half cycle the BODY
 * advances STRIDE_PX/2, so the paw has to slide back by exactly that much in
 * local space. Using a smaller reach was what made the feet skate forward
 * under a walking cat (the legs moved, but not at the speed of the ground).
 */
const REACH_PX: Record<Gait, number> = {
  idle: STRIDE_PX.idle / 2,
  walk: STRIDE_PX.walk / 2,
  run: STRIDE_PX.run / 2,
  crouch: STRIDE_PX.crouch / 2,
  swim: STRIDE_PX.swim / 2,
};

/** Local y of a paw's top edge when it rests on the ground line (y = 0). */
const PAW_H = 7;
const PAW_TOP = -PAW_H;

export interface GaitState {
  /** 0..1 through the current four-leg cycle */
  phase: number;
  /** px of ground this cat has covered while animating (diagnostics) */
  travelled: number;
  gait: Gait;
  /** 0..1 blend toward the current gait (smooths gait changes, never snaps) */
  blend: number;
}

export function newGaitState(): GaitState {
  return { phase: 0, travelled: 0, gait: "idle", blend: 0 };
}

/**
 * Advance the gait with REAL travelled distance. Zero distance never advances
 * the cycle (a standing cat cannot walk in place) but does relax the blend.
 */
export function advanceGait(state: GaitState, distPx: number, gait: Gait): GaitState {
  const moved = Math.abs(distPx);
  const stride = STRIDE_PX[gait];
  const target = gait === "idle" ? 0 : 1;
  // blend moves toward the target gait over ~0.18s of travel/second of idling
  const rate = moved > 0 ? moved / 22 : 1 / 8;
  const blend = Math.max(0, Math.min(1, state.blend + (target - state.blend) * Math.min(1, rate)));
  const phase = moved > 0 ? (state.phase + moved / stride) % 1 : state.phase;
  // keep the last MOVING gait recorded while the cat idles, so the settling
  // stride is drawn with the geometry it actually used
  return { phase, travelled: state.travelled + moved, gait: gait === "idle" ? state.gait : gait, blend };
}

export interface LegRect {
  /** local x of the paw (relative to the cat's centre, facing right) */
  x: number;
  /** paw top (local y; the paw is `h` tall) */
  y: number;
  w: number;
  h: number;
  /** vertical lift of a swinging paw */
  lift: number;
  /** far-side leg (drawn behind the body, slightly darker) */
  far: boolean;
  /** 0..1 how much of the stride this leg currently expresses (1 = fully) */
  swing: number;
  /** true while the paw is carrying weight: the renderer pins it to the
   *  ground line while the body bobs, so planted feet never hop off the floor */
  planted: boolean;
}

/**
 * The four legs of the current gait cycle, in draw order (far pair first so a
 * near leg can overlap the body correctly).
 *
 * Diagonal pairing: near-front + far-back are in phase, far-front + near-back
 * are half a cycle behind — the standard quadruped walk, so the cat reads as
 * walking rather than hopping.
 */
export function gaitLegs(phase: number, gait: Gait, blend = 1): LegRect[] {
  const reach = REACH_PX[gait] * blend;
  const lift = LIFT_PX[gait] * blend;
  // Paw tops sit ON the ground line (y = 0) minus the paw's own height, so a
  // planted paw touches the floor and a swinging one visibly clears it.
  const legs: { off: number; far: boolean; x: number }[] = [
    { off: 0.5, far: true, x: 4.5 }, // far front
    { off: 0, far: true, x: -7.5 }, // far back
    { off: 0, far: false, x: 5.5 }, // near front
    { off: 0.5, far: false, x: -9 }, // near back
  ];
  return legs.map(({ off, far, x }) => {
    const p = (phase + off) % 1;
    if (p < 0.5) {
      // stance: planted, sliding backward as the body passes over it
      const t = p / 0.5;
      return { x: x + reach * (0.5 - t), y: PAW_TOP, w: 4, h: PAW_H, lift: 0, far, swing: 0, planted: true };
    }
    // swing: lifted and reaching forward
    const q = (p - 0.5) / 0.5;
    return {
      x: x - reach * 0.5 + reach * q,
      y: PAW_TOP,
      w: 4,
      h: PAW_H,
      lift: Math.sin(q * Math.PI) * lift,
      far,
      swing: Math.sin(q * Math.PI),
      planted: false,
    };
  });
}

/** Body bob for the cycle: two footfalls (down on each contact), never a float. */
export function gaitBob(phase: number, gait: Gait, blend = 1): number {
  const amp = BOB_PX[gait] * blend;
  if (amp <= 0) return 0;
  // feet land at phase 0 and 0.5 → lowest there, highest between footfalls
  return -Math.abs(Math.cos(phase * Math.PI * 2)) * amp + amp * 0.5;
}

/** A subtle roll so the shoulders/hips alternate instead of the body sliding. */
export function gaitRoll(phase: number, gait: Gait, blend = 1): number {
  if (gait === "idle") return 0;
  return Math.sin(phase * Math.PI * 2) * 0.018 * blend;
}

// ---------------------------------------------------------------------------
// Turning (cats pivot; they do not mirror instantly)
// ---------------------------------------------------------------------------

/** Seconds a full about-face takes when drawn. */
export const TURN_SECONDS = 0.17;

/**
 * Ease the DRAWN facing toward the target. The value passes through 0, which
 * the renderer scales as a horizontal squash — that single frame is what reads
 * as the cat pivoting rather than being mirrored.
 */
export function easeFacing(current: number, target: 1 | -1, dtSec: number): number {
  if (current === 0) return target * Math.min(1, dtSec / TURN_SECONDS);
  const step = (dtSec / TURN_SECONDS) * 2; // crosses zero at the same rate
  if (current > 0) return Math.max(target, current - step);
  return Math.min(target, current + step);
}

/** 0 = flat side-on (mid-turn), 1 = fully side-on as usual (for lean/scale). */
export function facingScaleish(facing: number): number {
  return 0.55 + 0.45 * Math.abs(facing);
}

// ---------------------------------------------------------------------------
// Idle life: blinking, ears, natural head movement
// ---------------------------------------------------------------------------

/** Deterministic 0..1 hash so every cat blinks on its own schedule. */
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Eye openness 0..1. Blinks are irregular (a slow "next blink" clock drives a
 * fast lid close), and a talking cat blinks more often — as cats do.
 */
export function blinkAmount(t: number, seed = 0, talking = false): number {
  const period = talking ? 2.6 : 4.2;
  const offset = hash01(seed * 7.13) * period;
  const local = ((t + offset) % period) / period;
  const closeAt = talking ? 0.94 : 0.96;
  const width = 0.055;
  if (local < closeAt - width || local > closeAt + width * 2) {
    // occasional double blink, plus a slow "squint" so the eyes are not static
    const micro = 0.965 + 0.035 * Math.sin(t * 0.7 + seed);
    return Math.max(0.9, micro);
  }
  const q = (local - (closeAt - width)) / (width * 3);
  return Math.max(0.05, Math.abs(q * 2 - 1));
}

/** Ear flick amplitude 0..1 for one ear (short twitches, rare, seed-stable). */
export function earFlick(t: number, seed = 0, ear: 0 | 1 = 0): number {
  const s = seed * 3.7 + ear * 1.9;
  const period = 5.5 + hash01(s) * 6;
  const local = ((t + hash01(s + 1) * period) % period) / period;
  if (local > 0.06) return 0;
  return Math.sin((local / 0.06) * Math.PI);
}

/**
 * Natural idle head movement: mostly still, with occasional looks around and a
 * small settling sway. Never used while the cat is talking (the conversation
 * owns the head then) or walking.
 */
export function idleHead(t: number, seed = 0): { dx: number; dy: number } {
  const base = Math.sin(t * 0.55 + seed) * 0.5;
  const period = 6.5;
  const local = ((t + hash01(seed + 5) * period) % period) / period;
  const look = local < 0.28 ? Math.sin((local / 0.28) * Math.PI) : 0;
  const dir = hash01(seed + 9) > 0.5 ? 1 : -1;
  return { dx: base + look * 1.7 * dir, dy: look * -0.5 };
}

/** Breathing scale for idle poses (chest rise/fall, not a bob of the sprite). */
export function breathScale(t: number, seed = 0, talking = false): number {
  const hz = talking ? 0.62 : 0.42;
  return 1 + Math.sin(t * hz * Math.PI * 2 + seed) * 0.014;
}

// ---------------------------------------------------------------------------
// The per-cat animator: the single state machine
// ---------------------------------------------------------------------------

export interface AnimInput {
  x: number;
  y: number;
  /** current speed in px/s (0 = standing) */
  speedPx?: number;
  /** intended gait from the movement state (ignored while `pose` is fixed) */
  gait?: Gait;
  /** a fixed pose owns the body (sit / groom / sleep / talking emote) */
  poseLocked?: boolean;
  talking?: boolean;
  /** 1 | -1 target facing */
  facing?: 1 | -1;
  nowSec: number;
  dtSec: number;
}

export interface AnimView {
  gait: Gait;
  phase: number;
  /** 0..1 gait expression (0 = resting) */
  blend: number;
  moving: boolean;
  bob: number;
  roll: number;
  legs: LegRect[];
  facing: number;
  blink: number;
  earL: number;
  earR: number;
  headDx: number;
  headDy: number;
  breath: number;
  talking: boolean;
}

interface Entry {
  state: GaitState;
  x: number;
  y: number;
  facing: number;
  seed: number;
  view: AnimView;
  talking: boolean;
  /** has this cat been positioned at least once? (first frame = no travel) */
  seen: boolean;
}

/**
 * The ONE animation state machine. Every cat in the game (player, NPCs, remote
 * players) gets an entry keyed by a stable id — the same idea as the tail
 * controller, and for the same reason: state that belongs to a cat must not be
 * shared with another cat, and must survive a re-render.
 */
export class CatAnimator {
  private entries = new Map<string, Entry>();

  private entry(id: string, seed: number): Entry {
    let e = this.entries.get(id);
    if (!e) {
      e = {
        state: newGaitState(),
        x: 0,
        y: 0,
        facing: seed % 2 === 0 ? 1 : -1,
        seed,
        talking: false,
        seen: false,
        view: emptyView(),
      };
      this.entries.set(id, e);
      if (this.entries.size > 240) {
        // bounded memory: drop the oldest-looking entry (never the live cats,
        // which are re-created on their next update)
        const first = this.entries.keys().next().value;
        if (first !== undefined) this.entries.delete(first);
      }
    }
    return e;
  }

  /** Feed one frame for this cat; returns its current animation view. */
  update(id: string, input: AnimInput, seed = 0): AnimView {
    const e = this.entry(id, seed);
    // first frame for this cat: no travel to account for (no phantom stride)
    const travelled = e.seen ? Math.hypot(input.x - e.x, input.y - e.y) : 0;
    e.seen = true;
    const gait: Gait = input.poseLocked ? "idle" : (input.gait ?? (input.speedPx && input.speedPx > 0 ? "walk" : "idle"));
    // the gait used to EXPRESS the last stride while the blend settles down
    // ("idle" has no stride of its own), so a stopping cat finishes its step
    // with the legs it was actually using instead of snapping them away
    const expressGait: Gait = gait === "idle" ? (e.state.gait === "idle" ? "walk" : e.state.gait) : gait;
    e.state = advanceGait(e.state, travelled, gait);
    e.x = input.x;
    e.y = input.y;
    e.talking = Boolean(input.talking);
    e.facing = easeFacing(e.facing, input.facing ?? (e.facing >= 0 ? 1 : -1), input.dtSec);
    const moving = e.state.blend > 0.15 && gait !== "idle";
    const idle = moving || e.talking ? { dx: 0, dy: 0 } : idleHead(input.nowSec, e.seed);
    // LEGS ARE ALWAYS SUPPLIED for a walking cat (even at blend 0: four neutral,
    // planted paws). This is what stops the renderer's old time-based fallback
    // from cycling the legs of a cat that is standing perfectly still, and it
    // lets the cycle settle smoothly to rest instead of popping off.
    const legs = gaitLegs(e.state.phase, expressGait, e.state.blend);
    const view: AnimView = {
      gait,
      phase: e.state.phase,
      blend: e.state.blend,
      moving,
      bob: e.state.blend > 0.01 ? gaitBob(e.state.phase, expressGait, e.state.blend) : 0,
      roll: moving ? gaitRoll(e.state.phase, expressGait, e.state.blend) : 0,
      legs,
      facing: e.facing,
      blink: blinkAmount(input.nowSec, e.seed, e.talking),
      earL: earFlick(input.nowSec, e.seed, 0),
      earR: earFlick(input.nowSec, e.seed, 1),
      headDx: idle.dx,
      headDy: idle.dy,
      breath: breathScale(input.nowSec, e.seed, e.talking),
      talking: e.talking,
    };
    e.view = view;
    return view;
  }

  /** Last computed view (no simulation) — used by draw paths that run later. */
  peek(id: string): AnimView {
    return this.entries.get(id)?.view ?? emptyView();
  }

  /** Scene change: settle every cat (a new scene never inherits a walk cycle). */
  reset(id?: string) {
    if (id) this.entries.delete(id);
    else this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

function emptyView(): AnimView {
  return {
    gait: "idle",
    phase: 0,
    blend: 0,
    moving: false,
    bob: 0,
    roll: 0,
    legs: [],
    facing: 1,
    blink: 1,
    earL: 0,
    earR: 0,
    headDx: 0,
    headDy: 0,
    breath: 1,
    talking: false,
  };
}

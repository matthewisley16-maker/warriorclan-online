// WarriorCatsRPG — cinematic FRAMING math (§2: shot composition).
//
// A cutscene shot is not "point the camera at the speaker and zoom". It is a
// composition: the subject has to sit in the part of the screen that is not
// covered by the letterbox or the dialogue box, and a two-shot has to keep BOTH
// cats inside the safe area whatever the viewport size.
//
// This module is pure (no canvas, no engine): the engine calls it every frame
// with live actor positions, so a shot can follow a cat that is walking during
// the scene, and the check suites can measure the composition headlessly.
//
// The camera itself is still the game's camera — this only produces a target
// (camX, camY, zoom) that the engine glides toward. World coordinates are never
// touched and no object is ever moved to fake a close-up.

export type CineShot = "wide" | "medium" | "two" | "close";

export interface CinePoint {
  x: number;
  y: number;
}

export interface CineView {
  /** viewport in CSS px */
  width: number;
  height: number;
  /** camera scale WITHOUT the cinematic zoom (settings × viewport) */
  baseScale: number;
  worldW: number;
  worldH: number;
}

export interface CineFrame {
  /** camera centre in world px */
  x: number;
  y: number;
  /** multiplier applied on top of the gameplay scale (1 = normal) */
  zoom: number;
}

/** Drawn cat bounds in world px (sprite is ~44 wide, ~50 tall around the paws). */
export const CAT_FRAME_W = 46;
export const CAT_FRAME_H = 52;

/**
 * Per-shot zoom envelope.
 *  - close  : one cat's head and shoulders fill a good part of the screen
 *  - medium : one cat with some room around it
 *  - two    : both cats, comfortably readable together
 *  - wide   : the place first; the cats are small but unmistakably present
 * `height` is the fraction of the viewport the subject(s) should occupy.
 */
const SHOT: Record<CineShot, { min: number; max: number; height: number }> = {
  close: { min: 2.1, max: 3.0, height: 0.32 },
  medium: { min: 1.35, max: 2.2, height: 0.24 },
  two: { min: 1.0, max: 2.6, height: 0.18 },
  wide: { min: 0.86, max: 1.02, height: 0.11 },
};

/**
 * The dialogue box occupies the bottom of the screen, so shots are composed
 * slightly ABOVE centre: the cat's head lands at roughly a third of the way
 * down, and its paws still clear the box.
 */
function verticalBias(view: CineView, shot: CineShot): number {
  const frac = shot === "close" ? 0.055 : shot === "medium" ? 0.075 : 0.1;
  return view.height * frac;
}

/** Screen position of a world point for a given frame (CSS px). */
export function projectCinePoint(
  frame: CineFrame,
  point: CinePoint,
  view: CineView,
): { x: number; y: number } {
  const scale = view.baseScale * frame.zoom;
  return {
    x: view.width / 2 + (point.x - frame.x) * scale,
    y: view.height / 2 + (point.y - frame.y) * scale,
  };
}

/**
 * Compose one shot around `points`.
 *
 * Guarantees, in order of priority:
 *  1. the subjects are inside the readable area (not under the letterbox and
 *     not under the dialogue box);
 *  2. the zoom suits the shot type (close-ups actually read as close-ups);
 *  3. the camera never shows past the world edge (unless keeping a subject
 *     visible requires it — framing wins over the void).
 */
export function planCineFrame(opts: {
  points: CinePoint[];
  shot: CineShot;
  view: CineView;
  /** min distance (px) a subject must keep from the screen edges */
  marginPx?: number;
}): CineFrame {
  const { shot, view } = opts;
  const cfg = SHOT[shot] ?? SHOT.medium;
  const base = Math.max(0.2, view.baseScale);
  const pts = opts.points.length > 0 ? opts.points : [{ x: view.worldW / 2, y: view.worldH / 2 }];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  // --- zoom ---------------------------------------------------------------
  // A group shot is sized by the SUBJECTS (each cat should still read) and
  // then constrained to fit the whole group. A single subject is sized by the
  // shot's target height.
  let zoom: number;
  if (pts.length > 1) {
    const groupHeight = shot === "wide" ? 0.14 : shot === "two" ? 0.3 : 0.26;
    zoom = Math.min(
      (view.height * groupHeight) / (CAT_FRAME_H * base),
      (view.height * 0.56) / ((spanY + CAT_FRAME_H) * base),
      (view.width * 0.64) / ((spanX + CAT_FRAME_W) * base),
    );
    // A group shot must never crop a cat out: when the cats are far apart the
    // camera goes WIDER than the shot's usual minimum rather than sacrificing
    // one of them (that is how a two-shot stays a two-shot).
    zoom = Math.max(0.4, Math.min(cfg.max, zoom));
  } else {
    zoom = (view.height * cfg.height) / (CAT_FRAME_H * base);
    zoom = Math.max(cfg.min, Math.min(cfg.max, zoom));
  }

  // --- centre -------------------------------------------------------------
  // Ground points become body centres, then the whole composition is lifted so
  // faces sit above the dialogue box.
  const scale = base * zoom;
  let x = (minX + maxX) / 2;
  let y = (minY + maxY) / 2 - CAT_FRAME_H / 2 + verticalBias(view, shot) / scale;

  // --- keep the camera inside the world -----------------------------------
  const halfW = view.width / 2 / scale;
  const halfH = view.height / 2 / scale;
  const clampAxis = (v: number, half: number, world: number) =>
    world <= half * 2 ? world / 2 : Math.max(half, Math.min(world - half, v));
  x = clampAxis(x, halfW, view.worldW);
  y = clampAxis(y, halfH, view.worldH);

  // --- safe-area correction ----------------------------------------------
  // A subject near the world edge can be pushed to the very edge of the frame
  // by the clamp above. Nudge the CAMERA (never the cat) to bring it back into
  // the readable area — the letterbox takes 34px, the dialogue box the bottom
  // ~28%, and the sides keep a generous cinematic margin.
  const marginX = opts.marginPx ?? Math.max(90, view.width * 0.13);
  const top = 34 + 26;
  const bottom = view.height * 0.7;
  for (const p of pts) {
    const sx = view.width / 2 + (p.x - x) * scale;
    const sy = view.height / 2 + (p.y - y) * scale;
    if (sx < marginX) x -= (marginX - sx) / scale;
    else if (sx > view.width - marginX) x += (sx - (view.width - marginX)) / scale;
    if (sy < top) y -= (top - sy) / scale;
    else if (sy > bottom) y += (sy - bottom) / scale;
  }

  return { x, y, zoom };
}

/**
 * The defaults for a beat's opening shot: establish the place before any
 * character gets a close-up (§5: environment → character → situation).
 */
export function openingCineShot(): CineShot {
  return "wide";
}

// §CINEMATIC camera + acting verification — against the REAL engine.
//
// The cutscene work rests on runtime behaviour that a screenshot cannot prove
// and a source scan can only pretend to check:
//
//   1. SHOT COMPOSITION. A close-up must actually be a close-up (the cat fills
//      a readable part of the screen), a two-shot must keep BOTH cats inside
//      the frame at any separation and viewport, and no shot may put a face
//      under the dialogue box or the letterbox.
//   2. SMOOTH CAMERA. Shots glide (no snap), the camera keeps re-framing while
//      a cat walks, and ending a cutscene returns to gameplay framing smoothly.
//   3. REAL ACTING. Story cues move the cats on foot (no teleports), turn
//      them, and the head/tail/ear/pose direction reaches the renderer.
//
// Run: bun scripts/check-cine-framing.ts

type AnyFn = (...args: unknown[]) => unknown;
const gradient = { addColorStop: (() => undefined) as AnyFn };

const CANVAS_W = 1280;
const CANVAS_H = 720;

interface RecCtx {
  counts: Record<string, number>;
  ops: { op: string; args: unknown[] }[];
}
const rec: RecCtx = { counts: {}, ops: [] };

function makeCtx(log?: RecCtx) {
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get(t, prop) {
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient" || prop === "createLinearGradient" || prop === "createPattern")
        return () => gradient;
      if (prop === "canvas") return canvas;
      const key = String(prop);
      return (...args: unknown[]) => {
        if (log) {
          log.counts[key] = (log.counts[key] ?? 0) + 1;
          // record geometry-producing calls only (enough to prove motion)
          if (["translate", "rotate", "scale", "ellipse", "arc", "fillRect", "moveTo", "lineTo"].includes(key)) {
            log.ops.push({ op: key, args });
          }
        }
        return undefined;
      };
    },
    set(t, prop, value) {
      if (prop === "fillStyle" || prop === "strokeStyle") (t as Record<string, unknown>)[String(prop)] = value;
      return true;
    },
  });
}

const ctx = makeCtx(rec);
const canvas = {
  getContext: () => ctx,
  getBoundingClientRect: () => ({ width: CANVAS_W, height: CANVAS_H, left: 0, top: 0, right: CANVAS_W, bottom: CANVAS_H }),
  width: 0,
  height: 0,
  style: {},
};

(globalThis as Record<string, unknown>).document = {
  createElement: (tag: string) => {
    if (tag !== "canvas") return {};
    return { width: 0, height: 0, getContext: () => makeCtx(), style: {} };
  },
};
(globalThis as Record<string, unknown>).window = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout,
  clearTimeout,
  devicePixelRatio: 1,
};
let simNow = 0;
let rafCb: ((t: number) => void) | null = null;
(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: (t: number) => void) => {
  rafCb = cb;
  return 1;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => {
  rafCb = null;
};
(globalThis as Record<string, unknown>).performance = { now: () => simNow };

function stepFrame(dtMs = 16.7) {
  simNow += dtMs;
  const cb = rafCb;
  rafCb = null;
  cb?.(simNow);
}

const { GameCanvas } = await import("../src/game/engine");
const { planCineFrame, projectCinePoint, CAT_FRAME_H } = await import("../src/game/cinematic");
type CineView = import("../src/game/cinematic").CineView;
const { drawCat } = await import("../src/game/draw");
const { STORY_BEATS, lineCameraShot, actingForLine, resolveCue } = await import("../src/game/storyCinematics");
const { storySteps } = await import("../src/game/story");
const { STAGED_STEPS, escortForStep } = await import("../src/game/storyStaging");

let failures = 0;
let checks = 0;
function check(ok: boolean, label: string, detail = "") {
  checks++;
  if (ok) console.log(`  ok  ${label}`);
  else {
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

const TILE = 32;
const view = (w: number, h: number): CineView => ({
  width: w,
  height: h,
  baseScale: w < 700 ? 0.85 : w < 1100 ? 1.0 : 1.2,
  worldW: 240 * TILE,
  worldH: 220 * TILE,
});

/** Is this world point inside the readable area (letterbox + dialogue box)? */
function readable(p: { x: number; y: number }, f: ReturnType<typeof planCineFrame>, v: CineView) {
  const s = projectCinePoint(f, p, v);
  return {
    x: s.x,
    y: s.y,
    okX: s.x > 60 && s.x < v.width - 60,
    okY: s.y > 34 + 12 && s.y < v.height * 0.74,
  };
}

// ---------------------------------------------------------------------------
// 1) SHOT COMPOSITION (pure math, three very different viewports)
// ---------------------------------------------------------------------------
console.log("— shot composition —");
for (const v of [view(1280, 720), view(1920, 1080), view(820, 1180), view(390, 844)]) {
  const label = `${v.width}x${v.height}`;
  const cat = { x: 90 * TILE, y: 116 * TILE };
  const other = { x: cat.x + 70, y: cat.y + 10 };

  const close = planCineFrame({ points: [cat], shot: "close", view: v });
  const medium = planCineFrame({ points: [cat], shot: "medium", view: v });
  const wide = planCineFrame({ points: [cat], shot: "wide", view: v });
  check(close.zoom > medium.zoom && medium.zoom > wide.zoom, `${label}: close > medium > wide zoom`, `${close.zoom.toFixed(2)} / ${medium.zoom.toFixed(2)} / ${wide.zoom.toFixed(2)}`);

  // a close-up must cover a readable slice of the screen
  const head = readable({ x: cat.x, y: cat.y - CAT_FRAME_H }, close, v);
  check(head.okY && head.okX, `${label}: the close-up keeps the face clear of the box`, `y=${head.y.toFixed(0)}`);
  const bodyPx = CAT_FRAME_H * v.baseScale * close.zoom;
  const gameplayPx = CAT_FRAME_H * v.baseScale;
  check(
    bodyPx > gameplayPx * 2.5 && bodyPx >= 120,
    `${label}: the close-up subject is genuinely large (2.5x gameplay, >=120px)`,
    `${bodyPx.toFixed(0)}px of ${v.height} (gameplay cat ${gameplayPx.toFixed(0)}px)`,
  );

  // two-shot across a natural conversation gap
  for (const gap of [60, 150, 320]) {
    const a = { x: cat.x, y: cat.y };
    const b = { x: cat.x + gap, y: cat.y + 12 };
    const two = planCineFrame({ points: [a, b], shot: "two", view: v });
    const pa = readable({ x: a.x, y: a.y - 30 }, two, v);
    const pb = readable({ x: b.x, y: b.y - 30 }, two, v);
    check(pa.okX && pb.okX && pa.okY && pb.okY, `${label}: two-shot keeps both cats in frame (gap ${gap}px)`, `${pa.x.toFixed(0)}px / ${pb.x.toFixed(0)}px`);
  }

  // framing never leaves the world for a scene inside it
  const centered = planCineFrame({ points: [{ x: 120 * TILE, y: 110 * TILE }], shot: "wide", view: v });
  check(centered.x > 0 && centered.x < v.worldW && centered.y > 0 && centered.y < v.worldH, `${label}: the camera stays inside the world`);
}

// ---------------------------------------------------------------------------
// 2) THE REAL ENGINE: live close-up, two-shot, tracking, return to gameplay
// ---------------------------------------------------------------------------
const noop = () => undefined;
const g = new GameCanvas(canvas as unknown as HTMLCanvasElement, { x: 90 * TILE, y: 116 * TILE }, {
  onAreaChange: noop,
  onNearby: noop,
  onMove: noop,
  onInteract: noop,
  onPreyCaught: noop,
  onClock: noop,
  onWeatherChange: noop,
  onInteriorChange: noop,
  onConvoEnd: noop,
  onRemoteAnim: noop,
  onRemoteVocal: noop,
  onWaypoint: noop,
  onStoryWaypoint: noop,
  onDeath: noop,
  onEmfx: noop,
} as never);

g.setStoryContext("story", 2);
const player = { x: 90 * TILE, y: 116 * TILE };
const graypaw = { x: player.x + 60, y: player.y + 8 };
g.teleport(player.x, player.y);
g.placeNpcForStory("graypaw", graypaw.x, graypaw.y, "player", "sit");
for (let i = 0; i < 20; i++) stepFrame();
const gp = g.getNpcWorldPos("graypaw") ?? graypaw;

const engineView = view(CANVAS_W, CANVAS_H);
const projected = () => {
  const cam = g.cinematicCamera();
  const f = { x: cam.x, y: cam.y, zoom: cam.zoom };
  return {
    player: projectCinePoint(f, player, engineView),
    graypaw: projectCinePoint(f, g.getNpcWorldPos("graypaw") ?? graypaw, engineView),
    zoom: cam.zoom,
  };
};

console.log("— live camera —");
{
  console.log("  (close-up)");
  g.focusCamera({ shot: "close", actors: ["graypaw"], durMs: 700 });
  const before = g.cinematicCamera();
  let maxZoomStep = 0;
  let maxCamStep = 0;
  let prev = { ...before };
  for (let i = 0; i < 90; i++) {
    stepFrame();
    const now = g.cinematicCamera();
    maxZoomStep = Math.max(maxZoomStep, Math.abs(now.zoom - prev.zoom));
    maxCamStep = Math.max(maxCamStep, Math.hypot(now.x - prev.x, now.y - prev.y));
    prev = { ...now };
  }
  const c = projected();
  check(c.zoom > 2.0, "the close-up zooms in on the speaking cat", `zoom ${c.zoom.toFixed(2)}`);
  check(c.graypaw.x > 60 && c.graypaw.x < CANVAS_W - 60, "the close-up subject is inside the frame", `x=${c.graypaw.x.toFixed(0)}`);
  check(c.graypaw.y < CANVAS_H * 0.76, "the close-up face sits above the dialogue box", `y=${c.graypaw.y.toFixed(0)}`);
  check(maxZoomStep < 0.12, "the zoom glides (no snapped shot change)", `max ${maxZoomStep.toFixed(3)}/frame`);
  check(maxCamStep < g.cinematicCamera().scale * 26, "the pan glides (no camera cut)", `max ${maxCamStep.toFixed(1)}px/frame`);

  console.log("  (two-shot)");
  g.focusCamera({ shot: "two", actors: ["player", "graypaw"], durMs: 820 });
  for (let i = 0; i < 80; i++) stepFrame();
  const two = projected();
  check(
    two.player.x > 60 && two.player.x < CANVAS_W - 60 && two.graypaw.x > 60 && two.graypaw.x < CANVAS_W - 60,
    "both cats stay inside a two-shot",
    `${two.player.x.toFixed(0)} / ${two.graypaw.x.toFixed(0)}`,
  );
  check(two.zoom < c.zoom, "a two-shot is wider than a close-up", `${two.zoom.toFixed(2)} < ${c.zoom.toFixed(2)}`);

  console.log("  (tracking a walker)");
  // Graypaw walks to a mark 140px away while the shot keeps both in frame.
  g.setNpcStoryAnchor("graypaw", { x: gp.x + 150, y: gp.y + 20, face: "player", pose: "sit", label: "walking off" });
  const camStart = g.cinematicCamera();
  let driftOut = 0;
  for (let i = 0; i < 150; i++) {
    stepFrame();
    const p = projected();
    if (p.graypaw.x < 40 || p.graypaw.x > CANVAS_W - 40) driftOut++;
  }
  const camEnd = g.cinematicCamera();
  check(Math.hypot(camEnd.x - camStart.x, camEnd.y - camStart.y) > 20, "the camera follows the cat that moves", `${Math.hypot(camEnd.x - camStart.x, camEnd.y - camStart.y).toFixed(0)}px pan`);
  check(driftOut < 8, "the tracked cat never leaves the frame", `${driftOut} bad frames`);
  const walked = g.getNpcWorldPos("graypaw") ?? gp;
  check(Math.hypot(walked.x - gp.x, walked.y - gp.y) > 40, "the tracked cat really walked (no teleport)", `${Math.hypot(walked.x - gp.x, walked.y - gp.y).toFixed(0)}px`);

  console.log("  (return to gameplay)");
  // No teleport here: the camera must come back ON ITS OWN, by gliding.
  const leftOff = g.cinematicCamera();
  g.clearCinematic();
  let maxReturnStep = 0;
  let prevCam = { ...leftOff };
  for (let i = 0; i < 150; i++) {
    stepFrame();
    const now = g.cinematicCamera();
    maxReturnStep = Math.max(maxReturnStep, Math.hypot(now.x - prevCam.x, now.y - prevCam.y));
    prevCam = { ...now };
  }
  const back = g.cinematicCamera();
  check(Math.abs(back.zoom - 1) < 0.06, "the cutscene leaves no zoom behind", `zoom ${back.zoom.toFixed(3)}`);
  check(Math.hypot(back.x - player.x, back.y - player.y) < 60, "the camera returns to the player", `${Math.hypot(back.x - player.x, back.y - player.y).toFixed(0)}px`);
  check(maxReturnStep < 70, "the return is a glide, not a snap", `max ${maxReturnStep.toFixed(1)}px/frame`);
  check(Math.hypot(back.x - leftOff.x, back.y - leftOff.y) > 20, "the camera actually travelled back from the shot");
}

// ---------------------------------------------------------------------------
// 3) REAL ACTING: stepping, turning, posing, and rendering the head cue
// ---------------------------------------------------------------------------
console.log("— acting —");
{
  g.clearCinematic();
  const start = g.getNpcWorldPos("graypaw")!;
  g.setNpcStoryBeat("graypaw", {
    stepTo: { x: start.x - 90, y: start.y },
    face: { x: g.engineState().x, y: g.engineState().y },
    alert: true,
    tail: true,
    talking: true,
    durMs: 2600,
  });
  let maxStep = 0;
  let prev = start;
  for (let i = 0; i < 90; i++) {
    stepFrame();
    const p = g.getNpcWorldPos("graypaw")!;
    maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  const end = g.getNpcWorldPos("graypaw")!;
  check(Math.hypot(end.x - start.x, end.y - start.y) > 50, "a step cue walks the cat (it does not slide a sprite)", `${Math.hypot(end.x - start.x, end.y - start.y).toFixed(0)}px`);
  check(maxStep < 12, "the step is walked frame by frame (no teleport)", `max ${maxStep.toFixed(1)}px/frame`);

  g.setPlayerStoryAct({ pose: "crouch", head: "nod", tail: true, alert: true, talking: true, durMs: 2200 });
  const st = g.engineState();
  check(st.animationState === "crouch", "the player's cat performs a real pose during a cue", st.animationState);

  // The head cue must reach the RENDERER: draw the same cat with and without
  // it and compare the geometry the canvas receives.
  const recs: Record<string, string> = {};
  for (const kind of [undefined, "nod", "shake", "look", "sniff"] as const) {
    const log: RecCtx = { counts: {}, ops: [] };
    const c2 = makeCtx(log);
    drawCat(
      c2 as unknown as CanvasRenderingContext2D,
      { fur: "#8a8f96", furDark: "#5d636a", eye: "#e0b64a", chest: "#e8e3d6", pattern: "tabby" } as never,
      100,
      100,
      1,
      "sit",
      2.5,
      0,
      { tailId: "test-head", head: kind, alert: true },
    );
    recs[kind ?? "none"] = JSON.stringify(log.ops);
  }
  check(recs.none !== recs.nod, "the 'nod' head cue changes the drawn cat");
  check(recs.none !== recs.shake, "the 'shake' head cue changes the drawn cat");
  check(recs.none !== recs.look, "the 'look' head cue changes the drawn cat");
  check(recs.none !== recs.sniff, "the 'sniff' head cue changes the drawn cat");
  check(new Set([recs.none, recs.nod, recs.shake, recs.look, recs.sniff]).size === 5, "each head cue is a distinct motion");
}

// ---------------------------------------------------------------------------
// 4) THE AUTHORED SCENES: shot variety, acting, and book order
// ---------------------------------------------------------------------------
console.log("— authored scenes —");
{
  const encounter = STORY_BEATS["s3-graypaw"];
  const shots = encounter.lines.map((l) => lineCameraShot(l, encounter).shot);
  check(shots[0] === "wide", "the Graypaw encounter opens by establishing the forest", shots.join(","));
  check(shots.includes("close") && shots.filter((s) => s === "close").length >= 2, "the encounter uses close-ups for dialogue", shots.join(","));
  check(shots.includes("two"), "the encounter returns to a two-shot for the interaction", shots.join(","));

  const camp = STORY_BEATS["s4-the-camp"];
  const campShots = camp.lines.map((l) => lineCameraShot(l, camp).shot);
  check(campShots.filter((s) => s === "wide").length >= 2, "the camp arrival uses wide establishing shots", campShots.join(","));
  check(campShots.includes("close"), "the camp arrival moves into closer interactions", campShots.join(","));

  const cues = encounter.lines.flatMap((l) => actingForLine(l, encounter));
  check(cues.some((c) => c.who === "graypaw" && c.step), "Graypaw physically approaches during the encounter");
  check(cues.some((c) => c.who === "graypaw" && c.alert), "Graypaw reacts (ears/startle) during the encounter");
  check(cues.some((c) => c.who === "player" && c.face), "the player's cat turns to the cat who is speaking");
  check(
    encounter.lines.filter((l) => l.speakerId !== "narrator").every((l) => actingForLine(l, encounter).some((c) => c.talking)),
    "every spoken line moves a mouth (no frozen talking)",
  );

  // every story step's lines still produce a valid shot with staged actors
  let bad = 0;
  for (const step of storySteps) {
    const beat = STORY_BEATS[step.id];
    for (const line of beat.lines) {
      const plan = lineCameraShot(line, beat);
      if (!plan.shot || plan.actors.length === 0) bad++;
    }
  }
  check(bad === 0, "every authored line resolves to a shot with subjects", `${bad} bad`);
}

// ---------------------------------------------------------------------------
// 5) SCENE PLAYTHROUGH — the authored encounter and camp arrival, line by
//    line, in the REAL engine: camera, acting and framing measured together.
// ---------------------------------------------------------------------------
console.log("— scene playthrough —");
{
  const stageCanvas = {
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ width: CANVAS_W, height: CANVAS_H, left: 0, top: 0, right: CANVAS_W, bottom: CANVAS_H }),
    width: 0,
    height: 0,
    style: {},
  };
  const noop2 = () => undefined;
  const g2 = new GameCanvas(stageCanvas as unknown as HTMLCanvasElement, { x: 90 * TILE, y: 116 * TILE }, {
    onAreaChange: noop2,
    onNearby: noop2,
    onMove: noop2,
    onInteract: noop2,
    onPreyCaught: noop2,
    onClock: noop2,
    onWeatherChange: noop2,
    onInteriorChange: noop2,
    onConvoEnd: noop2,
    onRemoteAnim: noop2,
    onRemoteVocal: noop2,
    onWaypoint: noop2,
    onStoryWaypoint: noop2,
    onDeath: noop2,
    onEmfx: noop2,
  } as never);
  const posOf = (id: string) => {
    if (id === "player") {
      const s = g2.engineState();
      return { x: s.x, y: s.y };
    }
    return g2.getNpcWorldPos(id);
  };

  for (const [beatId, stepIndex] of [
    ["s3-graypaw", 2],
    ["s4-the-camp", 3],
  ] as const) {
    const beat = STORY_BEATS[beatId];
    const staged = STAGED_STEPS[beatId];
    g2.setStoryContext("story", stepIndex);
    // stage the scene like the story layer does: the player at the scene, the
    // cast on their real marks (a controlled scene-init placement)
    g2.teleport(staged.scene!.x, staged.scene!.y + 40);
    const guide = escortForStep(beatId)?.npcId;
    for (const role of staged.npcs) {
      if (role.npcId === "player") continue;
      if (!g2.getNpcWorldPos(role.npcId)) continue;
      // the guide has just finished leading the player in: he is next to them,
      // not parked back at the gorse tunnel
      if (role.npcId === guide) {
        g2.placeNpcForStory(role.npcId, staged.scene!.x + 46, staged.scene!.y + 92, "player", "sit");
      } else {
        g2.placeNpcForStory(role.npcId, role.x, role.y, role.face, role.pose === "crouch" ? "crouch" : "sit");
      }
    }
    for (let i = 0; i < 10; i++) stepFrame();

    let offScreen = 0;
    let tooLow = 0;
    let maxCamStep = 0;
    let prevCam = g2.cinematicCamera();
    const zooms: number[] = [];
    let moved = 0;
    const walkStart = new Map<string, { x: number; y: number }>();
    for (const id of ["player", ...staged.npcs.map((n) => n.npcId)]) {
      const p = posOf(id);
      if (p) walkStart.set(id, { ...p });
    }

    for (const line of beat.lines) {
      const plan = lineCameraShot(line, beat);
      g2.focusCamera({ shot: plan.shot, actors: plan.actors, durMs: 760 });
      for (const cue of actingForLine(line, beat)) {
        const r = resolveCue(cue, posOf, line.holdMs ?? 2800);
        if (r.who === "player") {
          g2.setPlayerStoryAct({
            face: r.face,
            pose: r.pose,
            head: r.head,
            tail: r.tail,
            alert: r.alert,
            talking: r.talking,
            durMs: r.durMs,
          });
        } else {
          g2.setNpcStoryBeat(r.who, {
            pose: r.pose,
            head: r.head,
            tail: r.tail,
            alert: r.alert,
            talking: r.talking,
            face: r.face,
            stepTo: r.stepTo,
            durMs: r.durMs,
          });
        }
      }
      const frames = Math.min(220, Math.round((line.holdMs ?? 2800) / 16.7));
      for (let i = 0; i < frames; i++) {
        stepFrame();
        const cam = g2.cinematicCamera();
        maxCamStep = Math.max(maxCamStep, Math.hypot(cam.x - prevCam.x, cam.y - prevCam.y));
        prevCam = cam;
      }
      const cam = g2.cinematicCamera();
      const frame = { x: cam.x, y: cam.y, zoom: cam.zoom };
      zooms.push(cam.zoom);
      for (const id of plan.actors) {
        const p = posOf(id);
        if (!p) continue;
        const head = projectCinePoint(frame, { x: p.x, y: p.y - 34 }, engineView);
        if (head.x < 24 || head.x > CANVAS_W - 24 || head.y < 34) offScreen++;
        if (head.y > CANVAS_H * 0.76) tooLow++;
      }
    }
    g2.clearCinematic();
    for (let i = 0; i < 40; i++) stepFrame();

    for (const [id, start] of walkStart) {
      const p = posOf(id);
      if (p) moved = Math.max(moved, Math.hypot(p.x - start.x, p.y - start.y));
    }

    check(offScreen === 0, `${beatId}: no subject is ever clipped by the frame`, `${offScreen} clipped`);
    check(tooLow === 0, `${beatId}: no face is ever hidden by the dialogue box`, `${tooLow} hidden`);
    check(maxCamStep < 26, `${beatId}: the whole scene moves as glides, never cuts`, `max ${maxCamStep.toFixed(1)}px/frame`);
    check(Math.max(...zooms) > 1.5, `${beatId}: the scene actually uses close framing`, `max zoom ${Math.max(...zooms).toFixed(2)}`);
    check(moved > 6, `${beatId}: the cast physically acts the scene (someone moves)`, `${moved.toFixed(0)}px`);
    check(Math.abs(g2.cinematicCamera().zoom - 1) < 0.08, `${beatId}: gameplay framing comes back after the scene`);
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);

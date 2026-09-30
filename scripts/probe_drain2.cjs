// probe 2: instrument queueRemoteAction + startRemoteEmote + drainActions
const gradient = { addColorStop: () => undefined };
function makeCtx() {
  const target = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 12 });
      if (prop === "createRadialGradient" || prop === "createLinearGradient" || prop === "createPattern") return () => gradient;
      if (prop === "canvas") return canvas;
      return () => undefined;
    },
    set() { return true; },
  });
}
const ctx = makeCtx();
const canvas = {
  getContext: () => ctx,
  getBoundingClientRect: () => ({ width: 1280, height: 720, left: 0, top: 0, right: 1280, bottom: 720 }),
  width: 0, height: 0, style: {},
};
globalThis.window = { addEventListener: () => undefined, removeEventListener: () => undefined, setTimeout, clearTimeout };
let simNow = 0;
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = () => undefined;
globalThis.performance = { now: () => simNow };

const { GameCanvas, EMOTE_DEFS } = await import("../src/game/engine");
const { SPAWN } = await import("../src/game/world");

console.log("EMOTE_DEFS.dance1 =", JSON.stringify(EMOTE_DEFS.dance1));

const g = new GameCanvas(canvas, SPAWN, {
  onAreaChange: () => undefined, onNearby: () => undefined, onMove: () => undefined,
  onInteract: () => undefined, onPreyCaught: () => undefined, onClock: () => undefined,
  onWeatherChange: () => undefined, onInteriorChange: () => undefined, onNpcIdle: () => undefined,
});

// wrap queue
const origQ = g.queueRemoteAction.bind(g);
g.queueRemoteAction = (k, p, u) => { console.log("[queue]", k, p, u); return origQ(k, p, u); };

function pump(ms) {
  const frames = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < frames; i++) { simNow += 16; rafCb && rafCb(simNow); }
}

// TEST A: direct startRemoteEmote
console.log("--- TEST A: direct startRemoteEmote ---");
g.startRemoteEmote("userA", "dance1");
console.log("remoteEmotes after direct push:", JSON.stringify(g.remoteEmotes));
console.log("pose userA:", JSON.stringify(g.remoteEmotePose("userA")));
console.log("remoteEmotes after pose query:", JSON.stringify(g.remoteEmotes));

// TEST B: queue path, one frame at a time
console.log("--- TEST B: queue + single frame ---");
g.queueRemoteAction("action", "anim:dance1", "userB");
console.log("pendingActions right after queue:", JSON.stringify((g.pendingActions ?? []).map((a) => ({ k: a.kind, p: a.payload, u: a.uid }))));
pump(16);
console.log("remoteEmotes after 1 frame:", JSON.stringify(g.remoteEmotes));
console.log("pose userB:", JSON.stringify(g.remoteEmotePose("userB")));

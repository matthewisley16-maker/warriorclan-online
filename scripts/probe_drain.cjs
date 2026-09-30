// probe: does update() run + drainActions fire under test stubs?
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

const { GameCanvas } = await import("../src/game/engine");
const { SPAWN } = await import("../src/game/world");

console.log("prototype methods:", Object.getOwnPropertyNames(GameCanvas.prototype).join(", "));

let drainCalls = 0;
const origDrain = GameCanvas.prototype.drainActions;
if (origDrain) GameCanvas.prototype.drainActions = function (...a) { drainCalls++; return origDrain.apply(this, a); };
else console.log("!! no drainActions on prototype");

const g = new GameCanvas(canvas, SPAWN, {
  onAreaChange: () => undefined, onNearby: () => undefined, onMove: () => undefined,
  onInteract: () => undefined, onPreyCaught: () => undefined, onClock: () => undefined,
  onWeatherChange: () => undefined, onInteriorChange: () => undefined, onNpcIdle: () => undefined,
});
g.queueRemoteAction("action", "anim:dance1", "userB");

function pump(ms) {
  const frames = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < frames; i++) { simNow += 16; rafCb && rafCb(simNow); }
}
pump(1000);
console.log("after pump: drainCalls =", drainCalls, "performance.now =", simNow);
console.log("pendingActions =", JSON.stringify(g.pendingActions ?? "n/a"));
console.log("remoteEmotes =", JSON.stringify(g.remoteEmotes ?? "n/a"));
console.log("this.time =", g.time);
console.log("remoteEmotePose('userB') =", JSON.stringify(g.remoteEmotePose ? g.remoteEmotePose("userB") : "n/a"));

// also try calling update directly if it exists
if (typeof g.update === "function") {
  try { g.update(16); console.log("direct g.update(16) ok; remoteEmotes now:", JSON.stringify(g.remoteEmotes)); }
  catch (e) { console.log("direct g.update(16) threw:", String(e)); }
} else {
  console.log("no public update method on instance");
}

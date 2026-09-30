// patch90: draw.ts — real-animation emote poses (spec §10/§11).
// Every emote becomes an actual cat animation; adds head-acting overlay,
// prey-carry, and four distinct dances. Aborts without writing on any miss.
const fs = require("fs");
const P = "src/game/draw.ts";
const src = fs.readFileSync(P, "utf8");
const reps = [];
function rep(oldS, newS, tag) {
  const i = src.split(oldS).length - 1;
  if (i !== 1) {
    console.error(`ABORT: anchor ${tag} matched ${i} times (expected 1)`);
    process.exit(1);
  }
  reps.push([oldS, newS]);
}

// 1. pose vocabulary + pose families -------------------------------------------------
rep(
`export type CatPose = "walk" | "sit" | "sleep" | "crouch" | "groom" | "stretch" | "swim" | "shake";`,
`export type CatPose =
  | "walk" | "sit" | "sleep" | "crouch" | "groom" | "stretch" | "swim" | "shake"
  // real-animation emotes (spec: the CAT performs every emote — never icons)
  | "lie" | "yawn" | "sniff" | "stalk" | "pounce" | "leap" | "play" | "bow"
  | "scratch" | "challenge" | "dance1" | "dance2" | "dance3" | "dance4";

/** Idle-family poses share the upright sitting silhouette anchors. */
const IDLE_POSES: ReadonlySet<string> = new Set(["sit", "groom", "yawn", "sniff", "scratch"]);
/** Lying-flat poses: belly on the ground, tucked paws. */
const LYING_POSES: ReadonlySet<string> = new Set(["sleep", "lie", "play"]);
/** Low-slung crouched poses (chest dips, rear stays up). */
const CROUCHED_POSES: ReadonlySet<string> = new Set(["crouch", "stalk", "pounce", "challenge", "bow"]);
/** Dance lean amplitude (radians) — each dance sways differently. */
const DANCE_ROT: Record<string, number> = {
  dance1: 0.05, dance2: 0.1, dance3: 0.16, dance4: 0.22,
};
/** Silhouette family for a pose (drives which body anchors are used). */
function baseFamilyOf(pose: CatPose): "stand" | "sit" | "sleep" | "crouch" | "swim" {
  if (pose === "swim") return "swim";
  if (LYING_POSES.has(pose)) return "sleep";
  if (CROUCHED_POSES.has(pose)) return "crouch";
  if (IDLE_POSES.has(pose)) return "sit";
  return "stand";
}
function isLie(p: CatPose): boolean {
  return LYING_POSES.has(p);
}`,
"pose-union");

// 2. fx interface: head acting + prey carry ------------------------------------------
rep(
`  fx?: { yawn?: boolean; alert?: boolean; tailFlick?: boolean; talking?: boolean; wet?: boolean; hop?: number },`,
`  fx?: { yawn?: boolean; alert?: boolean; tailFlick?: boolean; talking?: boolean; wet?: boolean; hop?: number; head?: "nod" | "shake" | "look" | "sniff"; carry?: boolean },`,
"fx-interface");

// 3. dance/hop bob --------------------------------------------------------------------
rep(
`  const size = skin.size ?? 1;
  const moving = pose === "walk" || pose === "swim";
  const SWIM_BOB_HZ = 1.1;
  const bob = moving
    ? Math.abs(Math.sin(time * 9 + phase)) * 1.6
    : Math.sin(time * 1.4 + phase) * 0.5;`,
`  const size = skin.size ?? 1;
  const moving = pose === "walk" || pose === "swim";
  const SWIM_BOB_HZ = 1.1;
  const fam = baseFamilyOf(pose);
  // dances: each has its own beat (bounce + body sway below)
  const dancePhase = pose === "dance1" ? time * 4.6 : pose === "dance2" ? time * 6.2 : pose === "dance3" ? time * 7.4 : pose === "dance4" ? time * 3.6 : 0;
  const danceBounce = DANCE_ROT[pose] !== undefined ? Math.abs(Math.sin(dancePhase)) * 3.2 : 0;
  const bob = moving
    ? Math.abs(Math.sin(time * 9 + phase)) * 1.6
    : pose === "play" || pose === "leap"
      ? Math.abs(Math.sin(time * 3.2 + phase)) * 3.4
      : pose === "pounce"
        ? Math.abs(Math.sin(time * 1.6 + phase)) * 1.8
        : Math.sin(time * 1.4 + phase) * 0.5 + danceBounce;`,
"bob");

// 4. dance lean + crouch lean + lying drop -------------------------------------------
rep(
`  if (pose === "shake") {
    ctx.translate(shakeWobble, 0);
  }`,
`  if (pose === "shake") {
    ctx.translate(shakeWobble, 0);
  }
  // dance lean: the body rocks around its center to the beat
  if (DANCE_ROT[pose] !== undefined) {
    ctx.rotate(Math.sin(dancePhase) * DANCE_ROT[pose]);
  }
  // crouched/half-up lean: chest dips, rear rises (pounce/play bow/challenge)
  if (pose === "stalk" || pose === "pounce") {
    ctx.rotate(-0.14);
  } else if (pose === "bow" || pose === "play") {
    ctx.rotate(0.2);
  } else if (pose === "challenge") {
    ctx.rotate(0.08);
  }
  // lying flat: drop the whole sprite toward the ground line
  if (isLie(pose)) {
    ctx.translate(0, 3.5);
  }`,
"leans");

// 5. breathing continues during one dance beat ----------------------------------------
rep(
`  const breath = pose === "walk" || pose === "swim" || pose === "shake"
    ? 1`,
`  const breath = pose === "walk" || pose === "swim" || pose === "shake" || pose === "dance3"
    ? 1`,
"breath");

// 6. tail anchors by family + dance tail wave -----------------------------------------
rep(
`  } else if (pose === "sit") {
    ctx.moveTo(-10, -4);
    ctx.quadraticCurveTo(-18 * tailLen, -2, -16 * tailLen, 6);
  } else if (pose === "sleep") {
    ctx.moveTo(-8, -3);
    ctx.quadraticCurveTo(-14, 0, -12 * tailLen, 4);
  } else {
    ctx.moveTo(-11, -8);`,
`  } else if (fam === "sit") {
    ctx.moveTo(-10, -4);
    ctx.quadraticCurveTo(-18 * tailLen, -2, -16 * tailLen, 6);
  } else if (fam === "sleep") {
    ctx.moveTo(-8, -3);
    ctx.quadraticCurveTo(-14, 0, -12 * tailLen, 4);
  } else if (pose === "dance1" || pose === "dance3") {
    // upright tail waving high on the beat
    ctx.moveTo(-10, -8);
    ctx.quadraticCurveTo(-17 * tailLen, -16 + Math.sin(dancePhase * 2) * 6, -20 * tailLen, -26 + Math.sin(dancePhase * 2) * 8);
  } else {
    ctx.moveTo(-11, -8);`,
"tail");

// 7. body anchors by family ------------------------------------------------------------
rep(
`  } else if (pose === "crouch") {
    ctx.ellipse(0, -5, 12.5, 5.5, 0, 0, Math.PI * 2);
  } else {`,
`  } else if (fam === "crouch") {
    ctx.ellipse(0, -5, 12.5, 5.5, 0, 0, Math.PI * 2);
  } else {`,
"body");

// 8. pounce/leap body pitch + head base x ------------------------------------------------
rep(
`  // head (groom pose dips toward the chest to lick it)
  const groomDip = pose === "groom" ? Math.max(0, Math.sin(time * 5.5)) : 0;
  const stretchOut = pose === "stretch" ? 3.5 + Math.max(0, Math.sin(time * 2.2)) * 2 : 0;
  const headX = (pose === "sit" || pose === "groom" ? 4 : pose === "stretch" ? 13 : 9) - groomDip * 1.5 + stretchOut * 0.4;`,
`  // pounce/leap: the body pitches while the ground point stays put
  if (pose === "pounce") {
    ctx.rotate(0.1 + Math.max(0, Math.sin(time * 1.6)) * 0.08);
  } else if (pose === "leap") {
    ctx.rotate(-0.16);
  }
  // head (groom pose dips toward the chest to lick it)
  const groomDip = pose === "groom" ? Math.max(0, Math.sin(time * 5.5)) : 0;
  const stretchOut = pose === "stretch" ? 3.5 + Math.max(0, Math.sin(time * 2.2)) * 2 : 0;
  const headBaseX = (fam === "sit" || pose === "groom" ? 4 : pose === "stretch" ? 13 : 9) - groomDip * 1.5 + stretchOut * 0.4;`,
"headbase");

// 9. head y by family -------------------------------------------------------------------
rep(
`  const headY =
    (pose === "swim" ? -8 : pose === "sit" ? -16 : pose === "sleep" ? -8 : pose === "crouch" ? -8 : -11) + groomDip * 5;`,
`  const headY =
    (fam === "swim" ? -8 : fam === "sit" ? -16 : fam === "sleep" ? -8 : fam === "crouch" ? -8 : -11) + groomDip * 5;`,
"heady");

// 10. head-acting overlay: nod/shake/look/sniff move ONLY the head ----------------------
rep(
`  ctx.beginPath();
  ctx.arc(headX, headY, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ears (alert pricks both ears upright and forward)`,
`  ctx.beginPath();
  ctx.arc(headX, headY, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // head-acting overlay: nod / head-shake / look-around / sniff move ONLY the
  // head — everything after this point is drawn inside the head translate
  let headActDx = 0;
  let headActDy = 0;
  if (fx?.head === "nod") headActDy = Math.abs(Math.sin(time * 4.2)) * 2.2;
  else if (fx?.head === "shake") headActDx = Math.sin(time * 10) * 2.6;
  else if (fx?.head === "look") headActDx = Math.sin(time * 1.7) * 2.4;
  else if (fx?.head === "sniff") { headActDy = 3.2; headActDx = 1.4; }
  ctx.save();
  ctx.translate(headActDx, headActDy);

  // ears (alert pricks both ears upright and forward)`,
"headact");

// 11. ears turn with look-around ----------------------------------------------------------
rep(
`  const earDx = fx?.alert ? -2 : 0;`,
`  const earDx = (fx?.alert ? -2 : 0) + (fx?.head === "look" ? (Math.sin(time * 1.7) > 0 ? 1 : -1) : 0);`,
"eardx");

// 12. legs: lying tuck + stretch forelegs ---------------------------------------------------
rep(
`  } else if (pose === "sleep") {
    // tucked paws — small nubs
    ctx.fillStyle = skin.furDark;
    ctx.fillRect(-8, -2, 3, 3);
    ctx.fillRect(5, -2, 3, 3);
  } else {`,
`  } else if (isLie(pose)) {
    // tucked paws — small nubs (sleep AND the lying-down emote)
    ctx.fillStyle = skin.furDark;
    ctx.fillRect(-8, -2, 3, 3);
    ctx.fillRect(5, -2, 3, 3);
  } else if (pose === "stretch") {
    // forelegs extended, chest low — the classic play-bow stretch
    ctx.fillStyle = skin.furDark;
    ctx.fillRect(-9, -3, 4, 6);
    ctx.fillStyle = skin.fur;
    ctx.fillRect(7, -2, 6, 4);
  } else {`,
"legs");

// 13. chest hidden while lying flat ----------------------------------------------------------
rep(
`  if (skin.chest && pose !== "sleep") {`,
`  if (skin.chest && !isLie(pose)) {`,
"chest");

// 14. eyes closed while lying flat -----------------------------------------------------------
rep(
`    pose === "sleep" ? 0.08 : Math.sin(time * 0.9 + phase * 3) > 0.985 ? 0.15 : 1;`,
`    isLie(pose) ? 0.08 : Math.sin(time * 0.9 + phase * 3) > 0.985 ? 0.15 : 1;`,
"blink");

// 15. whiskers quiver while sniffing ----------------------------------------------------------
rep(
`  ctx.beginPath();
  ctx.moveTo(headX + 6, headY + 1.5);
  ctx.lineTo(headX + 11, headY + 0.5);
  ctx.moveTo(headX + 6, headY + 2.5);
  ctx.lineTo(headX + 11, headY + 3);
  ctx.stroke();`,
`  ctx.beginPath();
  if (fx?.head === "sniff") {
    const q = Math.sin(time * 22) * 0.9;
    ctx.moveTo(headX + 6, headY + 1.5 + q);
    ctx.lineTo(headX + 11, headY + 0.5 + q);
    ctx.moveTo(headX + 6, headY + 2.5 - q);
    ctx.lineTo(headX + 11, headY + 3 - q);
  } else {
    ctx.moveTo(headX + 6, headY + 1.5);
    ctx.lineTo(headX + 11, headY + 0.5);
    ctx.moveTo(headX + 6, headY + 2.5);
    ctx.lineTo(headX + 11, headY + 3);
  }
  ctx.stroke();`,
"whiskers");

// 16. markings hidden while lying flat ---------------------------------------------------------
rep(
`  if (mk.size > 0 && pose !== "swim") {`,
`  if (mk.size > 0 && pose !== "swim" && !isLie(pose)) {`,
"markings");

// 17. neck fluff hidden while lying flat ---------------------------------------------------------
rep(
`  if (fluff && pose !== "swim") {`,
`  if (fluff && pose !== "swim" && !isLie(pose)) {`,
"fluff");

// 18. prey carry + close the head-acting translate -------------------------------------------
rep(
`  ctx.restore();

  // tail flick: drawn OUTSIDE`,
`  // prey in the jaws (carry emote): a small mouse hangs from the mouth
  if (fx?.carry) {
    ctx.fillStyle = "#8f8f96";
    ctx.beginPath();
    ctx.ellipse(headX + 8.5, headY + 3.2, 4.6, 2.4, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#9c9ca4";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(headX + 4.5, headY + 3);
    ctx.quadraticCurveTo(headX + 2, headY + 6.5, headX + 0.5, headY + 8.5);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  ctx.restore();
  ctx.restore();

  // tail flick: drawn OUTSIDE`,
"carry-restore");

let out = src;
for (const [o, n] of reps) out = out.replace(o, n);
fs.writeFileSync(P, out);
console.log(`patch90: applied ${reps.length} replacements to ${P}`);

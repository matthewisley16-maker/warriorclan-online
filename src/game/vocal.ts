// WarriorCatsRPG — Character vocal identity system (§13-§21).
//
// Cats NEVER speak human language out loud. Written dialogue stays on screen;
// each line is accompanied by a SHORT expressive cat vocalization (0.1-0.8s)
// whose character and emotion come from the speaker's vocal profile.
//
// Design rules baked in here:
//  - §16: every important character has their OWN profile (sound pool, pitch,
//    volume, tempo) derived from their personality — never one meow for all.
//  - §17: the sound follows the EMOTION of the line (happy/confused/angry/...),
//    not a random pick.
//  - §18: one vocalization per line — never per letter.
//  - §19: every profile draws from several sound slots + random pitch jitter,
//    with anti-repeat so the same variant rarely plays twice in a row.

export type VocalEmotion =
  | "calm" | "happy" | "confused" | "angry" | "scared"
  | "excited" | "sad" | "surprised" | "firm";

export const VOCAL_EMOTIONS: readonly VocalEmotion[] = [
  "calm", "happy", "confused", "angry", "scared", "excited", "sad", "surprised", "firm",
] as const;

/** Sound slots the synth/sample engine understands (audio.ts renders these). */
export type VocalSound =
  | "mew" | "mew_soft" | "mew_low" | "mew_question" | "mew_bright"
  | "chirp" | "trill" | "purr" | "mrrp" | "hiss" | "growl" | "yowl";

export interface VocalProfile {
  /** base pool per emotion family; each entry is [sound, weight] */
  calm: VocalSound[];
  happy: VocalSound[];
  confused: VocalSound[];
  angry: VocalSound[];
  scared: VocalSound[];
  excited: VocalSound[];
  sad: VocalSound[];
  surprised: VocalSound[];
  firm: VocalSound[];
  /** playback pitch range (playbackRate multiplier) */
  pitch: [number, number];
  /** playback volume range 0..1 (before SFX bus) */
  vol: [number, number];
}

/** Compact builder so the ~30 profiles below stay readable. */
function P(
  base: VocalSound[],
  happy: VocalSound[],
  pitch: [number, number],
  vol: [number, number] = [0.42, 0.6],
  overrides: Partial<Record<VocalEmotion, VocalSound[]>> = {},
): VocalProfile {
  return {
    calm: base,
    happy,
    confused: overrides.confused ?? ["mew_question", "mrrp"],
    angry: overrides.angry ?? ["hiss", "mew_low"],
    scared: overrides.scared ?? ["mew_soft", "mew_question"],
    excited: overrides.excited ?? happy,
    sad: overrides.sad ?? ["mew_low", "mew_soft"],
    surprised: overrides.surprised ?? ["chirp", "mew_bright"],
    firm: overrides.firm ?? base,
    pitch,
    vol,
  };
}

/**
 * Vocal profiles for the story cast + player. ids match characters.ts /
 * "player" for the player's own cat (§21). Extra background cats fall back
 * through fallbackProfileFor (rank/age based) so EVERY cat vocalizes.
 */
export const VOCAL_PROFILES: Record<string, VocalProfile> = {
  // --- the player's cat: bright, curious, youthful (§21) ---
  player: P(["mew", "mew_bright"], ["chirp", "mew_bright", "trill"], [1.08, 1.3]),

  // --- ThunderClan leadership: calm, weighty authority ---
  bluestar: P(
    ["mew_soft", "mew_low", "trill"],
    ["trill", "mew_soft"],
    [0.82, 0.98],
    [0.4, 0.56],
    { firm: ["mew_low", "mrrp"], angry: ["growl", "mew_low"], sad: ["mew_low"], surprised: ["mew_question"] },
  ),
  lionheart: P(["mew", "mew_low"], ["mew_bright", "mew"], [0.9, 1.05], [0.44, 0.6], {
    firm: ["mew_low", "mrrp"], angry: ["growl"],
  }),
  tigerclaw: P(
    ["mew_low", "growl"],
    ["mew_low"],
    [0.72, 0.86],
    [0.5, 0.68],
    { angry: ["growl", "hiss"], firm: ["growl", "mew_low"], happy: ["mew_low"], excited: ["mew_low"], surprised: ["mew_low"] },
  ),
  redtail: P(["mew", "mew_soft"], ["mew_bright"], [0.95, 1.1]),
  whitestorm: P(["mew", "mew_soft"], ["trill", "mew"], [0.88, 1.02], [0.44, 0.6], { firm: ["mew_low"] }),

  // --- medicine cats: gentle, deliberate ---
  spottedleaf: P(
    ["mew_soft", "trill"],
    ["chirp", "trill"],
    [1.0, 1.15],
    [0.36, 0.5],
    { scared: ["mew_soft"], firm: ["mew_soft", "mew"] },
  ),
  yellowfang: P(
    ["mrrp", "mew_low"],
    ["mrrp"],
    [0.8, 0.95],
    [0.46, 0.62],
    { angry: ["hiss", "growl"], confused: ["mrrp", "mew_question"], sad: ["mew_low"], happy: ["mew_soft"], firm: ["mew_low", "hiss"] },
  ),

  // --- the apprentices: energy and youth ---
  graypaw: P(
    ["mew_bright", "mew", "chirp"],
    ["chirp", "trill", "mew_bright"],
    [1.12, 1.35],
    [0.48, 0.66],
    { excited: ["chirp", "trill", "mew_bright"], confused: ["mew_question", "mrrp"], scared: ["mew_soft", "mew_question"] },
  ),
  ravenpaw: P(
    ["mew_soft", "mew"],
    ["mew_soft", "chirp"],
    [1.05, 1.25],
    [0.34, 0.48],
    { scared: ["mew_soft", "mew_question"], happy: ["chirp"], excited: ["mew_bright", "chirp"] },
  ),
  dustpaw: P(["mew", "mew_low"], ["mew"], [0.95, 1.12], [0.44, 0.6], { angry: ["hiss", "mew_low"], firm: ["mew_low"] }),
  sandpaw: P(
    ["mew", "mew_bright"],
    ["chirp", "mew_bright"],
    [1.05, 1.25],
    [0.44, 0.6],
    { angry: ["hiss", "mew"], firm: ["mew", "mew_low"] },
  ),

  // --- Twolegplace ---
  rusty: P(["mew", "mew_bright"], ["chirp", "mew_bright"], [1.08, 1.3]),
  smudge: P(["mew", "mew_soft"], ["mew_bright", "chirp"], [1.05, 1.28]),
  princess: P(["mew_soft", "trill"], ["trill", "chirp"], [1.1, 1.3]),

  // --- elsewhere ---
  barley: P(["mew", "mew_soft"], ["trill", "mew"], [0.9, 1.08]),
  princess_kit: P(["mew_bright"], ["mew_bright", "chirp"], [1.3, 1.55], [0.34, 0.46]),

  // --- other Clans (story-beat speakers get real identities too) ---
  oakheart: P(
    ["mew", "mew_low"],
    ["mew_bright", "trill"],
    [0.86, 1.02],
    [0.46, 0.62],
    { firm: ["mew_low", "mrrp"], angry: ["growl"], happy: ["trill"] },
  ),
  tallstar: P(
    ["mew", "trill"],
    ["trill", "chirp", "mew_bright"],
    [0.95, 1.12],
    [0.42, 0.58],
    { confused: ["mew_question", "mrrp"], firm: ["mew"] },
  ),
};

/** Profiles for background cats keyed by rank/age flavor (§16 — no clones). */
export const FALLBACK_PROFILES: { keys: string[]; profile: VocalProfile }[] = [
  { keys: ["leader"], profile: P(["mew_low", "mew"], ["trill"], [0.82, 0.98], [0.44, 0.6], { firm: ["mew_low"], angry: ["growl"] }) },
  { keys: ["deputy", "warrior"], profile: P(["mew", "mew_low"], ["mew_bright"], [0.9, 1.1], [0.44, 0.6], { firm: ["mew_low"] }) },
  { keys: ["medicine-cat"], profile: P(["mew_soft", "trill"], ["chirp"], [1.0, 1.15], [0.36, 0.5]) },
  { keys: ["apprentice", "kit"], profile: P(["mew_bright", "mew"], ["chirp", "trill"], [1.15, 1.4], [0.4, 0.56]) },
  { keys: ["elder"], profile: P(["mew_low", "mrrp"], ["mrrp"], [0.78, 0.92], [0.36, 0.5], { confused: ["mrrp"] }) },
  { keys: ["queen"], profile: P(["mew_soft", "trill"], ["trill", "chirp"], [1.0, 1.2], [0.36, 0.5]) },
];

const DEFAULT_PROFILE = P(["mew", "mew_soft"], ["mew_bright", "chirp"], [0.95, 1.2]);

/** Resolve the vocal profile for any speaker id (player included). */
export function vocalProfileFor(speakerId: string): VocalProfile {
  return VOCAL_PROFILES[speakerId] ?? DEFAULT_PROFILE;
}

/** Anti-repeat memory: last few sounds per speaker never repeat immediately. */
const recent = new Map<string, VocalSound[]>();

/** §17/§19: pick a sound for this speaker/emotion with variation + no repeats. */
export function pickVocal(speakerId: string, emotion: VocalEmotion): { sound: VocalSound; rate: number; vol: number } {
  const p = vocalProfileFor(speakerId);
  const pool = p[emotion] ?? p.calm;
  const seen = recent.get(speakerId) ?? [];
  // prefer a sound not used in this speaker's last 2 vocalizations
  let candidates = pool.filter((s) => !seen.includes(s));
  if (candidates.length === 0) candidates = pool.length ? pool : ["mew"];
  const sound = candidates[Math.floor(Math.random() * candidates.length)];
  seen.push(sound);
  while (seen.length > 2) seen.shift();
  recent.set(speakerId, seen);
  const rate = p.pitch[0] + Math.random() * (p.pitch[1] - p.pitch[0]);
  const vol = p.vol[0] + Math.random() * (p.vol[1] - p.vol[0]);
  return { sound, rate: Math.round(rate * 100) / 100, vol: Math.round(vol * 100) / 100 };
}

/**
 * §17 heuristic: infer a line's emotion from its text so written dialogue and
 * its vocalization always agree. Authors may override per line.
 */
export function emotionForLine(text: string, fallback: VocalEmotion = "calm"): VocalEmotion {
  const t = text.toLowerCase();
  if (/[!]$/.test(text.trim()) || /attack|kill|danger|enemy|fight/.test(t)) return "firm";
  if (/\?/.test(text) && /what|why|how|who|where|really/.test(t)) return "confused";
  if (/\?/.test(text)) return "confused";
  if (/run!|hide|watch out|fox|dog|danger/.test(t)) return "scared";
  if (/welcome|well done|good|glad|warm|wonderful|excellent/.test(t)) return "happy";
  if (/sorry|grief|lost|gone|miss|died|death/.test(t)) return "sad";
  if (/hiss|mouse-brain|fool|never/.test(t)) return "angry";
  if (/come on|quick|now!|race|let's go/.test(t)) return "excited";
  if (/[!]$/.test(text.trim()) && t.length < 24) return "surprised";
  return fallback;
}

// WarriorCatsRPG — audio system (music / ambience / SFX).
//
// Design rules (spec): one music channel at a time, layered ambience by
// location + weather + time of day, fade-based transitions (never abrupt
// cuts or restarts when re-entering the same area), lazy loading so mobile
// only fetches what it plays, and every bus controlled from Settings.
//
// Assets are CC0/Creative-Commons files bundled in /public/audio (sources and
// per-slot Pixabay swap guidance in public/audio/README.md).

export type AudioSettings = {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  muteMusic: boolean;
  muteSfx: boolean;
  muteAmbience: boolean;
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  ambience: 0.7,
  muteMusic: false,
  muteSfx: false,
  muteAmbience: false,
};

const STORAGE_KEY = "wcrpg-audio-settings";
const BASE = "/audio/";
const FADE_MS = 1600; // music/ambience crossfade time
const FADE_STEP_MS = 50;

// ---------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------

export type MusicId = "thunderclan" | "riverclan" | "windclan" | "shadowclan" | "twoleg";

const MUSIC_FILES: Record<MusicId, string> = {
  thunderclan: "music/junkala_stage1.ogg", // warm adventurous forest chiptune
  riverclan: "music/junkala_stage_select.ogg", // flowing, calm
  windclan: "music/junkala_stage2.ogg", // light, energetic, open
  shadowclan: "music/junkala_boss.ogg", // low, dark, mysterious
  twoleg: "music/junkala_stage_select.ogg", // quieter reuse (volume-trimmed)
};

const MUSIC_GAIN: Record<MusicId, number> = {
  thunderclan: 1,
  riverclan: 0.95,
  windclan: 1,
  shadowclan: 0.9,
  twoleg: 0.55, // "quieter, more unusual" per spec
};

export type AmbienceLayerId =
  | "forestDay" | "birdsDay" | "nightCrickets" | "rainLight" | "rainHeavy"
  | "storm" | "wind" | "river";

interface LayerSpec { src: string; loop: boolean; gain: number }

const LAYERS: Record<AmbienceLayerId, LayerSpec> = {
  forestDay: { src: "ambience/forest_day.mp3", loop: true, gain: 0.9 },
  birdsDay: { src: "ambience/birds_day.mp3", loop: true, gain: 0.8 },
  nightCrickets: { src: "ambience/night_crickets.mp3", loop: true, gain: 0.9 },
  rainLight: { src: "ambience/rain_light.mp3", loop: true, gain: 0.8 },
  rainHeavy: { src: "ambience/rain_heavy.mp3", loop: true, gain: 0.85 },
  storm: { src: "ambience/storm.ogg", loop: true, gain: 0.95 },
  wind: { src: "ambience/wind.ogg", loop: true, gain: 0.9 },
  river: { src: "ambience/river.mp3", loop: true, gain: 0.85 },
};

export type SfxName =
  | "ui_click" | "ui_open" | "ui_move" | "ui_confirm" | "ui_cancel"
  | "collect" | "door" | "jump" | "land" | "hunt_pounce" | "hunt_rustle" | "swim"
  | "quest_done" | "rank_up" | "clan_join"
  | "cat_mew" | "cat_mew2" | "cat_mew3" | "cat_mew4" | "cat_purr"
  | "splash" | "eat" | "herb" | "drink" | "hit" | "shake";
/** Engine-side sfx names (engine.ts) -> audio slots. */
export type EngineSfxName = "mew" | "shake" | "splash" | "eat" | "herb" | "drink" | "hit" | "npcstep";

const SFX_FILES: Record<SfxName, string> = {
  ui_click: "sfx/ui_click.wav",
  ui_open: "sfx/ui_open.wav",
  ui_move: "sfx/ui_move.wav",
  ui_confirm: "sfx/ui_confirm.wav",
  ui_cancel: "sfx/ui_cancel.wav",
  collect: "sfx/collect.wav",
  door: "sfx/door.wav",
  jump: "sfx/jump.wav",
  land: "sfx/land.wav",
  hunt_pounce: "sfx/hunt_pounce.wav",
  hunt_rustle: "steps/grass/2.ogg", // soft forest-floor rustle (reuses a footstep)
  swim: "steps/water/0.ogg", // paddling strokes (reuses water footsteps)
  quest_done: "sfx/quest_done.wav",
  rank_up: "sfx/rank_up.wav",
  clan_join: "sfx/clan_join.wav",
  cat_mew: "sfx/cat_mew.ogg",
  cat_mew2: "sfx/cat_mew2.wav",
  cat_mew3: "sfx/cat_mew2.wav",
  cat_mew4: "sfx/cat_mew.ogg",
  cat_purr: "sfx/cat_purr.wav",
  // interaction feedback (water/food/plants/impact use fitted reuse slots)
  splash: "steps/water/1.ogg",
  eat: "steps/grass/2.ogg", // soft nibble/grass texture placeholder
  herb: "steps/grass/3.ogg", // leafy pick
  drink: "steps/water/0.ogg",
  hit: "sfx/hunt_pounce.wav", // impact
  shake: "steps/grass/1.ogg", // fur rustle
};

/** Artistic per-sound trim (multiplied with the sfx bus volume). */
const SFX_GAIN: Partial<Record<SfxName, number>> = {
  ui_click: 0.4, ui_open: 0.45, ui_move: 0.3, ui_confirm: 0.5, ui_cancel: 0.4,
  collect: 0.5, door: 0.5, jump: 0.35, land: 0.3, hunt_pounce: 0.7,
  hunt_rustle: 0.45, quest_done: 0.7, rank_up: 0.7, clan_join: 0.75,
  cat_mew: 0.55, cat_mew2: 0.5, cat_mew3: 0.5, cat_mew4: 0.55, cat_purr: 0.5,
  splash: 0.55, eat: 0.5, herb: 0.45, drink: 0.45, hit: 0.7, shake: 0.5,
};

/** Terrain → footstep folder. */
export type StepKind = "grass" | "tile" | "water";
const STEP_FILES: Record<StepKind, string[]> = {
  grass: ["steps/grass/0.ogg", "steps/grass/1.ogg", "steps/grass/2.ogg", "steps/grass/3.ogg"],
  tile: ["steps/tile/0.ogg", "steps/tile/1.ogg", "steps/tile/2.ogg"],
  water: ["steps/water/0.ogg", "steps/water/1.ogg"],
};

// ---------------------------------------------------------------------------
// Scene selectors (pure functions — easy to tune without touching the engine)
// ---------------------------------------------------------------------------

export type SceneInput = {
  areaId: string;
  interior: string | null;
  weather: string; // WeatherKind from the engine
  clock: number; // 0..23
  mode: string; // GameMode
};

/** Biome base layer for an area id. */
function biomeLayer(areaId: string): AmbienceLayerId | null {
  if (areaId.includes("river") || areaId === "riverclan-territory" || areaId === "riverclan-camp") return "river";
  if (areaId === "moor" || areaId.includes("windclan")) return "wind";
  if (areaId === "twolegplace" || areaId === "farm") return null; // wind+birds mix below
  if (areaId === "thunderpath") return null; // road noise handled by wind trim
  return "forestDay"; // forest, camps, pine, marsh, rocks
}

function musicForArea(areaId: string): MusicId {
  if (areaId === "twolegplace" || areaId === "farm") return "twoleg";
  if (areaId === "riverclan-territory" || areaId === "riverclan-camp" || areaId === "river" || areaId === "east-river") return "riverclan";
  if (areaId === "moor" || areaId === "windclan-camp") return "windclan";
  if (areaId.includes("shadowclan") || areaId === "marsh") return "shadowclan";
  return "thunderclan";
}

/** What the ambience mixer should be playing for this scene. */
export function computeAmbience(input: SceneInput): Partial<Record<AmbienceLayerId, number>> {
  if (input.interior) return {}; // indoors: music only (+door SFX)
  const night = input.clock >= 20 || input.clock < 5;
  const evening = input.clock >= 18 && input.clock < 20;
  const out: Partial<Record<AmbienceLayerId, number>> = {};

  const biome = biomeLayer(input.areaId);
  if (biome === "river") out.river = 0.85;
  else if (biome === "wind") out.wind = 0.8;
  else if (biome === "forestDay") out.forestDay = 0.65;

  const twoleg = input.areaId === "twolegplace" || input.areaId === "farm";
  const birdBase = twoleg ? 0.25 : biome === "forestDay" ? 0.5 : 0.3;
  if (birdBase > 0) {
    if (night) out.nightCrickets = twoleg ? 0.3 : 0.75;
    else if (evening) out.birdsDay = birdBase * 0.5;
    else out.birdsDay = birdBase;
  }

  // weather layers (on top of, or replacing, the biome bed)
  const wet = input.weather === "rain" || input.weather === "heavy-rain" || input.weather === "storm";
  if (input.weather === "rain") out.rainLight = 0.8;
  if (input.weather === "heavy-rain") out.rainHeavy = 0.85;
  if (input.weather === "storm") { out.storm = 0.9; out.wind = (out.wind ?? 0) + 0.35; }
  if (input.weather === "wind") out.wind = (out.wind ?? 0) + 0.7;
  if (input.weather === "fog") { for (const k of Object.keys(out) as AmbienceLayerId[]) out[k] = (out[k] ?? 0) * 0.55; }
  if (input.weather === "snow") { for (const k of Object.keys(out) as AmbienceLayerId[]) out[k] = (out[k] ?? 0) * 0.45; }
  if (wet && out.birdsDay !== undefined) out.birdsDay = out.birdsDay * 0.4;
  if (wet && out.forestDay !== undefined) out.forestDay = out.forestDay * 0.7;
  return out;
}

/** Which music track fits this scene (null = keep current). */
export function computeMusic(input: SceneInput): MusicId | null {
  if (input.interior) return null; // interiors keep the area's music
  return musicForArea(input.areaId);
}

/** Footstep surface at a world position (ground map kind index). */
export function stepKindFor(areaId: string, interior: boolean, groundIdx: number): StepKind {
  if (interior) return "tile";
  if (groundIdx === 2) return "water"; // water cells
  if (groundIdx === 3 || groundIdx === 4) return "tile"; // stone / paved
  if (areaId === "river" || areaId === "east-river" || areaId === "riverclan-territory") {
    return groundIdx === 9 || groundIdx === 10 ? "grass" : "water"; // banks reed-soft
  }
  return "grass"; // grass, sand, dirt, moor, pine floor, marsh, riverbank
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface MusicChannel { el: HTMLAudioElement; id: MusicId }
interface AmbChannel { el: HTMLAudioElement; layer: AmbienceLayerId; desired: number }

export class AudioEngine {
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer | "loading" | "failed">();
  private music: MusicChannel | null = null;
  private musicWanted: MusicId | null = null;
  private wanted: Partial<Record<AmbienceLayerId, number>> = {};
  private chans = new Map<AmbienceLayerId, AmbChannel>();
  private fades = new Map<HTMLAudioElement, number>();
  private lastSfx = new Map<string, number>();
  private started = false;

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.settings = { ...DEFAULT_AUDIO_SETTINGS, ...(JSON.parse(raw) as Partial<AudioSettings>) };
    } catch { /* storage unavailable */ }
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setSettings(s: AudioSettings) {
    this.settings = { ...s };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch { /* storage unavailable */ }
    this.applyGains();
  }

  /** Call from a user gesture (autoplay policy). Idempotent. */
  start() {
    if (this.started) return;
    this.started = true;
    this.ensureCtx();
    this.applyGains();
    if (this.musicWanted) this.setMusic(this.musicWanted);
  }

  /** Music for a scene — crossfades, never restarts the current track. */
  setMusic(id: MusicId | null) {
    this.musicWanted = id;
    if (!this.started) return;
    if (id === null || (this.music && this.music.id === id)) return;
    const fadeIn = (el: HTMLAudioElement) => {
      el.volume = 0;
      this.playEl(el);
      this.fade(el, this.musicVol() * MUSIC_GAIN[id], FADE_MS);
    };
    const el = this.makeEl(BASE + MUSIC_FILES[id], true);
    const old = this.music;
    this.music = { el, id };
    if (old) {
      this.fade(old.el, 0, FADE_MS, () => {
        old.el.pause();
        old.el.src = ""; // release memory
      });
    }
    fadeIn(el);
  }

  stopMusic(fadeMs = 800) {
    this.musicWanted = null;
    const m = this.music;
    this.music = null;
    if (m) this.fade(m.el, 0, fadeMs, () => { m.el.pause(); m.el.src = ""; });
  }

  /** Layered ambience: fades in new layers, fades out removed ones. */
  setAmbience(wanted: Partial<Record<AmbienceLayerId, number>>) {
    if (!this.started) {
      this.wanted = wanted;
      return;
    }
    // clamp targets (defensive: >1 targets used to push element volume >1)
    const clamped: Partial<Record<AmbienceLayerId, number>> = {};
    for (const k of Object.keys(wanted) as AmbienceLayerId[]) {
      const v = wanted[k];
      if (typeof v === "number" && v > 0) clamped[k] = Math.min(1, Math.max(0, v));
    }
    this.wanted = clamped;
    const ids = new Set([...Object.keys(clamped), ...this.chans.keys()]) as Set<AmbienceLayerId>;
    for (const id of ids) {
      const target = (clamped[id] ?? 0);
      const existing = this.chans.get(id);
      if (target <= 0.001) {
        if (existing) {
          this.chans.delete(id);
          this.fade(existing.el, 0, FADE_MS, () => { existing.el.pause(); });
        }
        continue;
      }
      if (existing) {
        existing.desired = target;
        this.fade(existing.el, this.layerVol(id) * LAYERS[id].gain * target, FADE_MS);
      } else {
        const spec = LAYERS[id];
        const el = this.makeEl(BASE + spec.src, spec.loop);
        const ch: AmbChannel = { el, layer: id, desired: target };
        this.chans.set(id, ch);
        el.volume = 0;
        this.playEl(el);
        this.fade(el, this.layerVol(id) * spec.gain * target, FADE_MS);
      }
    }
  }

  stopAll(fadeMs = 500) {
    this.stopMusic(fadeMs);
    for (const [, ch] of this.chans) {
      this.fade(ch.el, 0, fadeMs, () => { ch.el.pause(); });
    }
    this.chans.clear();
    this.wanted = {};
  }

  /** One-shot pooled SFX. Throttled to avoid machine-gun stacking. */
  playSfx(name: SfxName, opts: { volume?: number; rate?: number; throttleMs?: number } = {}) {
    if (!this.started || this.settings.muteSfx || this.settings.sfx <= 0.001 || this.settings.master <= 0.001) return;
    // a suspended context would silently eat every one-shot; nudge it awake
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
    const now = performance.now();
    const throttle = opts.throttleMs ?? 90;
    if (throttle > 0 && now - (this.lastSfx.get(name) ?? 0) < throttle) return;
    this.lastSfx.set(name, now);
    const vol = (opts.volume ?? 1) * (SFX_GAIN[name] ?? 0.5) * this.settings.sfx * this.settings.master;
    if (vol <= 0.001) return;
    const buf = this.getBuffer(name);
    if (buf === "failed") return;
    if (this.ctx && this.sfxGain) {
      if (buf === "loading" || buf === null) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = opts.rate ?? 1;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g).connect(this.sfxGain);
      src.start();
    } else {
      // No WebAudio (older Safari): one-shot element fallback
      const el = this.makeEl(BASE + SFX_FILES[name], false);
      el.volume = Math.min(1, vol);
      this.playEl(el);
      window.setTimeout(() => { el.pause(); el.src = ""; }, 4000);
    }
  }

  /**
   * Synthesized vocalizations for sounds we have no asset for (hiss, growl,
   * chirp, trill). Short, quiet, throttled — real WebAudio, no placeholders.
   */
  playVocal(kind: "hiss" | "growl" | "chirp" | "trill") {
    if (!this.started || this.settings.muteSfx || this.settings.sfx <= 0.001 || this.settings.master <= 0.001) return;
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
    if (!this.ctx || !this.sfxGain) return;
    const now = performance.now();
    if (now - (this.lastSfx.get("vocal-" + kind) ?? 0) < 250) return;
    this.lastSfx.set("vocal-" + kind, now);
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const vol = this.settings.sfx * this.settings.master * 0.5;
    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(this.sfxGain);
    if (kind === "hiss") {
      // band-passed noise burst with a fast attack and slow tail
      const len = 0.5;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 5200;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
      src.connect(bp).connect(g).connect(out);
      src.start(t0);
      src.stop(t0 + len);
    } else if (kind === "growl") {
      // low sawtooth with a slow amplitude wobble
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(82, t0);
      osc.frequency.linearRampToValueAtTime(64, t0 + 0.55);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 320;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 11;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.12;
      lfo.connect(lfoGain).connect(g.gain);
      osc.connect(lp).connect(g).connect(out);
      osc.start(t0); lfo.start(t0);
      osc.stop(t0 + 0.65); lfo.stop(t0 + 0.65);
    } else if (kind === "chirp") {
      // two quick rising chirps (bird-like chattering)
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        const st = t0 + i * 0.11;
        osc.frequency.setValueAtTime(1500, st);
        osc.frequency.exponentialRampToValueAtTime(2400, st + 0.08);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.35, st + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
        osc.connect(g).connect(out);
        osc.start(st);
        osc.stop(st + 0.1);
      }
    } else {
      // trill: a soft sine warbled at ~20 Hz
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 880;
      const am = ctx.createOscillator();
      am.frequency.value = 19;
      const amGain = ctx.createGain();
      amGain.gain.value = 220;
      am.connect(amGain).connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      osc.connect(g).connect(out);
      osc.start(t0); am.start(t0);
      osc.stop(t0 + 0.45); am.stop(t0 + 0.45);
    }
  }

  /** Randomized cat vocalization: mews vary in file + pitch per call. */
  playMew(kind: "talk" | "ambient" = "talk") {
    const pool: SfxName[] = kind === "ambient"
      ? ["cat_mew", "cat_mew2", "cat_mew3", "cat_mew4", "cat_purr"]
      : ["cat_mew", "cat_mew2", "cat_mew3", "cat_mew4"];
    const name = pool[Math.floor(Math.random() * pool.length)];
    this.playSfx(name, {
      volume: 0.55 + Math.random() * 0.2,
      rate: 0.85 + Math.random() * 0.4,
      throttleMs: 220,
    });
  }

  /** Random footstep with pitch variation (mult scales walk/run/crouch). */
  playStep(kind: StepKind, mult = 1) {
    const files = STEP_FILES[kind];
    const name = files[Math.floor(Math.random() * files.length)];
    if (!this.started || this.settings.muteSfx) return;
    const vol = 0.35 * mult * this.settings.sfx * this.settings.master;
    if (vol <= 0.001) return;
    if (this.ctx && this.sfxGain) {
      this.loadBufferUrl(BASE + name, (buf) => {
        if (!this.ctx || !this.sfxGain || !buf) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 0.9 + Math.random() * 0.25;
        const g = this.ctx.createGain();
        g.gain.value = vol;
        src.connect(g).connect(this.sfxGain);
        src.start();
      });
    } else {
      const el = this.makeEl(BASE + name, false);
      el.volume = Math.min(1, vol);
      this.playEl(el);
      window.setTimeout(() => { el.pause(); el.src = ""; }, 3000);
    }
  }

  // --- internals ------------------------------------------------------------

  private ensureCtx() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.ctx.destination);
    } catch {
      this.ctx = null; // element fallbacks still work
    }
  }

  resume() {
    this.ensureCtx();
  }

  private makeEl(src: string, loop: boolean): HTMLAudioElement {
    const el = new Audio(src);
    el.loop = loop;
    el.preload = "auto";
    (el as HTMLAudioElement & { crossOrigin?: string }).crossOrigin = "anonymous";
    return el;
  }

  private playEl(el: HTMLAudioElement) {
    void el.play().catch(() => undefined); // autoplay rejections are expected pre-gesture
  }

  private musicVol(): number {
    return this.settings.muteMusic ? 0 : this.settings.music * this.settings.master;
  }

  private layerVol(_id: AmbienceLayerId): number {
    return this.settings.muteAmbience ? 0 : this.settings.ambience * this.settings.master;
  }

  /** Re-apply current volumes to every live channel (settings change). */
  private applyGains() {
    if (this.sfxGain && this.ctx) {
      const v = this.settings.muteSfx ? 0 : this.settings.sfx * this.settings.master;
      this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
    if (this.music) this.fade(this.music.el, this.musicVol() * MUSIC_GAIN[this.music.id], 250);
    for (const [, ch] of this.chans) {
      this.fade(ch.el, this.layerVol(ch.layer) * LAYERS[ch.layer].gain * ch.desired, 250);
    }
  }

  /** Simple linear fade on an element; cancels any fade already running on it. */
  private fade(el: HTMLAudioElement, to: number, ms: number, onDone?: () => void) {
    const prior = this.fades.get(el);
    if (prior) window.clearInterval(prior);
    const from = el.volume;
    if (Math.abs(to - from) < 0.01) {
      el.volume = Math.max(0, Math.min(1, to));
      if (onDone) onDone();
      return;
    }
    const t0 = performance.now();
    const timer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t >= 1) {
        window.clearInterval(timer);
        this.fades.delete(el);
        if (onDone) onDone();
      }
    }, FADE_STEP_MS);
    this.fades.set(el, timer);
  }

  private getBuffer(name: SfxName): AudioBuffer | "loading" | "failed" | null {
    const url = BASE + SFX_FILES[name];
    const cached = this.buffers.get(url);
    if (cached) return cached;
    // kick off the fetch even without a ctx: the AudioContext can appear
    // later (first user gesture) and the buffer will already be warm
    this.loadBufferUrl(url);
    return "loading";
  }

  private loadBufferUrl(url: string, onReady?: (b: AudioBuffer | null) => void) {
    const cached = this.buffers.get(url);
    if (cached && cached !== "loading" && cached !== "failed") {
      onReady?.(cached);
      return;
    }
    if (cached === "failed") { onReady?.(null); return; }
    if (this.ctx === null) { this.buffers.set(url, "failed"); onReady?.(null); return; }
    this.buffers.set(url, "loading");
    void fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => this.ctx!.decodeAudioData(ab))
      .then((buf) => {
        this.buffers.set(url, buf);
        onReady?.(buf);
      })
      .catch(() => {
        this.buffers.set(url, "failed");
        onReady?.(null);
      });
  }
}

// WarriorCatsRPG — main menu: a cinematic ThunderClan-camp title screen with
// the player's ONE persistent cat, three game modes, and character/settings
// screens. This replaces the old ModeSelect/CatCreator entry flow without
// changing anything about the game world, engine, or saves.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Backpack,
  BookOpen,
  Eye,
  Gamepad2,
  Globe2,
  Heart,
  Leaf,
  Palette,
  RotateCcw,
  RotateCw,
  ScrollText,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Trophy,
  User,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClanSelect } from "./ClanSelect";
import { RefreshCw } from "lucide-react";
import { drawCat, type CatSkin } from "@/game/draw";
import { MenuScene } from "@/game/menuScene";
import { cn } from "@/lib/utils";

export type GameMode = "story" | "open" | "free";

const TIPS = [
  "Explore the forest to discover hidden locations.",
  "Different Clans have different territories.",
  "Keep an eye out for prey while exploring.",
  "Sneak with C to get close to prey before you pounce.",
  "Hold Shift to run and cover ground faster.",
  "Press E near dens and cats to interact with them.",
  "The Gathering at Fourtrees happens under the full moon.",
  "Herb patches can be foraged for the medicine cat.",
  "Chat with other cats using the Chat button in the open world.",
  "Your cat, progress, and discoveries are saved automatically.",
];

// --- tiny local persistence for settings -----------------------------------

const RES = [
  { id: "low", label: "Performance" },
  { id: "medium", label: "Balanced" },
  { id: "high", label: "Beautiful" },
] as const;

export type Settings = {
  graphics: (typeof RES)[number]["id"];
  cameraSensitivity: number;
  cameraDistance: number;
  volume: number;
  music: number;
  sfx: number;
  showControls: boolean;
  chatTimestamps: boolean;
  reduceMotion: boolean;
  largeText: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  graphics: "high",
  cameraSensitivity: 1,
  cameraDistance: 1,
  volume: 0.8,
  music: 0.6,
  sfx: 0.8,
  showControls: true,
  chatTimestamps: false,
  reduceMotion: false,
  largeText: false,
};

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem("wcrpg-settings") ?? "{}") as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadFloat(key: string, fallback: number): number {
  const v = Number(localStorage.getItem(`wcrpg-${key}`));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// --- rank helpers (mirror the server's XP thresholds) ----------------------

function rankOf(xp: number, fallback?: string): string {
  if (fallback && fallback !== "kittypet" && fallback !== "apprentice" && xp < 100) return fallback;
  if (xp >= 300) return "warrior";
  if (xp >= 100) return "apprentice";
  return fallback ?? "kittypet";
}

function nextRankXp(xp: number): number | null {
  if (xp < 100) return 100;
  if (xp < 300) return 300;
  return null;
}

// --- animated cat portrait (character screen + hero card) ------------------

export function CatPortrait({
  skin,
  size = 220,
  showRotate = false,
}: {
  skin: CatSkin;
  size?: number;
  showRotate?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const facingRef = useRef<1 | -1>(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const render = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(size / 110, size / 110);
      drawCat(ctx, skin, 55, 100, facingRef.current, "walk", t / 1000, 0);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [skin, size]);

  return (
    <div className="relative" style={{ width: size, height: size * 0.85 }}>
      <canvas ref={canvasRef} width={size} height={size * 0.85} className="h-full w-full" />
      {showRotate && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-0 top-1/2 size-8 -translate-y-1/2 rounded-full bg-card/70"
            onClick={() => (facingRef.current = -1)}
            title="Look left"
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-1/2 size-8 -translate-y-1/2 rounded-full bg-card/70"
            onClick={() => (facingRef.current = 1)}
            title="Look right"
          >
            <RotateCw className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

// --- shared menu button -----------------------------------------------------

function MenuButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof User;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex min-w-[130px] items-center justify-center gap-2 rounded-xl border border-white/25 bg-black/45 px-4 py-2.5",
        "text-sm font-semibold tracking-wide text-white/90 shadow-lg shadow-black/30 backdrop-blur-md",
        "transition-all hover:-translate-y-0.5 hover:border-white/50 hover:bg-black/60 hover:text-white",
        "active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      <Icon className="size-4 text-amber-300 transition-transform group-hover:scale-110" />
      {label}
    </button>
  );
}

// --- mode cards --------------------------------------------------------------

const MODES: { id: GameMode; title: string; tagline: string; desc: string; bullets: string[]; icon: typeof BookOpen; ring: string }[] = [
  {
    id: "story",
    title: "STORY MODE",
    tagline: "Into the Wild",
    desc: "Experience the events of Into the Wild through a playable story.",
    bullets: ["Story missions", "Canon characters", "Dialogue & training", "Every major book event"],
    icon: BookOpen,
    ring: "hover:border-amber-300/70 hover:shadow-amber-400/20",
  },
  {
    id: "open",
    title: "ONLINE OPEN WORLD",
    tagline: "Multiplayer",
    desc: "Explore the forest with other players and live as a Clan cat.",
    bullets: ["Meet real players", "Hunt, patrol & train", "Chat & roleplay", "Attend Gatherings"],
    icon: Globe2,
    ring: "hover:border-sky-300/70 hover:shadow-sky-400/20",
  },
  {
    id: "free",
    title: "FREE PLAY",
    tagline: "Solo roleplay",
    desc: "Explore, roleplay, hunt, train, and enjoy the world without following the story.",
    bullets: ["Full map access", "Wildlife & weather", "Day/night cycle", "Hidden areas"],
    icon: Leaf,
    ring: "hover:border-emerald-300/70 hover:shadow-emerald-400/20",
  },
];

function ModeCard({ mode, index, onPlay }: { mode: (typeof MODES)[number]; index: number; onPlay: (m: GameMode, clanId: string) => void }) {
  const Icon = mode.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + index * 0.09 }}
    >
      <button
        onClick={() => onPlay(mode.id, "")}
        className={cn(
          "group flex h-full w-full flex-col rounded-2xl border border-white/20 bg-black/45 p-4 text-left shadow-xl shadow-black/30 backdrop-blur-md",
          "transition-all hover:-translate-y-1 hover:bg-black/60 hover:shadow-2xl active:translate-y-0",
          mode.ring,
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/10 transition-colors group-hover:bg-white/20">
            <Icon className="size-4 text-amber-300" />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/50">{mode.tagline}</p>
            <h3 className="text-[15px] font-extrabold tracking-wide text-white">{mode.title}</h3>
          </div>
        </div>
        <p className="mt-2.5 text-xs leading-snug text-white/70">{mode.desc}</p>
        <ul className="mt-2.5 flex-1 space-y-1">
          {mode.bullets.map((b) => (
            <li key={b} className="flex items-center gap-1.5 text-[11px] text-white/60">
              <Sparkles className="size-2.5 text-amber-300/80" /> {b}
            </li>
          ))}
        </ul>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-amber-300">
          Enter the forest
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
        </span>
      </button>
    </motion.div>
  );
}

// --- character screen ---------------------------------------------------------

export const FUR_COLORS = [
  "#d96b2f", "#e8963f", "#c9c2b8", "#8f8f96", "#5c5c60", "#2c2c30",
  "#7a5b3a", "#a5622d", "#e3c088", "#c98d5a", "#9fb2c8", "#b8c4d6",
  "#6b4a2f", "#d9a441", "#e8e6e0", "#8a7a66",
];
export const EYE_COLORS = ["#4fae6e", "#5b8fd6", "#d9c04a", "#c98a1e", "#7fae4e", "#2c2c30", "#d9973a"];
export const CHEST_COLORS = ["#f4e9d8", "#ffffff", "#e3c088"];

/** Roll a fully random appearance. */
export function randomSkin(): CatSkin {
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  return {
    fur: pick(FUR_COLORS),
    furDark: "",
    eye: pick(EYE_COLORS),
    chest: Math.random() < 0.3 ? pick(CHEST_COLORS) : undefined,
    pattern: pick(["solid", "tabby", "tortie", "bicolor"] as const),
    furLength: 1,
    tail: pick(["normal", "short", "fluffy", "bob"] as const),
    ears: pick(["normal", "tall", "fold"] as const),
    size: Math.round((0.85 + Math.random() * 0.3) * 100) / 100,
    scar: Math.random() < 0.18,
  };
}

/** Roll a random Warriors-style name (Firepaw, Graystripe, Sandwhisker…). */
export function randomCatName(): string {
  const A = ["Fire", "Gray", "Sand", "Dust", "Raven", "Silver", "Bramble", "Bracken", "Yellow", "Speckle", "Running", "Willow", "Bright", "Snow", "Oak", "Maple", "Fern", "Squirrel", "Cinder", "Golden", "Ash", "Holly", "Ivy", "Moss", "Petal", "Thorn", "Briar", "Sorrel"];
  const B = ["paw", "heart", "tail", "fur", "stripe", "pelt", "claw", "whisker", "storm", "leaf", "stream", "pool", "fang", "spots", "wing", "flight", "breeze", "shade", "berry", "nose"];
  const a = A[Math.floor(Math.random() * A.length)];
  const b = Math.random() < 0.25 ? "paw" : B[Math.floor(Math.random() * B.length)];
  return `${a}${b}`;
}
const CLANS = [
  { id: "thunderclan", name: "ThunderClan", desc: "Brave and loyal. Warriors of the deep forest.", color: "#4a8a4c" },
  { id: "riverclan", name: "RiverClan", desc: "Sleek and strong swimmers. Fishers of the river.", color: "#3d6f9e" },
  { id: "windclan", name: "WindClan", desc: "Swift runners of the open moor.", color: "#88b15c" },
  { id: "shadowclan", name: "ShadowClan", desc: "Proud night hunters. The pines are theirs.", color: "#356840" },
];

function darken(hex: string, f = 0.72): string {
  const n = hex.replace("#", "");
  const r = Math.round(parseInt(n.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(n.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(n.slice(4, 6), 16) * f);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted/70 text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

export function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-label={c}
          className={cn(
            "size-6 rounded-full border-2 transition-transform hover:scale-110",
            value === c ? "border-foreground ring-2 ring-ring" : "border-border/40",
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-primary" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function CharacterScreen({
  player,
  onClose,
  onSave,
}: {
  player: MainMenuPlayer;
  onClose: () => void;
  onSave: (v: { name?: string; skin?: CatSkin; clan?: string }) => void;
}) {
  const [skin, setSkin] = useState<CatSkin>(player.skin);
  const [name, setName] = useState(player.name);
  const [clan, setClan] = useState(player.clan ?? "thunderclan");
  const [clanToast, setClanToast] = useState<string | null>(null);

  const dirty = name.trim() !== player.name || JSON.stringify(skin) !== JSON.stringify(player.skin) || clan !== (player.clan ?? "thunderclan");
  const skills = player.skills;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 overflow-y-auto bg-[#0d160d]/85 backdrop-blur-md"
    >
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 text-white/80 hover:text-white">
            <ArrowLeft className="size-4" /> Back to menu
          </Button>
          <h1 className="text-lg font-extrabold uppercase tracking-[0.2em] text-white">Character</h1>
          <div className="w-28" />
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-[280px_1fr]">
          {/* Preview + identity */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex w-full flex-col items-center rounded-2xl border border-white/15 bg-black/40 p-4">
              <CatPortrait skin={skin} size={200} showRotate />
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full gap-1.5 rounded-full border-white/20 bg-black/40 text-xs text-white hover:bg-white/10"
                onClick={() => {
                  setSkin(randomSkin());
                  setName(randomCatName());
                }}
              >
                <RefreshCw className="size-3.5" /> Randomize cat
              </Button>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 20))}
                className="mt-3 border-white/20 bg-black/40 text-center text-sm font-semibold text-white"
                aria-label="Cat name"
              />
              <button
                className="mt-1.5 text-[11px] text-amber-300/90 hover:text-amber-200"
                onClick={() => setName(randomCatName())}
              >
                Random name
              </button>
              <p className="mt-1.5 text-[11px] text-white/50">
                {CLANS.find((c) => c.id === clan)?.name} · {rankOf(player.xp, player.rank)}
              </p>
            </div>
            <div className="w-full rounded-2xl border border-white/15 bg-black/40 p-3 text-xs text-white/75">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-amber-300" /> XP</span>
                <span className="font-semibold text-white">{player.xp}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${Math.min(100, (player.xp / (nextRankXp(player.xp) ?? (player.xp || 1))) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-white/45">
                {nextRankXp(player.xp) ? `${nextRankXp(player.xp)! - player.xp} XP to next rank` : "Highest rank reached"}
              </p>
            </div>
          </div>

          {/* Sections */}
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoRow icon={Shield} label="Progression">
              <div className="space-y-2">
                {[
                  ["Hunting", skills.hunt, 5],
                  ["Fighting", skills.fight, 5],
                  ["Tracking", Math.max(1, Math.floor((skills.hunt + skills.fight) / 2)), 5],
                  ["Herb knowledge", skills.herb, 5],
                ].map(([label, val, max]) => (
                  <div key={label as string}>
                    <div className="flex justify-between text-[11px] text-white/70">
                      <span>{label}</span>
                      <span className="font-semibold text-white">{val}/{max}</span>
                    </div>
                    <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${((val as number) / (max as number)) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </InfoRow>

            <InfoRow icon={Backpack} label="Inventory">
              {player.inventory.length === 0 ? (
                <p className="text-xs text-white/45">Satchel is empty — hunt prey and forage herbs to fill it.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {player.inventory.map((it) => (
                    <span key={it} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] capitalize text-white/80">
                      {it.replace(/-/g, " ")}
                    </span>
                  ))}
                </div>
              )}
            </InfoRow>

            <InfoRow icon={Trophy} label="Achievements">
              {player.achievements.length === 0 ? (
                <p className="text-xs text-white/45">No achievements earned yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {player.achievements.map((a) => (
                    <span key={a} className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] capitalize text-amber-200">
                      <Award className="size-3" /> {a.replace(/-/g, " ")}
                    </span>
                  ))}
                </div>
              )}
            </InfoRow>

            <InfoRow icon={ScrollText} label="Story progress">
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (player.storyStep / 16) * 100)}%` }} />
                </div>
                <span className="text-[11px] font-semibold text-white">{player.storyStep}/16</span>
              </div>
              <p className="mt-1.5 text-[11px] text-white/50">
                {player.storyStep === 0
                  ? "Into the Wild awaits — begin in Story Mode."
                  : player.storyStep >= 16
                    ? "The story is complete. The forest is yours."
                    : "Continue your journey in Story Mode."}
              </p>
            </InfoRow>

            <InfoRow icon={Palette} label="Appearance" >
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/50">Fur</p>
                  <div className="mt-1"><Swatches colors={FUR_COLORS} value={skin.fur} onChange={(fur) => setSkin((s) => ({ ...s, fur, chest: undefined }))} /></div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/50">Eyes</p>
                  <div className="mt-1"><Swatches colors={EYE_COLORS} value={skin.eye} onChange={(eye) => setSkin((s) => ({ ...s, eye }))} /></div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["solid", "tabby", "tortie", "bicolor"] as const).map((p) => (
                    <Chip key={p} label={p} active={skin.pattern === p} onClick={() => setSkin((s) => ({ ...s, pattern: p }))} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["normal", "fluffy", "short", "bob"] as const).map((t) => (
                    <Chip key={t} label={`${t} tail`} active={skin.tail === t} onClick={() => setSkin((s) => ({ ...s, tail: t }))} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(["normal", "tall", "fold"] as const).map((e) => (
                    <Chip key={e} label={`${e} ears`} active={skin.ears === e} onClick={() => setSkin((s) => ({ ...s, ears: e }))} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CHEST_COLORS.map((c) => (
                    <Chip
                      key={c}
                      label={skin.chest === c ? "chest ✓" : "chest"}
                      active={skin.chest === c}
                      onClick={() => setSkin((s) => ({ ...s, chest: s.chest === c ? undefined : c }))}
                    />
                  ))}
                </div>
                <div>
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-white/50">
                    <span>Size</span>
                    <span>{Math.round((skin.size ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.85}
                    max={1.15}
                    step={0.01}
                    value={skin.size ?? 1}
                    onChange={(e) => setSkin((s) => ({ ...s, size: Number(e.target.value) }))}
                    className="mt-1 w-full accent-[var(--primary)]"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <span>Battle scar</span>
                  <button
                    onClick={() => setSkin((s) => ({ ...s, scar: !s.scar }))}
                    className={cn(
                      "relative h-5 w-9 rounded-full transition-colors",
                      skin.scar ? "bg-primary" : "bg-white/15",
                    )}
                    aria-label="Toggle battle scar"
                  >
                    <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", skin.scar ? "left-[1.15rem]" : "left-0.5")} />
                  </button>
                </div>
              </div>
            </InfoRow>

            <InfoRow icon={Heart} label="Clan">
              <div className="space-y-1.5">
                {CLANS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (clan === c.id) return;
                      setClan(c.id);
                      setClanToast(`Your cat will wake up in ${c.name} camp.`);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                      clan === c.id ? "border-primary bg-primary/15" : "border-white/10 hover:bg-white/5",
                    )}
                  >
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-xs font-semibold text-white/85">{c.name}</span>
                  </button>
                ))}
                {clanToast && <p className="text-[10px] text-amber-300/90">{clanToast}</p>}
              </div>
            </InfoRow>
          </div>
        </div>

        <div className="sticky bottom-4 mt-6 flex justify-end">
          <Button
            size="lg"
            disabled={!dirty || !name.trim()}
            className="gap-2 rounded-full px-8 shadow-xl"
            onClick={() => onSave({ name: name.trim() || player.name, skin, clan })}
          >
            Save changes <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// --- settings screen -----------------------------------------------------------

function SettingsScreen({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const section = "rounded-2xl border border-white/15 bg-black/40 p-4";
  const head = "flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/60";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 overflow-y-auto bg-[#0d160d]/85 backdrop-blur-md"
    >
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="gap-1.5 text-white/80 hover:text-white">
            <ArrowLeft className="size-4" /> Back to menu
          </Button>
          <h1 className="text-lg font-extrabold uppercase tracking-[0.2em] text-white">Settings</h1>
          <div className="w-28" />
        </div>

        <div className="mt-6 space-y-4 pb-8">
          <div className={section}>
            <p className={head}><Eye className="size-3.5 text-amber-300" /> Graphics</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {RES.map((r) => (
                <Chip key={r.id} label={r.label} active={settings.graphics === r.id} onClick={() => set("graphics", r.id)} />
              ))}
            </div>
            <div className="mt-4 space-y-3">
              <SliderRow label="Camera sensitivity" value={settings.cameraSensitivity} min={0.5} max={2} step={0.05} fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => set("cameraSensitivity", v)} />
              <SliderRow label="Camera distance" value={settings.cameraDistance} min={0.7} max={1.6} step={0.05} fmt={(v) => `${v.toFixed(2)}×`} onChange={(v) => set("cameraDistance", v)} />
            </div>
          </div>

          <div className={section}>
            <p className={head}><Volume2 className="size-3.5 text-amber-300" /> Audio</p>
            <div className="mt-2.5 space-y-3">
              <SliderRow label="Master volume" value={settings.volume} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("volume", v)} />
              <SliderRow label="Music" value={settings.music} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("music", v)} />
              <SliderRow label="Sound effects" value={settings.sfx} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("sfx", v)} />
            </div>
          </div>

          <div className={section}>
            <p className={head}><Gamepad2 className="size-3.5 text-amber-300" /> Controls & chat</p>
            <div className="mt-2.5 space-y-2 text-xs text-white/70">
              <div className="flex flex-wrap gap-1.5">
                {[["W A S D", "Move"], ["Shift", "Run"], ["C", "Sneak"], ["E / Enter", "Interact"], ["Space", "Jump over gaps"]].map(([k, a]) => (
                  <span key={k} className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
                    <kbd className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">{k}</kbd> {a}
                  </span>
                ))}
              </div>
              <ToggleRow label="Show control hints in game" value={settings.showControls} onChange={(v) => set("showControls", v)} />
              <ToggleRow label="Chat timestamps" value={settings.chatTimestamps} onChange={(v) => set("chatTimestamps", v)} />
            </div>
          </div>

          <div className={section}>
            <p className={head}><User className="size-3.5 text-amber-300" /> Accessibility</p>
            <div className="mt-2.5">
              <ToggleRow label="Reduce motion" value={settings.reduceMotion} onChange={(v) => set("reduceMotion", v)} />
              <ToggleRow label="Larger text" value={settings.largeText} onChange={(v) => set("largeText", v)} />
            </div>
          </div>

          <p className="text-center text-[10px] text-white/40">Settings save automatically on this device.</p>
        </div>
      </div>
    </motion.div>
  );
}

function SliderRow({
  label, value, min, max, step, fmt, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-white/70">
        <span>{label}</span>
        <span className="font-semibold text-white">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--primary)]"
      />
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left hover:bg-white/5">
      <span className="text-xs text-white/75">{label}</span>
      <span className={cn("relative h-5 w-9 rounded-full transition-colors", value ? "bg-primary" : "bg-white/15")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", value ? "left-[1.15rem]" : "left-0.5")} />
      </span>
    </button>
  );
}

// --- loading screen --------------------------------------------------------------

export function LoadingScreen({ mode }: { mode: GameMode }) {
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);
  const sub = mode === "story" ? "Entering the story…" : mode === "open" ? "Entering the online forest…" : "Entering the forest…";
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-[#101c10]"
    >
      <motion.div
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
        className="select-none text-center"
      >
        <p className="text-3xl font-black tracking-[0.28em] text-amber-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">WARRIORS</p>
        <p className="mt-1 text-sm font-bold tracking-[0.5em] text-white/85">RPG</p>
      </motion.div>
      <p className="mt-8 text-xs uppercase tracking-[0.3em] text-white/50">{sub}</p>
      <div className="mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-amber-400"
          initial={{ width: "8%" }}
          animate={{ width: ["8%", "70%", "96%"] }}
          transition={{ duration: 1.8, ease: "easeInOut" }}
        />
      </div>
      <p className="mt-6 flex items-center gap-1.5 text-xs text-white/60">
        <Sparkles className="size-3.5 text-amber-300/80" /> {tip}
      </p>
    </motion.div>
  );
}

// --- main menu -----------------------------------------------------------------

export interface MainMenuPlayer {
  name: string;
  clan?: string;
  rank: string;
  xp: number;
  skin: CatSkin;
  inventory: string[];
  achievements: string[];
  storyStep: number;
  skills: { hunt: number; fight: number; herb: number };
}

export default function MainMenu({
  player,
  onPlay,
  onSaveName,
  onSaveSkin,
  onSaveClan,
  onSaveSettings,
}: {
  player: MainMenuPlayer | null;
  /** mode + chosen Clan — Clan is picked every session, never locked */
  onPlay: (mode: GameMode, clanId: string) => void;
  onSaveName: (name: string) => void;
  onSaveSkin: (skin: CatSkin) => void;
  onSaveClan: (clan: string) => void;
  onSaveSettings: (s: Settings) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<MenuScene | null>(null);
  const [screen, setScreen] = useState<"menu" | "character" | "settings">("menu");
  const [clanFor, setClanFor] = useState<GameMode | null>(null);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  const previewSkin: CatSkin = useMemo(
    () =>
      player?.skin ?? {
        fur: "#d96b2f",
        furDark: "#b04f1d",
        eye: "#4fae6e",
        pattern: "solid",
        tail: "normal",
        ears: "normal",
        size: 1,
        scar: false,
      },
    [player?.skin],
  );

  // Boot the cinematic camp scene.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new MenuScene(canvas, previewSkin);
    sceneRef.current = scene;
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-sync skin edits from the character screen into the scene.
  useEffect(() => {
    sceneRef.current?.setPlayerSkin(previewSkin);
  }, [previewSkin]);

  const updateSettings = (s: Settings) => {
    setSettings(s);
    try {
      localStorage.setItem("wcrpg-settings", JSON.stringify(s));
    } catch {
      /* storage unavailable — session-only */
    }
    onSaveSettings(s);
  };

  const xp = player?.xp ?? 0;
  const rank = player ? rankOf(xp, player.rank) : "loner";
  const clanName = CLANS.find((c) => c.id === (player?.clan ?? "thunderclan"))?.name ?? "Loner";
  const toNext = nextRankXp(xp);

  return (
    <div className={cn("relative h-screen w-full overflow-hidden bg-[#0d160d]", settings.largeText && "text-lg")}>
      {/* cinematic camp background */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* readability scrim */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55" />

      <AnimatePresence mode="wait">
        {clanFor && (
          <ClanSelect
            key="clan"
            skin={previewSkin}
            currentClan={player?.clan}
            onCancel={() => setClanFor(null)}
            onConfirm={(clanId) => {
              setClanFor(null);
              onPlay(clanFor, clanId);
            }}
          />
        )}
        {screen === "character" && (
          <CharacterScreen
            key="character"
            player={
              player ?? {
                name: "Rusty",
                clan: "thunderclan",
                rank: "kittypet",
                xp: 0,
                skin: previewSkin,
                inventory: [],
                achievements: [],
                storyStep: 0,
                skills: { hunt: 1, fight: 1, herb: 0 },
              }
            }
            onClose={() => setScreen("menu")}
            onSave={(v) => {
              if (v.name && (!player || v.name !== player.name)) onSaveName(v.name);
              if (v.skin) onSaveSkin(v.skin);
              if (v.clan && (!player || v.clan !== (player.clan ?? "thunderclan"))) onSaveClan(v.clan);
              setScreen("menu");
            }}
          />
        )}
        {screen === "settings" && (
          <SettingsScreen key="settings" settings={settings} onChange={updateSettings} onClose={() => setScreen("menu")} />
        )}
      </AnimatePresence>

      {screen === "menu" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative z-10 flex h-full flex-col items-center px-4 py-6"
        >
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="select-none text-center"
          >
            <h1 className="text-5xl font-black tracking-[0.22em] text-amber-300 drop-shadow-[0_3px_10px_rgba(0,0,0,0.85)] md:text-6xl">
              WARRIORS
            </h1>
            <p className="mt-0.5 text-xl font-bold tracking-[0.6em] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] md:text-2xl">
              RPG
            </p>
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="h-px w-14 bg-gradient-to-r from-transparent to-amber-300/70" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/75">Into the Wild</p>
              <span className="h-px w-14 bg-gradient-to-l from-transparent to-amber-300/70" />
            </div>
          </motion.div>

          {/* Your cat card */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            className="mt-5 flex w-full max-w-md items-center gap-4 rounded-2xl border border-white/20 bg-black/45 px-5 py-3 shadow-xl shadow-black/40 backdrop-blur-md"
          >
            <CatPortrait skin={previewSkin} size={84} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/50">Your cat</p>
              <p className="truncate text-lg font-extrabold tracking-tight text-white">{player?.name ?? "Warrior"}</p>
              <p className="text-xs text-white/65">
                {clanName} · <span className="capitalize">{rank}</span>
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${toNext ? Math.min(100, (xp / toNext) * 100) : 100}%` }}
                />
              </div>
            </div>
          </motion.div>

          {/* Three modes */}
          <div className="mt-5 grid w-full max-w-4xl gap-3 sm:grid-cols-3">
            {MODES.map((m, i) => (
              <ModeCard key={m.id} mode={m} index={i} onPlay={onPlay} />
            ))}
          </div>

          {/* Bottom buttons */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="mt-auto flex flex-wrap items-center justify-center gap-2.5 pt-5"
          >
            <MenuButton icon={User} label="Character" onClick={() => setScreen("character")} />
            <MenuButton icon={SettingsIcon} label="Settings" onClick={() => setScreen("settings")} />
            <MenuButton
              icon={ArrowRight}
              label="Continue"
              onClick={() => onPlay(player && (player.storyStep ?? 0) > 0 && (player.storyStep ?? 0) < 16 ? "story" : "open", "")}
            />
          </motion.div>
          <p className="mt-2.5 pb-1 text-center text-[10px] text-white/40">
            One cat, every adventure — your cat, progress and discoveries are saved automatically.
          </p>
        </motion.div>
      )}
    </div>
  );
}

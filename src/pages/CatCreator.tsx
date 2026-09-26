// WarriorCatsRPG — create your cat: appearance, name, and Clan.

import { useMemo, useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { drawCat, type CatSkin } from "@/game/draw";
import type { GameMode } from "./ModeSelect";
import { cn } from "@/lib/utils";

export interface CatAppearanceForm {
  fur: string;
  furDark?: string;
  eye: string;
  chest?: string;
  pattern: "solid" | "tabby" | "tortie" | "bicolor";
  furLength: number;
  tail: "normal" | "short" | "fluffy" | "bob";
  ears: "normal" | "tall" | "fold";
  size: number;
  scar: boolean;
}

const FUR_COLORS = [
  "#d96b2f", "#e8963f", "#c9c2b8", "#8f8f96", "#5c5c60", "#2c2c30",
  "#7a5b3a", "#a5622d", "#e3c088", "#c98d5a", "#9fb2c8", "#b8c4d6",
  "#6b4a2f", "#d9a441", "#e8e6e0", "#8a7a66",
];
const EYE_COLORS = ["#4fae6e", "#5b8fd6", "#d9c04a", "#c98a1e", "#7fae4e", "#2c2c30", "#d9973a"];
const PATTERNS: { id: CatAppearanceForm["pattern"]; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "tabby", label: "Tabby" },
  { id: "tortie", label: "Tortie" },
  { id: "bicolor", label: "Bicolor" },
];
const TAILS: { id: CatAppearanceForm["tail"]; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "fluffy", label: "Fluffy" },
  { id: "short", label: "Short" },
  { id: "bob", label: "Bob" },
];
const EARS: { id: CatAppearanceForm["ears"]; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "tall", label: "Tall" },
  { id: "fold", label: "Fold" },
];

export const CLANS: {
  id: string;
  name: string;
  desc: string;
  territory: string;
  env: string;
  color: string;
}[] = [
  {
    id: "thunderclan",
    name: "ThunderClan",
    desc: "Brave and loyal. Warriors of the deep forest.",
    territory: "Oak and beech forest, Tallrock camp, Sandy Hollow",
    env: "Dense woodland with leafy clearings",
    color: "#4a8a4c",
  },
  {
    id: "riverclan",
    name: "RiverClan",
    desc: "Sleek and strong swimmers. Fishers of the river.",
    territory: "Riverbanks, reed beds, gravel camp",
    env: "Wetland with streams and a broad river",
    color: "#3d6f9e",
  },
  {
    id: "windclan",
    name: "WindClan",
    desc: "Swift runners of the open moor.",
    territory: "Open moorland, gorse camp, rabbit warrens",
    env: "Windy grassland under a wide sky",
    color: "#88b15c",
  },
  {
    id: "shadowclan",
    name: "ShadowClan",
    desc: "Proud night hunters. The pines are theirs.",
    territory: "Cold pine forest and marshes",
    env: "Dark, quiet woodland with bogs",
    color: "#356840",
  },
];

function darken(hex: string, f = 0.72): string {
  const n = hex.replace("#", "");
  const r = Math.round(parseInt(n.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(n.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(n.slice(4, 6), 16) * f);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const NAME_PARTS_A = ["Fire", "Gray", "Sand", "Dust", "Raven", "Silver", "Bramble", "Bracken", "Yellow", "Speckle", "Running", "Willow", "Bright", "Snow", "Oak", "Maple", "Fern", "Stagleap"];
const NAME_PARTS_B = ["paw", "heart", "tail", "fur", "stripe", "pelt", "claw", "whisker", "storm", "leaf", "stream", "pool", "fang", "spots"];

export function CatCreator({
  mode,
  onDone,
  onCancel,
}: {
  mode: GameMode;
  onDone: (cat: { name: string; appearance: CatAppearanceForm }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(() => {
    const a = NAME_PARTS_A[Math.floor(Math.random() * NAME_PARTS_A.length)];
    const b = Math.random() < 0.4 ? "paw" : NAME_PARTS_B[Math.floor(Math.random() * NAME_PARTS_B.length)];
    return `${a}${b}`;
  });
  const [appearance, setAppearance] = useState<CatAppearanceForm>(() => randomAppearance());
  const [clan, setClan] = useState<string>("thunderclan");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const skin: CatSkin = useMemo(
    () => ({
      ...appearance,
      furDark: darken(appearance.fur),
    }),
    [appearance],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const render = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(2.6, 2.6);
      drawCat(ctx, skin, canvas.width / 5.2, canvas.height / 2.6, 1, "walk", t / 1000, 0);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [skin]);

  const isStory = mode === "story";
  const isOpen = mode === "open";

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5">
            <ArrowLeft className="size-4" /> Back
          </Button>
          <h1 className="text-xl font-bold tracking-tight">
            {isStory ? "Begin Story Mode" : isOpen ? "Create your cat" : "Create your cat"}
          </h1>
          <div className="w-20" />
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[260px_1fr]">
          {/* Preview */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-b from-[#3f7d43] to-[#2c5a30] p-4 shadow-inner">
              <canvas ref={canvasRef} width={220} height={180} className="h-[180px] w-[220px]" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={() => setAppearance(randomAppearance())}
            >
              <RefreshCw className="size-3.5" /> Surprise me
            </Button>
            <div className="w-full">
              <label className="text-xs font-medium text-muted-foreground">Cat name</label>
              <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} className="mt-1" />
              {isStory && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Story mode plays as Rusty — your name will be used in dialogue.
                </p>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-5">
            <OptionRow label="Fur color">
              <Swatches colors={FUR_COLORS} value={appearance.fur} onChange={(fur) => setAppearance((a) => ({ ...a, fur, chest: undefined }))} />
            </OptionRow>
            <OptionRow label="Pattern">
              <Chips options={PATTERNS} value={appearance.pattern} onChange={(pattern) => setAppearance((a) => ({ ...a, pattern }))} />
            </OptionRow>
            <OptionRow label="Eye color">
              <Swatches colors={EYE_COLORS} value={appearance.eye} onChange={(eye) => setAppearance((a) => ({ ...a, eye }))} />
            </OptionRow>
            {appearance.pattern === "bicolor" && (
              <OptionRow label="Chest marking">
                <Swatches colors={["#f4e9d8", "#ffffff", "#e3c088"]} value={appearance.chest ?? "#f4e9d8"} onChange={(chest) => setAppearance((a) => ({ ...a, chest }))} />
              </OptionRow>
            )}
            <OptionRow label="Tail">
              <Chips options={TAILS} value={appearance.tail} onChange={(tail) => setAppearance((a) => ({ ...a, tail }))} />
            </OptionRow>
            <OptionRow label="Ears">
              <Chips options={EARS} value={appearance.ears} onChange={(ears) => setAppearance((a) => ({ ...a, ears }))} />
            </OptionRow>
            <OptionRow label={`Size — ${Math.round(appearance.size * 100)}%`}>
              <input
                type="range"
                min={0.85}
                max={1.15}
                step={0.01}
                value={appearance.size}
                onChange={(e) => setAppearance((a) => ({ ...a, size: Number(e.target.value) }))}
                className="w-full accent-[var(--primary)]"
              />
            </OptionRow>
            <OptionRow label="Battle scar">
              <button
                onClick={() => setAppearance((a) => ({ ...a, scar: !a.scar }))}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  appearance.scar ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {appearance.scar ? "Scarred" : "Unscarred"}
              </button>
            </OptionRow>

            {isOpen && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Choose your Clan</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {CLANS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setClan(c.id)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-all",
                        clan === c.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border/60 hover:bg-muted/50",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="text-sm font-semibold">{c.name}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{c.desc}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/70">{c.territory}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <Button
            size="lg"
            className="gap-2 rounded-full px-8"
            disabled={!name.trim()}
            onClick={() => onDone({ name: name.trim(), appearance })}
          >
            {isStory ? "Into the forest" : "Enter the forest"}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function randomAppearance(): CatAppearanceForm {
  return {
    fur: FUR_COLORS[Math.floor(Math.random() * FUR_COLORS.length)],
    furDark: "",
    eye: EYE_COLORS[Math.floor(Math.random() * EYE_COLORS.length)],
    pattern: PATTERNS[Math.floor(Math.random() * PATTERNS.length)].id,
    furLength: 1,
    tail: TAILS[Math.floor(Math.random() * TAILS.length)].id,
    ears: EARS[Math.floor(Math.random() * EARS.length)].id,
    size: 0.9 + Math.random() * 0.25,
    scar: Math.random() < 0.2,
  };
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-label={c}
          className={cn(
            "size-7 rounded-full border-2 transition-transform hover:scale-110",
            value === c ? "border-foreground ring-2 ring-ring" : "border-border/40",
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// WarriorCatsRPG — CatCustomizer: the polished avatar-editor screen.
//
// Layout (modern avatar-editor principles, original Warriors styling):
//   LEFT   category navigation (+ Favorites)
//   CENTER large live cat preview (the real drawCat sprite, animated)
//   RIGHT  item-card grid for the active category (or search results)
//   TOP    title + search + account name
//   BOTTOM SAVE / CANCEL / RESET / RANDOMIZE
//
// Everything renders through the same drawCat the game uses, so the preview
// IS the in-game cat. Changes are temporary until SAVE CAT.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Heart, RefreshCw, RotateCcw, Save, Search, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { drawCat, type CatSkin } from "@/game/draw";
import {
  ACCESSORY_COLORS,
  ACCESSORY_SLOTS,
  ACC_SLOT_CATS,
  ACC_THEMES,
  CATEGORIES,
  CAT_ITEMS,
  accessoriesFor,
  itemById,
  randomSkin,
  searchItems,
  type AccTheme,
  type AccessorySlot,
  type CatItem,
  type CustomSkin,
} from "@/game/catItems";
import { cn } from "@/lib/utils";
import type { CatPose } from "@/game/draw";

// Preview poses: let the player walk/lie/swim/dance their cat in the editor to
// verify accessories track every animation before saving.
const PREVIEW_POSES: { id: CatPose; name: string }[] = [
  { id: "sit", name: "Sit" },
  { id: "walk", name: "Walk" },
  { id: "sleep", name: "Sleep" },
  { id: "swim", name: "Swim" },
  { id: "groom", name: "Groom" },
  { id: "dance1", name: "Dance" },
];

// Which slot an accessory category belongs to (for the details strip).
function slotOfCategory(cat: string): AccessorySlot | undefined {
  return (Object.entries(ACC_SLOT_CATS) as [AccessorySlot, string][]).find(([, c]) => c === cat)?.[0];
}

// ---------------------------------------------------------------------------
// Live cat preview (same sprite renderer as the game)
// ---------------------------------------------------------------------------

function CatPreviewLarge({
  skin,
  pose = "sit",
  size = 320,
}: {
  skin: CustomSkin;
  pose?: CatPose;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [facing, setFacing] = useState<1 | -1>(1);

  useRenderEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const render = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const scale = size / 130;
      ctx.scale(scale, scale);
      drawCat(ctx, skin, 65, 108, facing, pose, t / 1000, 0);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  });

  return (
    <div className="relative" style={{ width: size, height: size * 0.85 }}>
      {/* soft stage */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-emerald-900/40 to-[#0d160d]/10 ring-1 ring-white/10" />
      <canvas ref={canvasRef} width={size} height={size * 0.85} className="relative z-10 h-full w-full" />
      <button
        onClick={() => setFacing(-1)}
        className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 px-2 py-1 text-xs text-white/70 hover:bg-black/60"
        aria-label="Look left"
      >
        ←
      </button>
      <button
        onClick={() => setFacing(1)}
        className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 px-2 py-1 text-xs text-white/70 hover:bg-black/60"
        aria-label="Look right"
      >
        →
      </button>
    </div>
  );
}

// Re-runs the render effect after every render so canvas closures always see
// the latest skin/item/tint (cheap: cancels the previous raf loop first).
function useRenderEffect(fn: () => void | (() => void)) {
  const cleanupRef = useRef<(() => void) | void>(undefined);
  useEffect(() => {
    cleanupRef.current?.();
    cleanupRef.current = fn();
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = undefined;
    };
  });
}

// ---------------------------------------------------------------------------
// Item card preview: draws ONE cat with only this item applied
// ---------------------------------------------------------------------------

function ItemCardPreview({ item, baseSkin, tint }: { item: CatItem; baseSkin: CustomSkin; tint: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useRenderEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const render = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(72 / 90, 72 / 90);
      // a NEUTRAL demo cat for color/pattern/eye cards; the player's coat for
      // markings/scars/accessories so the items read in context
      let skin: CustomSkin;
      if (item.category === "colors") {
        const probe: CustomSkin = { ...baseSkin, fur: "#c9c2b8", furDark: "#9a948b" };
        item.apply(probe);
        skin = probe;
      } else if (item.category === "eyes") {
        skin = { ...baseSkin, eye: "#4fae6e", eye2: undefined };
        if (!item.id.startsWith("eye-none")) item.apply(skin);
      } else {
        skin = { ...baseSkin, markings: [], scars: [], acc: {} };
        item.apply(skin);
      }
      skin.accColor = tint;
      drawCat(ctx, skin as CatSkin, 45, 66, 1, "sit", t / 1000, 0);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  });

  return <canvas ref={canvasRef} width={72} height={58} className="h-[58px] w-[72px]" />;
}

// ---------------------------------------------------------------------------
// Preset thumbnail
// ---------------------------------------------------------------------------

function PresetThumb({ skin, size = 64 }: { skin: CustomSkin; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useRenderEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const render = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(size / 100, size / 100);
      drawCat(ctx, skin as CatSkin, 50, 68, 1, "sit", t / 1000, 0);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  });
  return <canvas ref={canvasRef} width={size} height={size} className="h-full w-full" />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface CustomizerSave {
  skin: CustomSkin;
  name?: string;
}

export function CatCustomizer({
  open,
  playerName,
  initialSkin,
  savedSkin,
  favorites: initialFavorites,
  presets: initialPresets,
  onClose,
  onSave, // (skin, favorites, presets) — persists everything to the account
}: {
  open: boolean;
  playerName: string;
  initialSkin: CustomSkin; // what the editor starts from (= saved cat)
  savedSkin: CustomSkin; // the account's persisted cat (RESET target)
  favorites: string[];
  presets: { name: string; skin: CustomSkin }[];
  onClose: () => void;
  onSave: (s: { skin: CustomSkin; favorites: string[]; presets: { name: string; skin: CustomSkin }[] }) => void;
}) {
  const [skin, setSkin] = useState<CustomSkin>(initialSkin);
  const [category, setCategory] = useState<string>("fur");
  const [query, setQuery] = useState("");
  const [pose, setPose] = useState<CatPose>("sit");
  const [accSlot, setAccSlot] = useState<AccessorySlot | "all">("all");
  const [accTheme, setAccTheme] = useState<AccTheme | undefined>(undefined);
  const [favorites, setFavorites] = useState<string[]>(initialFavorites);
  const [presets, setPresets] = useState<{ name: string; skin: CustomSkin }[]>(initialPresets);
  const [accColor, setAccColor] = useState<string>(initialSkin.accColor ?? "#d95f5f");
  const [selected, setSelected] = useState<CatItem | null>(null);
  const [presetConfirm, setPresetConfirm] = useState<{ name: string } | null>(null);
  const [presetApply, setPresetApply] = useState<number | null>(null);

  if (!open) return null;

  // Left-nav categories: only ones that actually contain items, plus the
  // ACCESSORIES umbrella (all six accessory slots in one browsable place).
  const NAV = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    for (const c of CATEGORIES) {
      if (CAT_ITEMS.some((i) => i.category === c.id)) list.push({ id: c.id, name: c.name });
      if (c.id === "paw") list.push({ id: "accessories", name: "Accessories" });
    }
    list.push({ id: "favorites", name: "Favorites" });
    return list;
  }, []);

  const items = useMemo(() => {
    if (query.trim()) return searchItems(query, "all");
    if (category === "favorites") return CAT_ITEMS.filter((i) => favorites.includes(i.id));
    if (category === "accessories") return accessoriesFor(accSlot, accTheme);
    return searchItems("", category as never);
  }, [query, category, favorites, accSlot, accTheme]);

  const toggleFavorite = (id: string) => {
    setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  };

  const randomize = () => {
    // randomSkin() builds a complete VALID appearance from the real catalog
    // (coats, patterns, markings, eyes, face, and up to two accessories).
    setSkin(randomSkin(skin));
  };

  const savePreset = (name: string) => {
    setPresets((p) => [...p, { name: name.trim() || `Preset ${p.length + 1}`, skin: { ...skin } }].slice(0, 10));
    setPresetConfirm(null);
  };

  const dirty = JSON.stringify(skin) !== JSON.stringify(savedSkin);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[60] flex flex-col bg-[#0d160d]/95 backdrop-blur-md"
      >
        {/* ---------- TOP BAR ---------- */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-extrabold uppercase tracking-[0.22em] text-white">Customize Cat</h1>
            <span className="hidden text-xs text-white/50 sm:block">{playerName}</span>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/40" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all items… (flower, collar, fluffy)"
              className="h-8 border-white/15 bg-black/40 pl-8 text-xs text-white placeholder:text-white/30"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ---------- MAIN 3-COLUMN ---------- */}
        <div className="flex min-h-0 flex-1">
          {/* LEFT: categories */}
          <div className="hidden w-40 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-white/10 p-2 sm:flex">
            {NAV.map((c) => {
              const active = !query && category === c.id;
              const count =
                c.id === "favorites"
                  ? favorites.length
                  : c.id === "accessories"
                    ? accessoriesFor("all").length
                    : CAT_ITEMS.filter((i) => i.category === c.id).length;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setCategory(c.id);
                    setQuery("");
                    if (c.id === "accessories") setAccSlot("all");
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                    c.id === "accessories" && "mt-1 border-t border-white/10 pt-2",
                    active ? "bg-amber-400/20 text-amber-200" : "text-white/60 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {c.id === "favorites" && <Heart className={cn("size-3", favorites.length ? "fill-amber-300 text-amber-300" : "")} />}
                    {c.name}
                  </span>
                  <span className="text-[10px] text-white/30">{count}</span>
                </button>
              );
            })}
          </div>

          {/* CENTER: preview */}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center p-3">
            <CatPreviewLarge skin={skin} pose={pose} />
            {/* pose switcher: test that every accessory tracks every animation */}
            <div className="mt-2 flex flex-wrap justify-center gap-1">
              {PREVIEW_POSES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPose(p.id)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors",
                    pose === p.id ? "bg-amber-400/25 text-amber-200 ring-1 ring-amber-300/40" : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {/* item details strip */}
            {selected && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 w-full max-w-xs rounded-xl border border-white/10 bg-black/40 p-2.5 text-center"
              >
                <p className="text-xs font-bold text-white">{selected.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-white/40">
                  {slotOfCategory(selected.category)
                    ? `Slot: ${ACCESSORY_SLOTS.find((s) => s.id === slotOfCategory(selected.category))?.name}`
                    : selected.category}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-white/60">{selected.desc}</p>
                <div className="mt-2 flex justify-center gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 rounded-lg bg-amber-400 px-3 text-[11px] font-bold text-[#0d160d] hover:bg-amber-300"
                    onClick={() => {
                      const next = { ...skin, accColor };
                      selected.apply(next);
                      setSkin(next);
                    }}
                  >
                    {selected.isOn(skin) ? "Unequip" : "Equip"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 rounded-lg px-2 text-[11px] text-white/70 hover:bg-white/10"
                    onClick={() => toggleFavorite(selected.id)}
                  >
                    <Heart className={cn("size-3", favorites.includes(selected.id) && "fill-amber-300 text-amber-300")} />
                    {favorites.includes(selected.id) ? "Favorited" : "Favorite"}
                  </Button>
                </div>
              </motion.div>
            )}
            {/* pattern intensity: live stripe/spot density control */}
            {category === "patterns" && (
              <div className="mt-2 flex w-full max-w-xs items-center gap-2">
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-white/40">Marking density</span>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={skin.patternIntensity ?? 0.7}
                  onChange={(e) => setSkin((s) => ({ ...s, patternIntensity: Number(e.target.value) }))}
                  className="h-1 w-full accent-amber-300"
                  aria-label="Pattern intensity"
                />
              </div>
            )}
            {/* accessory tint */}
            {(category === "accessories" || ["head", "ear", "neck", "body", "paw", "tailAcc"].includes(category)) && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-white/40">Item color</span>
                {ACCESSORY_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setAccColor(c);
                      setSkin((s) => ({ ...s, accColor: c }));
                    }}
                    className={cn(
                      "size-4 rounded-full border transition-transform hover:scale-110",
                      accColor === c ? "border-white ring-2 ring-amber-300" : "border-white/20",
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Accessory color ${c}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: item grid */}
          <div className="flex w-full max-w-[380px] shrink-0 flex-col border-l border-white/10 sm:w-[380px]">
            <div className="border-b border-white/10 px-3 py-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                {query
                  ? `Results for "${query}"`
                  : category === "accessories"
                    ? "Accessories"
                    : (CATEGORIES.find((c) => c.id === category)?.name ?? "Items")}
                <span className="ml-1.5 text-white/30">{items.length}</span>
              </p>
              {category === "accessories" && !query && (
                <>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {([{ id: "all" as const, name: "All slots" }, ...ACCESSORY_SLOTS]).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setAccSlot(s.id as AccessorySlot | "all")}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                          accSlot === s.id
                            ? "bg-amber-400/25 text-amber-200 ring-1 ring-amber-300/40"
                            : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button
                      onClick={() => setAccTheme(undefined)}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                        !accTheme
                          ? "bg-amber-400/25 text-amber-200 ring-1 ring-amber-300/40"
                          : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white",
                      )}
                    >
                      All themes
                    </button>
                    {ACC_THEMES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setAccTheme(t.id)}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                          accTheme === t.id
                            ? "bg-amber-400/25 text-amber-200 ring-1 ring-amber-300/40"
                            : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3 max-[420px]:grid-cols-2 md:grid-cols-3">
              {items.map((item) => {
                const on = item.isOn(skin);
                const fav = favorites.includes(item.id);
                return (
                  <motion.button
                    key={item.id}
                    layout
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      const next = { ...skin, accColor };
                      item.apply(next);
                      setSkin(next);
                      setSelected(item);
                    }}
                    className={cn(
                      "group relative rounded-xl border p-1.5 text-left transition-colors",
                      on
                        ? "border-amber-400/70 bg-amber-400/15 ring-1 ring-amber-300/50"
                        : "border-white/10 bg-black/30 hover:border-white/30 hover:bg-white/10",
                    )}
                  >
                    <div className="flex items-center justify-center rounded-lg bg-gradient-to-b from-emerald-900/30 to-black/10">
                      <ItemCardPreview item={item} baseSkin={skin} tint={accColor} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1 px-0.5">
                      <span className={cn("truncate text-[10px] font-medium", on ? "text-amber-200" : "text-white/70")}>
                        {item.name}
                      </span>
                      {on && <Check className="size-3 shrink-0 text-amber-300" />}
                    </div>
                    {/* favorite toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(item.id);
                      }}
                      className="absolute right-1 top-1 rounded-full bg-black/40 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Favorite"
                    >
                      <Heart className={cn("size-3", fav ? "fill-amber-300 text-amber-300" : "text-white/60")} />
                    </button>
                    {fav && !on && <Heart className="absolute right-1 top-1 size-3 fill-amber-300 text-amber-300 sm:opacity-0 group-hover:opacity-0" style={{ opacity: fav ? 1 : 0 }} />}
                  </motion.button>
                );
              })}
              {items.length === 0 && (
                <p className="col-span-full py-8 text-center text-xs text-white/40">
                  {category === "favorites" ? "No favorites yet — tap the heart on any item." : "Nothing matches that search."}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ---------- PRESETS STRIP ---------- */}
        <div className="border-t border-white/10 px-3 py-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
              <Star className="size-3 text-amber-300" /> Presets
            </span>
            {presets.map((p, idx) => (
              <div
                key={idx}
                className={cn(
                  "group relative w-16 shrink-0 cursor-pointer rounded-lg border p-1 text-center transition-colors",
                  presetApply === idx ? "border-amber-400/70 bg-amber-400/15" : "border-white/10 bg-black/30 hover:border-white/30",
                )}
                onClick={() => setPresetApply(idx)}
              >
                <div className="mx-auto h-12 w-12 overflow-hidden rounded-md bg-emerald-950/50">
                  <PresetThumb skin={p.skin} />
                </div>
                <p className="mt-0.5 truncate text-[9px] text-white/70">{p.name}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPresets((ps) => ps.filter((_, i) => i !== idx));
                  }}
                  className="absolute -right-1 -top-1 hidden rounded-full bg-red-500/80 p-0.5 text-white group-hover:block"
                  aria-label="Delete preset"
                >
                  <Trash2 className="size-2.5" />
                </button>
              </div>
            ))}
            {presets.length < 10 && (
              <button
                onClick={() => setPresetConfirm({ name: "" })}
                className="h-[72px] w-16 shrink-0 rounded-lg border border-dashed border-white/20 text-white/50 transition-colors hover:border-amber-300/50 hover:text-amber-200"
              >
                <span className="block text-lg leading-none">+</span>
                <span className="text-[9px]">Save current</span>
              </button>
            )}
            {presetApply !== null && presets[presetApply] && (
              <div className="ml-auto flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  className="h-7 rounded-lg bg-amber-400 px-3 text-[11px] font-bold text-[#0d160d] hover:bg-amber-300"
                  onClick={() => {
                    setSkin({ ...presets[presetApply].skin });
                    setPresetApply(null);
                  }}
                >
                  Apply "{presets[presetApply].name}"
                </Button>
                <Button size="sm" variant="ghost" className="h-7 rounded-lg px-2 text-[11px] text-white/70" onClick={() => setPresetApply(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
          {/* preset name prompt */}
          {presetConfirm && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                autoFocus
                value={presetConfirm.name}
                onChange={(e) => setPresetConfirm({ name: e.target.value.slice(0, 24) })}
                placeholder="Enter preset name… (e.g. Forest Warrior)"
                className="h-7 border-white/15 bg-black/40 text-xs text-white"
                onKeyDown={(e) => {
                  if (e.key === "Enter") savePreset(presetConfirm.name);
                  if (e.key === "Escape") setPresetConfirm(null);
                }}
              />
              <Button size="sm" className="h-7 rounded-lg bg-amber-400 px-3 text-[11px] font-bold text-[#0d160d]" onClick={() => savePreset(presetConfirm.name)}>
                Save preset
              </Button>
              <Button size="sm" variant="ghost" className="h-7 rounded-lg px-2 text-[11px] text-white/70" onClick={() => setPresetConfirm(null)}>
                Cancel
              </Button>
            </div>
          )}
        </div>

        {/* ---------- BOTTOM BAR ---------- */}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-2.5">
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-xl border-white/20 bg-black/30 text-xs text-white hover:bg-white/10"
              onClick={() => setSkin({ ...savedSkin })}
              disabled={!dirty}
            >
              <RotateCcw className="size-3.5" /> Reset
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-xl border-white/20 bg-black/30 text-xs text-white hover:bg-white/10"
              onClick={randomize}
            >
              <RefreshCw className="size-3.5" /> Randomize
            </Button>
          </div>
          <p className="hidden text-[10px] text-white/40 md:block">
            {dirty ? "Unsaved changes — press SAVE CAT to keep them." : "Saved cat"}
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-xl px-3 text-xs text-white/70 hover:bg-white/10"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 rounded-xl bg-amber-400 px-4 text-xs font-bold text-[#0d160d] hover:bg-amber-300"
              onClick={() => onSave({ skin, favorites, presets })}
            >
              <Save className="size-3.5" /> Save Cat
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

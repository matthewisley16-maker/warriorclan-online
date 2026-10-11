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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Heart, PawPrint, RefreshCw, RotateCcw, Save, Search, Sparkles, Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { drawCat, normalizeSkin, type CatSkin } from "@/game/draw";
import { SAVE_TIMEOUT_MS, errorMessage, withTimeout } from "@/game/saveFlow";
import { createSaveQueue, type SaveQueue } from "@/game/saveQueue";
import {
  ACCESSORY_SLOTS,
  ACC_SLOT_CATS,
  ACC_THEMES,
  CATEGORIES,
  CAT_ITEMS,
  SLOT_COLORS,
  accessoriesFor,
  accTint,
  itemById,
  randomSkin,
  sanitizeSkin,
  searchItems,
  type AccTheme,
  type AccessorySlot,
  type CatItem,
  type CustomSkin,
} from "@/game/catItems";
import { applyMorph, applyPreset, morphById, presetById, stripPresetAndMorph, CAT_MORPHS, CHARACTER_PRESETS, PRESET_GROUPS, type PresetGroup } from "@/game/presets";
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

// slot id -> short label (collars/neck share the neck slot color controls)
const ACCESSORY_SLOTS_BY_ID: Record<AccessorySlot, string> = {
  head: "Head",
  ear: "Ears",
  neck: "Neck",
  body: "Body",
  paw: "Paws",
  tail: "Tail",
};

// shared fallback tint swatches (kept identical to the catalog pool)
const SHARED_ACC_COLORS = [
  "#d95f5f", "#5b8fd6", "#d9a83a", "#7fae4e", "#b07ad9", "#f0a05a", "#e8e6e0", "#2c2c30",
];

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
  // §6/§15: if a frame ever fails to draw we SAY so (and keep the loop alive so
  // it recovers) instead of showing an unexplained blank stage. The old code
  // let the first throw kill the requestAnimationFrame chain outright, which is
  // exactly how the preview ended up permanently empty.
  const [drawError, setDrawError] = useState<string | null>(null);

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
      // ground point hugs the canvas floor so paws + shadow are never clipped;
      // 12px of local head-room keeps the ANIMATED tail (which sweeps a few px
      // below the shadow line) inside the stage at every editor size.
      // (Uniform scale only — proportions are preserved, never stretched.)
      // Every skin is normalized first, so a partial/loading appearance still
      // renders the real cat rather than throwing.
      const groundY = canvas.height / scale - 12;
      try {
        drawCat(ctx, normalizeSkin(skin), 65, groundY, facing, pose, t / 1000, 0, {
          tailId: "editor:preview",
        });
        setDrawError((e) => (e === null ? e : null));
      } catch (err) {
        console.error("[customizer] live preview failed to render", err);
        setDrawError(err instanceof Error ? err.message : String(err));
      }
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
      {drawError && (
        <div className="absolute inset-x-2 bottom-2 z-30 rounded-lg bg-red-500/85 px-2 py-1 text-center text-[10px] font-semibold text-white">
          Preview error: {drawError}
        </div>
      )}
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

/** Measure an element (ResizeObserver → fires on resize/layout only, never
 *  per frame). Drives the scale-to-fit cat preview stage. */
function useElementSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

// ---------------------------------------------------------------------------
// Item card preview: draws ONE cat with only this item applied
// ---------------------------------------------------------------------------

function ItemCardPreview({ item, baseSkin, tint }: { item: CatItem; baseSkin: CustomSkin; tint: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // §5: a thumbnail that cannot be drawn shows a fallback icon instead of an
  // empty box — the item keeps its name, its selected state and its click.
  const [drawFailed, setDrawFailed] = useState(false);
  // Only on-screen cards run an animation loop: the "All Items" view holds the
  // whole catalog (160 cards) and 160 always-on RAF loops would freeze the
  // editor. Scrolling a card into view starts its loop, leaving it stops it.
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return; // animate as before
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), {
      rootMargin: "160px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useRenderEffect(() => {
    if (drawFailed || !inView) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const render = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // 104-unit design box: the cat's canonical sprite box (see drawCat) fits
      // with the paws/tail inside the 72x58 thumbnail (they used to be cut off)
      ctx.scale(72 / 104, 72 / 104);
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
      try {
        drawCat(ctx, normalizeSkin(skin), 52, 68, 1, "sit", t / 1000, 0, { tailId: `editor:item:${item.id}` });
      } catch (err) {
        // never silently blank: report the real error, then fall back to an icon
        console.error("[customizer] item thumbnail failed to render", item.id, err);
        setDrawFailed(true);
        return;
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  });

  if (drawFailed) {
    return (
      <div
        className="flex h-[58px] w-[72px] items-center justify-center text-white/35"
        role="img"
        aria-label={`${item.name} preview unavailable`}
      >
        <PawPrint className="size-4" />
      </div>
    );
  }
  return <canvas ref={canvasRef} width={72} height={58} className="h-[58px] w-[72px]" />;
}

// ---------------------------------------------------------------------------
// Preset thumbnail
// ---------------------------------------------------------------------------

function PresetThumb({ skin, size = 64, pose = "sit", id = "editor:thumb" }: { skin: CustomSkin; size?: number; pose?: CatPose; id?: string }) {
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
      drawCat(ctx, normalizeSkin(skin), 50, 68, 1, pose, t / 1000, 0, { tailId: id });
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  });
  return <canvas ref={canvasRef} width={size} height={size} className="h-full w-full" />;
}

// ---------------------------------------------------------------------------
// View model — pure and hook-free, so the panel's contents can be computed
// (and asserted) without a browser, and so the component's hook order stays
// stable.
//
// NOTE: these used to be `useMemo` calls sitting AFTER the component's
// `if (!open) return null` guard. Any render where `open` was false then true
// calls more hooks than the previous render, which makes React throw
// "Rendered more hooks than during the previous render" and tear the editor
// down. Pure helpers called from the render body have no such hazard.
// ---------------------------------------------------------------------------

export interface ViewOptions {
  query: string;
  category: string;
  favorites: string[];
  accSlot: AccessorySlot | "all";
  accTheme?: AccTheme;
}

/** A selectable left-nav entry, with the number of items it will show. */
export interface NavEntry {
  id: string;
  name: string;
  count: number;
}

/**
 * Every nav entry the editor actually offers: the real item categories that
 * contain items (never an empty placeholder), the ACCESSORIES umbrella, the
 * full catalog, morphs, WARRIORS presets and favorites.
 */
export function customizerNav(favoritesCount = 0): NavEntry[] {
  const list: NavEntry[] = [{ id: "all", name: "All Items", count: CAT_ITEMS.length }];
  for (const c of CATEGORIES) {
    const count = CAT_ITEMS.filter((i) => i.category === c.id).length;
    if (count > 0) list.push({ id: c.id, name: c.name, count });
    // the umbrella view over all six accessory slots (ids differ per slot)
    if (c.id === "paw") list.push({ id: "accessories", name: "Accessories", count: accessoriesFor("all").length });
  }
  list.push({ id: "morphs", name: "Morphs", count: CAT_MORPHS.length });
  list.push({ id: "warriors", name: "Warriors Presets", count: CHARACTER_PRESETS.length });
  list.push({ id: "favorites", name: "Favorites", count: favoritesCount });
  return list;
}

/** True when a category renders the flat item grid (not morphs/presets). */
export function isItemGridCategory(category: string): boolean {
  return category !== "morphs" && category !== "warriors";
}

/** The exact items the panel shows for a view — the same call the UI makes. */
export function itemsForView(o: ViewOptions): CatItem[] {
  if (o.query.trim()) return searchItems(o.query, "all");
  if (o.category === "all") return searchItems("", "all");
  if (o.category === "favorites") return CAT_ITEMS.filter((i) => o.favorites.includes(i.id));
  if (o.category === "accessories") return accessoriesFor(o.accSlot, o.accTheme);
  return searchItems("", o.category as never);
}

/** Flat list of every item the WARRIORS preset library shows for a search. */
export function characterListFor(query: string, group: PresetGroup | "all") {
  const q = query.trim().toLowerCase();
  return CHARACTER_PRESETS.filter(
    (p) =>
      (group === "all" || p.group === group) &&
      (!q ||
        p.displayName.toLowerCase().includes(q) ||
        p.blurb.toLowerCase().includes(q) ||
        p.tags.some((t) => t.includes(q))),
  );
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
  onPersist, // §10: awaited persistence of the FULL appearance (all fields)
  loading = false, // §15: the account's cat is still loading — say so, never guess
}: {
  open: boolean;
  playerName: string;
  initialSkin: CustomSkin; // what the editor starts from (= saved cat)
  savedSkin: CustomSkin; // the account's persisted cat (RESET target)
  favorites: string[];
  presets: { name: string; skin: CustomSkin }[];
  onClose: () => void;
  onSave: (s: { skin: CustomSkin; favorites: string[]; presets: { name: string; skin: CustomSkin }[] }) => void;
  /** §10: awaited BEFORE onSave — persists the full appearance to the account.
   * Receives the CURRENT editor skin so the parent saves exactly what is on
   * screen (never a stale initial value). */
  onPersist?: (s: { skin: CustomSkin }) => Promise<void> | void;
  /** §15: the account's saved cat has not arrived yet */
  loading?: boolean;
}) {
  // §11/§6: an editor is ALWAYS handed a complete, renderable cat. An empty
  // `{}` (an account row that has not loaded, or has no save yet) used to reach
  // drawCat and to be written back on SAVE — normalizeSkin fills every field
  // from the real defaults instead, so the preview shows the actual cat and the
  // save payload is never missing `fur`.
  const [skin, setSkin] = useState<CustomSkin>(() => normalizeSkin(initialSkin) as CustomSkin);
  const [category, setCategory] = useState<string>("fur");
  const [query, setQuery] = useState("");
  const [pose, setPose] = useState<CatPose>("sit");
  const [accSlot, setAccSlot] = useState<AccessorySlot | "all">("all");
  const [accTheme, setAccTheme] = useState<AccTheme | undefined>(undefined);
  // defensive: a caller that passes undefined must never crash the item panel
  // (the grid reads `favorites.includes` on every render)
  const [favorites, setFavorites] = useState<string[]>(() => (Array.isArray(initialFavorites) ? initialFavorites : []));
  const [presets, setPresets] = useState<{ name: string; skin: CustomSkin }[]>(() => (Array.isArray(initialPresets) ? initialPresets : []));
  // §21/§C: the accessory tint lives ON the skin — `skin.accColor` — and nowhere
  // else. A second copy in component state used to shadow it: RANDOMIZE wrote
  // the rolled tint onto the skin, but the next card click copied the stale
  // state value back over it, so a randomized cat silently lost its rolled
  // tints. One appearance model, one source of truth.
  const [selected, setSelected] = useState<CatItem | null>(null);
  const [presetConfirm, setPresetConfirm] = useState<{ name: string } | null>(null);
  const [presetApply, setPresetApply] = useState<number | null>(null);
  // --- WARRIORS character presets + morphs (§24-§30) ---
  const [charQuery, setCharQuery] = useState("");
  const [charGroup, setCharGroup] = useState<PresetGroup | "all">("all");
  const [charPreview, setCharPreview] = useState<string | null>(null); // selected preset id
  // §10: SAVE CAT awaits the real persistence before confirming — a failed
  // save keeps the editor open with the changes intact (never silently lost).
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  // the reason a save failed, shown to the player next to the Retry button
  const [saveError, setSaveError] = useState<string | null>(null);
  // a non-save problem the player should know about (e.g. a refused randomize)
  const [notice, setNotice] = useState<string | null>(null);
  // §5: a view that cannot be computed must SAY so (with a Retry) instead of
  // rendering a silently blank panel. `retryTick` re-runs the computation.
  const [retryTick, setRetryTick] = useState(0);

  // scale-to-fit preview stage: min(available width, height/0.85) — uniform
  // scale only (proportions preserved), clamped so the cat stays readable on
  // tiny windows and never overflows. Re-measured on resize via ResizeObserver.
  const [stageRef, stageSize] = useElementSize();
  const previewSize = Math.round(
    Math.max(150, Math.min(420, (stageSize.w || 300) - 8, (stageSize.h || 300) / 0.85)),
  );

  // Left-nav categories: only ones that actually contain items, plus the
  // ACCESSORIES umbrella (all six accessory slots in one browsable place),
  // the MORPHS view and the WARRIORS CHARACTER PRESETS library (§24).
  const nav = useMemo(() => customizerNav(favorites.length), [favorites.length]);

  // §3/§5: the grid is computed defensively — a failure is reported (and
  // logged) instead of leaving the panel blank, and a later successful
  // recompute clears it again (the error is DERIVED, never a stale flag).
  const view = useMemo(() => {
    try {
      return { items: itemsForView({ query, category, favorites, accSlot, accTheme }), error: null as string | null };
    } catch (err) {
      console.error("[customizer] failed to build the item list", err);
      return { items: [], error: err instanceof Error ? err.message : String(err) };
    }
  }, [query, category, favorites, accSlot, accTheme, retryTick]);
  const items = view.items;
  const viewError = view.error;

  // §26: character library filtered by name search + group filter.
  const charList = useMemo(() => characterListFor(charQuery, charGroup), [charQuery, charGroup]);

  // The catalog is a local module, so it is either complete or absent — this
  // distinguishes "nothing to show" from "the catalog did not load".
  const catalogEmpty = CAT_ITEMS.length === 0;
  const activeNav = nav.find((n) => n.id === category);

  // §14/§16/§22: ONE serialized write path. Every save (manual or autosave)
  // goes through the shared save queue (`src/game/saveQueue.ts`), which never
  // overlaps writes and answers EVERY caller with the real outcome of the write
  // of ITS OWN look — so the editor can neither claim success before the
  // backend confirmed it nor sit on "Saving…" forever:
  //   - the write itself is bounded (SAVE_TIMEOUT_MS): a request that never
  //     settles is reported as a FAILURE (see `persist` below);
  //   - a queued request used to be answered with an immediate `true`, which
  //     closed the editor while the write was still in flight;
  //   - a look already confirmed-persisted this session is not written twice.
  // (Declared HERE, above the early return, so the hook order never changes
  // when the editor opens/closes.)
  const lastAutoRef = useRef<string | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);
  const skinToSave = useMemo(() => normalizeSkin(skin) as CustomSkin, [skin]);
  const savedNorm = useMemo(() => normalizeSkin(savedSkin) as CustomSkin, [savedSkin]);
  const dirty = JSON.stringify(skinToSave) !== JSON.stringify(savedNorm);
  const persist = useCallback(
    async (next: CustomSkin): Promise<boolean> => {
      if (!onPersist) return true; // no persistence hook wired: keep prior behaviour
      try {
        // §15: NEVER wait on the backend without a bound. A pending mutation
        // (offline socket, reconnecting client, slow deployment) is a failure
        // the player can retry — never an endless loading state, and never
        // silently treated as a success.
        await withTimeout(() => Promise.resolve(onPersist({ skin: next })), SAVE_TIMEOUT_MS, "appearance save");
        setSaveError(null);
        return true;
      } catch (err) {
        // §14/§15: the real error is reported and the editor keeps the changes
        console.error("[customizer] appearance save failed", err);
        setSaveError(errorMessage(err));
        return false;
      }
    },
    [onPersist],
  );
  // the queue is created ONCE and always calls the newest persistence hook
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const queueRef = useRef<SaveQueue<CustomSkin> | null>(null);
  if (!queueRef.current) {
    queueRef.current = createSaveQueue<CustomSkin>({
      write: (item) => persistRef.current(item),
      onState: (state) => setSaveState(state),
    });
  }
  const runSave = useCallback((next: CustomSkin): Promise<boolean> => queueRef.current!.save(next), []);

  // §16 autosave: only AFTER one confirmed save in this session (so §20's
  // "changes are temporary until SAVE" still holds), debounced 900ms, and only
  // for a look that differs from the account's saved one — a distinct look is
  // autosaved at most once.
  useEffect(() => {
    if (!savedOnce || loading) return;
    const key = JSON.stringify(skinToSave);
    if (key === JSON.stringify(savedNorm)) return; // already the account's cat
    if (key === lastAutoRef.current) return; // this exact look is already written
    const id = window.setTimeout(() => {
      lastAutoRef.current = key;
      void runSave(skinToSave);
    }, 900);
    return () => window.clearTimeout(id);
  }, [savedOnce, loading, skinToSave, savedNorm, runSave]);
  // §15: clear the confirmation after a moment, so "Saved successfully" is
  // information and not a permanent label
  useEffect(() => {
    if (saveState !== "saved") return;
    const id = window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 2500);
    return () => window.clearTimeout(id);
  }, [saveState]);

  // §17: the account's saved cat can arrive AFTER the editor opened (e.g. the
  // editor was opened from the menu while the save was still loading). Adopt it
  // then — but NEVER over the player's own edits: `untouched` is true only while
  // the editor still shows exactly what it was opened with.
  const openedWithRef = useRef<string>(JSON.stringify(normalizeSkin(initialSkin)));
  const untouched = JSON.stringify(skinToSave) === openedWithRef.current;
  useEffect(() => {
    if (!untouched) return;
    const next = normalizeSkin(savedSkin) as CustomSkin;
    openedWithRef.current = JSON.stringify(next);
    setSkin((s) => (JSON.stringify(s) === JSON.stringify(next) ? s : next));
  }, [savedSkin, untouched]);

  // --- the early return comes AFTER every hook (see the View model note) ---
  if (!open) return null;

  const toggleFavorite = (id: string) => {
    setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  };

  // §A: RANDOMIZE edits THIS cat's appearance through the shared model — it
  // never touches the camera, the pose, the animation clock or the sprite
  // transforms. The rolled look is validated against the catalog before it is
  // applied, and only ever replaces the editor's pending look (the player still
  // has to press SAVE CAT), so a bad roll can never reach the account or leave
  // the editor in a broken state.
  const randomize = () => {
    setNotice(null);
    const rolled = sanitizeSkin(randomSkin(skin));
    // Paranoia: randomSkin already sanitizes. If the model ever drifts, keep the
    // current (known-good) cat and SAY so instead of applying a broken one.
    if (!rolled.fur || !rolled.furDark || !rolled.eye) {
      console.error("[customizer] randomize produced an invalid appearance; keeping the current cat", rolled);
      setNotice("Randomize could not build a valid cat — your previous look is unchanged. Try again.");
      return;
    }
    setSkin(rolled);
  };

  const savePreset = (name: string) => {
    setPresets((p) => [...p, { name: name.trim() || `Preset ${p.length + 1}`, skin: { ...skin } }].slice(0, 10));
    setPresetConfirm(null);
  };

  // §B: the ONE confirm action behind both the SAVE CAT button and the Retry
  // button. The account write happens FIRST and is awaited; only a real success
  // closes the editor with the new cat applied — a failure keeps every change
  // on screen and re-offers Retry.
  const confirmSave = () => {
    setNotice(null);
    lastAutoRef.current = JSON.stringify(skinToSave);
    void runSave(skinToSave).then((ok) => {
      if (!ok) return;
      setSavedOnce(true);
      onSave({ skin: skinToSave, favorites, presets });
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[60] flex flex-col bg-[#0d160d]/95 backdrop-blur-md"
      >
        {/* ---------- TOP BAR ---------- */}
        <div
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-white/10
            pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] py-2.5"
        >
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

        {/* ---------- MAIN 3-COLUMN (stacks on narrow windows) ---------- */}
        {/* §3: on short/narrow windows the middle section scrolls as a whole —
            the item panel keeps its own floor, so it can never be crushed to
            an (empty-looking) zero-height strip. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          {/* LEFT: categories (scrolls internally; full list preserved) */}
          <div className="hidden min-h-0 w-36 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-white/10 p-2 md:flex lg:w-44">
            {nav.map((c) => {
              const active = !query && category === c.id;
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
                  <span className="text-[10px] text-white/30">{c.count}</span>
                </button>
              );
            })}
          </div>

          {/* category strip for narrow windows — the SAME nav list, nothing
              hidden: every category stays reachable (horizontally scrollable) */}
          <div
            role="tablist"
            aria-label="Customization categories"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 p-2 md:hidden"
          >
            {nav.map((c) => {
              const active = !query && category === c.id;
              return (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setCategory(c.id);
                    setQuery("");
                    if (c.id === "accessories") setAccSlot("all");
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                    active ? "bg-amber-400/20 text-amber-200 ring-1 ring-amber-300/40" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>

          {/* CENTER: preview — scale-to-fit stage + internally scrolling detail
              area. The stage keeps the cat fully visible (ears→tail); extra
              panels (details, colors, morph) scroll INSIDE this column so the
              title bars, presets strip and bottom bar never move. */}
          <div className="flex max-h-[38dvh] min-h-[140px] min-w-0 shrink flex-col items-center overflow-y-auto p-3 md:max-h-none md:min-h-0 md:flex-1">
            <div ref={stageRef} className="flex min-h-[150px] w-full flex-1 items-center justify-center">
              <CatPreviewLarge skin={skin} pose={pose} size={previewSize} />
            </div>
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
                      // the tint already lives on the skin — never copied back
                      // from (or into) a second piece of state
                      const next = { ...skin };
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
            {/* §21: per-slot color swatches — every equipped (or browsed) slot
                can carry its OWN tint, so a red flower + blue collar coexist */}
            {(category === "accessories" || ["head", "ear", "collars", "neck", "body", "paw", "tailAcc"].includes(category)) && (
              <div className="mt-2 w-full max-w-xs space-y-1.5">
                {([
                  ...(accSlot !== "all" ? [accSlot] : []),
                  ...((Object.keys(ACCESSORY_SLOTS_BY_ID) as AccessorySlot[]).filter(
                    (sl) => skin.acc?.[sl] && sl !== accSlot,
                  ) as AccessorySlot[]),
                ])
                  .filter((sl, i, arr) => arr.indexOf(sl) === i)
                  .map((sl) => {
                    const cur = accTint(skin, sl);
                    const pool = SLOT_COLORS[sl] ?? [];
                    return (
                      <div key={sl} className="flex items-center gap-1.5">
                        <span className="w-12 shrink-0 text-[10px] uppercase tracking-wider text-white/40">
                          {ACCESSORY_SLOTS_BY_ID[sl]}
                        </span>
                        {pool.map((c) => (
                          <button
                            key={c}
                            onClick={() => setSkin((s) => ({ ...s, accColors: { ...(s.accColors ?? {}), [sl]: c } }))}
                            className={cn(
                              "size-4 rounded-full border transition-transform hover:scale-110",
                              cur === c ? "border-white ring-2 ring-amber-300" : "border-white/20",
                            )}
                            style={{ backgroundColor: c }}
                            aria-label={`${ACCESSORY_SLOTS_BY_ID[sl]} color ${c}`}
                          />
                        ))}
                        {/* clear the per-slot override (falls back to shared tint) */}
                        <button
                          onClick={() =>
                            setSkin((s) => {
                              const next = { ...(s.accColors ?? {}) };
                              delete next[sl];
                              return { ...s, accColors: next };
                            })
                          }
                          className="text-[10px] text-white/35 hover:text-white/70"
                          aria-label="Reset slot color"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                {/* shared tint for items without their own override */}
                <div className="flex items-center gap-1.5">
                  <span className="w-12 shrink-0 text-[10px] uppercase tracking-wider text-white/40">Shared</span>
                  {SHARED_ACC_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setSkin((s) => ({ ...s, accColor: c }))}
                      className={cn(
                        "size-4 rounded-full border transition-transform hover:scale-110",
                        (skin.accColor ?? "#d95f5f") === c ? "border-white ring-2 ring-amber-300" : "border-white/20",
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Accessory color ${c}`}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* active morph strip (§22): the look stays until removed */}
            {skin.morph && morphById(skin.morph) && (
              <div className="mt-3 flex w-full max-w-xs items-center justify-between rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-1.5">
                <span className="text-[11px] font-semibold text-amber-200">
                  Morph: {morphById(skin.morph)!.name}
                </span>
                <button
                  onClick={() => setSkin((s) => stripPresetAndMorph(s))}
                  className="text-[10px] font-bold uppercase tracking-wider text-white/60 hover:text-white"
                >
                  Remove morph
                </button>
              </div>
            )}
            {/* §27: large live character preview + §28 USE PRESET action */}
            {category === "warriors" && charPreview && presetById(charPreview) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 w-full max-w-xs rounded-xl border border-white/10 bg-black/40 p-2.5 text-center"
              >
                <p className="text-xs font-bold text-white">{presetById(charPreview)!.displayName}</p>
                <p className="text-[10px] uppercase tracking-wider text-white/40">
                  {PRESET_GROUPS.find((g) => g.id === presetById(charPreview)!.group)?.name}
                  {presetById(charPreview)!.clan ? ` · ${presetById(charPreview)!.clan}` : ""}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-white/60">{presetById(charPreview)!.blurb}</p>
                <Button
                  size="sm"
                  className="mt-2 h-7 rounded-lg bg-amber-400 px-3 text-[11px] font-bold text-[#0d160d] hover:bg-amber-300"
                  onClick={() => {
                    // §28/§29: applying is a PREVIEW-state change — nothing is
                    // saved until SAVE CAT, and everything stays editable.
                    setSkin((s) => applyPreset(s, charPreview));
                    setCharPreview(null);
                  }}
                >
                  <Sparkles className="mr-1 inline size-3" /> Use preset
                </Button>
              </motion.div>
            )}
          </div>

          {/* RIGHT: item grid (full-width below the preview on narrow windows,
              side panel on desktop; always scrolls internally) */}
          <div className="flex min-h-[260px] w-full flex-1 flex-col border-t border-white/10 md:min-h-0 md:w-[360px] md:flex-none md:border-l md:border-t-0 lg:w-[400px]">
            <div className="border-b border-white/10 px-3 py-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                {query
                  ? `Results for "${query}"`
                  : (activeNav?.name ?? CATEGORIES.find((c) => c.id === category)?.name ?? "Items")}
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
            {/* --- MORPHS view (§22-23): every morph renders live on the cat --- */}
            {/* §5: never a silently blank panel — a failed view or an absent
                catalog says so, with a Retry, instead of showing nothing. */}
            {viewError ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <AlertTriangle className="size-5 text-amber-300" />
                <p className="text-xs font-semibold text-white">The item list could not be built.</p>
                <p className="max-w-[240px] break-words text-[10px] text-white/50">{viewError}</p>
                <Button
                  size="sm"
                  onClick={() => setRetryTick((t) => t + 1)}
                  className="h-7 rounded-lg bg-amber-400 px-3 text-[11px] font-bold text-[#0d160d] hover:bg-amber-300"
                >
                  <RefreshCw className="size-3" /> Retry
                </Button>
              </div>
            ) : catalogEmpty ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                <PawPrint className="size-5 text-white/40" />
                <p className="text-xs font-semibold text-white">No items are available.</p>
                <p className="max-w-[240px] text-[10px] text-white/50">
                  The customization catalog loaded empty — this is not a search result. Reload the editor to try again.
                </p>
                <Button
                  size="sm"
                  onClick={() => setRetryTick((t) => t + 1)}
                  className="h-7 rounded-lg bg-amber-400 px-3 text-[11px] font-bold text-[#0d160d] hover:bg-amber-300"
                >
                  <RefreshCw className="size-3" /> Retry
                </Button>
              </div>
            ) : category === "morphs" ? (
              <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3 max-[420px]:grid-cols-2 md:grid-cols-3">
                {CAT_MORPHS.length === 0 && (
                  <p className="col-span-full py-8 text-center text-xs text-white/40">No morphs are available.</p>
                )}
                {CAT_MORPHS.map((m) => {
                  const on = skin.morph === m.id;
                  const previewSkin: CustomSkin = { ...skin, ...m.skin, morph: m.id };
                  return (
                    <motion.button
                      key={m.id}
                      layout
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSkin((s) => (on ? stripPresetAndMorph(s) : applyMorph(s, m.id)))}
                      className={cn(
                        "rounded-xl border p-1.5 text-left transition-colors",
                        on
                          ? "border-amber-400/70 bg-amber-400/15 ring-1 ring-amber-300/50"
                          : "border-white/10 bg-black/30 hover:border-white/30 hover:bg-white/10",
                      )}
                    >
                      <div className="flex items-center justify-center rounded-lg bg-gradient-to-b from-emerald-900/30 to-black/10">
                        <PresetThumb skin={previewSkin} size={72} pose="sit" id={`editor:morph:${m.id}`} />
                      </div>
                      <p className={cn("mt-1 truncate px-0.5 text-[10px] font-medium", on ? "text-amber-200" : "text-white/70")}>
                        {m.name}
                      </p>
                      <p className="truncate px-0.5 text-[9px] text-white/40">{m.desc}</p>
                    </motion.button>
                  );
                })}
              </div>
            ) : category === "warriors" ? (
            /* --- WARRIORS CHARACTER PRESETS library (§24-§27) --- */
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="space-y-1.5 border-b border-white/10 px-3 py-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-white/40" />
                  <Input
                    value={charQuery}
                    onChange={(e) => setCharQuery(e.target.value)}
                    placeholder="Search characters… (Firestar, tabby, leader)"
                    className="h-7 border-white/15 bg-black/40 pl-8 text-xs text-white placeholder:text-white/30"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setCharGroup("all")}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                      charGroup === "all" ? "bg-amber-400/25 text-amber-200 ring-1 ring-amber-300/40" : "bg-white/5 text-white/50 hover:bg-white/10",
                    )}
                  >
                    All
                  </button>
                  {PRESET_GROUPS.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setCharGroup(g.id)}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                        charGroup === g.id ? "bg-amber-400/25 text-amber-200 ring-1 ring-amber-300/40" : "bg-white/5 text-white/50 hover:bg-white/10",
                      )}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3 md:grid-cols-3">
                {charList.map((p) => {
                  const previewSkin: CustomSkin = { ...skin, ...p.skin, presetId: p.id, morph: undefined };
                  return (
                    <motion.button
                      key={p.id}
                      layout
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setCharPreview(p.id)}
                      className={cn(
                        "rounded-xl border p-1.5 text-left transition-colors",
                        charPreview === p.id
                          ? "border-amber-400/70 bg-amber-400/15 ring-1 ring-amber-300/50"
                          : "border-white/10 bg-black/30 hover:border-white/30 hover:bg-white/10",
                      )}
                    >
                      <div className="flex items-center justify-center rounded-lg bg-gradient-to-b from-emerald-900/30 to-black/10">
                        <PresetThumb skin={previewSkin} size={72} pose="sit" id={`editor:char:${p.id}`} />
                      </div>
                      <p className="mt-1 truncate px-0.5 text-[10px] font-medium text-white/80">{p.displayName}</p>
                      <p className="truncate px-0.5 text-[9px] text-white/40">
                        {PRESET_GROUPS.find((g) => g.id === p.group)?.name}
                      </p>
                    </motion.button>
                  );
                })}
                {charList.length === 0 && (
                  <p className="col-span-full py-8 text-center text-xs text-white/40">No characters match that search.</p>
                )}
              </div>
            </div>
            ) : (
            <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3 max-[420px]:grid-cols-2 md:grid-cols-3">
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
                      const next = { ...skin };
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
                      <ItemCardPreview item={item} baseSkin={skin} tint={skin.accColor ?? "#d95f5f"} />
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
                  {query.trim()
                    ? `No items match "${query.trim()}". Clear the search to see the catalog again.`
                    : category === "favorites"
                      ? "No favorites yet — tap the heart on any item."
                      : `No items are available in ${activeNav?.name ?? "this category"}.`}
                </p>
              )}
            </div>
            )}
          </div>
        </div>

        {/* ---------- PRESETS STRIP (wraps + scrolls internally; never pushes
            the bottom bar off-screen) ---------- */}
        <div className="max-h-[130px] shrink-0 overflow-y-auto border-t border-white/10 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
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
                  <PresetThumb skin={p.skin} id={`editor:preset:${idx}`} />
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

        {/* ---------- BOTTOM BAR (always visible — Randomize / Reset / Save
            can never scroll away) ---------- */}
        {/* a failed save is loud on EVERY screen size (the status line above is
            desktop-only): the player must never have to guess why the button
            went back to "Save Cat" */}
        {(saveState === "failed" || notice) && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 border-t border-red-400/40 bg-red-500/15
              pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] py-1.5"
          >
            <p className="text-[11px] font-semibold text-red-200">
              <AlertTriangle className="mr-1 inline size-3.5 align-[-2px]" />
              {saveState === "failed"
                ? `Save failed: ${saveError ?? "your cat was not saved"}. Your changes are still here.`
                : notice}
            </p>
            {saveState === "failed" ? (
              <Button
                size="sm"
                className="h-7 rounded-lg bg-red-400 px-3 text-[11px] font-bold text-[#0d160d] hover:bg-red-300"
                onClick={confirmSave}
              >
                Retry save
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 rounded-lg px-2 text-[11px] text-white/70 hover:text-white" onClick={() => setNotice(null)}>
                Dismiss
              </Button>
            )}
          </div>
        )}
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10
            pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5"
        >
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-xl border-white/20 bg-black/30 text-xs text-white hover:bg-white/10"
              onClick={() => setSkin({ ...savedNorm })}
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
          {/* §15: a real status line — never a fake "saved" message */}
          <p
            className={cn(
              "hidden text-[10px] md:block",
              saveState === "failed" ? "text-red-300" : saveState === "saved" ? "text-emerald-300" : "text-white/40",
            )}
            aria-live="polite"
          >
            {loading
              ? "Loading character…"
              : saveState === "failed"
                ? `Save failed: ${saveError ?? "your cat was not saved"} — your changes are still here, press Retry.`
                : saveState === "saving"
                  ? "Saving…"
                  : saveState === "saved"
                    ? "Saved successfully"
                    : dirty
                      ? "Unsaved changes — press SAVE CAT to keep them."
                      : "Saved cat"}
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
              disabled={saveState === "saving" || loading}
              onClick={confirmSave}
            >
              <Save className="size-3.5" />
              {loading ? "Loading…" : saveState === "saving" ? "Saving…" : saveState === "failed" ? "Retry save" : "Save Cat"}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// WarriorCatsRPG — shared map rendering for the minimap and the full world
// map overlay. All positions are tile coordinates straight from world.ts,
// so the map can never drift out of sync with the playable world.
//
// LOD minimap: the WHOLE world is always visible as a readable overview,
// while a circular "detail lens" around the player's cat magnifies the real
// map content (trees, trails, houses, dens, streams). The lens glides after
// the cat with a frame-rate-independent ease (no snapping, no jitter), and
// everything outside the lens stays a calm whole-map overview.

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trees, flora, allObjects } from "@/game/world";

export type SpotKind = "camp" | "landmark" | "twoleg" | "neutral";

export interface MapSpot {
  id: string;
  x: number; // tiles
  y: number; // tiles
  label: string;
  kind: SpotKind;
  info: string;
}

/** Every marked location actually exists in the playable world. */
export const MAP_SPOTS: MapSpot[] = [
  // Clan camps
  { id: "camp", x: 89, y: 86, label: "ThunderClan Camp", kind: "camp", info: "Home of the brave. Highrock, the gorse tunnel, and the fresh-kill pile." },
  { id: "windclan-camp", x: 20, y: 84, label: "WindClan Camp", kind: "camp", info: "A shallow scoop in the open moor, ringed with gorse." },
  { id: "riverclan-camp", x: 170, y: 96, label: "RiverClan Camp", kind: "camp", info: "A gravel hollow behind the reed beds, rich with fish." },
  { id: "shadowclan-camp", x: 96, y: 20, label: "ShadowClan Camp", kind: "camp", info: "A gloomy hollow among the cold pines." },
  // ThunderClan landmarks
  { id: "sunningrocks", x: 55, y: 78, label: "Sunningrocks", kind: "landmark", info: "Warm granite slabs by the river — claimed by RiverClan." },
  { id: "sandy", x: 79, y: 118, label: "Sandy Hollow", kind: "landmark", info: "Where apprentices train to fight." },
  { id: "fourtrees", x: 67, y: 129, label: "Fourtrees", kind: "neutral", info: "Four great oaks where all Clans meet in truce on the full moon." },
  { id: "owltree", x: 104, y: 83, label: "The Owl Tree", kind: "landmark", info: "A hollow oak where a wild owl nests." },
  { id: "snakerocks", x: 114, y: 52, label: "Snakerocks", kind: "landmark", info: "Prey-rich boulders — and adders." },
  { id: "sycamore", x: 68, y: 80, label: "Great Sycamore", kind: "landmark", info: "A towering sycamore overlooking the river." },
  { id: "tallpines", x: 75, y: 112, label: "Tallpines", kind: "landmark", info: "Bare pine forest beside Twolegplace." },
  { id: "thunderpath", x: 90, y: 44, label: "The Thunderpath", kind: "neutral", info: "The black road of monsters, bordering ShadowClan." },
  { id: "highstones", x: 26, y: 43, label: "Highstones", kind: "neutral", info: "Bare stone hills. Mothermouth holds the Moonstone." },
  { id: "marsh", x: 125, y: 20, label: "The Marshes", kind: "landmark", info: "Frog-rich wetlands in ShadowClan territory." },
  { id: "moor", x: 10, y: 110, label: "The Moor", kind: "landmark", info: "Wide open grassland — WindClan hunting ground." },
  // Twoleg areas
  { id: "twolegplace", x: 75, y: 146, label: "Twolegplace", kind: "twoleg", info: "The kittypet neighborhood where Rusty and Smudge live." },
  { id: "farm", x: 124, y: 154, label: "The Farm", kind: "twoleg", info: "A red barn full of hay — and plentiful barn mice." },
  // Unclaimed wilds (world expansion) — neutral land on BOTH sides of Clan territory
  { id: "east-pond", x: 213, y: 162, label: "Reed Pond", kind: "landmark", info: "A reed-fringed pond in the unclaimed wilds east of RiverClan." },
  { id: "mossy-hollow", x: 208, y: 69, label: "Mossy Hollow", kind: "landmark", info: "A fern-draped dip between old oaks in the eastern wilds." },
  { id: "west-wilds", x: 8, y: 30, label: "Western Wilds", kind: "neutral", info: "Quiet hills and streams north of WindClan's moor — no Clan hunts here." },
  { id: "south-wilds", x: 118, y: 200, label: "Southern Wilds", kind: "neutral", info: "Abandoned fields and whispering woods below Twolegplace." },
];

/** Territory shading + border lines in world tiles (x, y, w, h). */
export const TERRITORIES: { id: string; name: string; color: string; rect: [number, number, number, number] }[] = [
  { id: "windclan", name: "WindClan", color: "#88b15c", rect: [0, 40, 48, 180] },
  { id: "shadowclan", name: "ShadowClan", color: "#356840", rect: [46, 0, 100, 40] },
  { id: "riverclan", name: "RiverClan", color: "#3d6f9e", rect: [152, 40, 40, 180] },
  { id: "thunderclan", name: "ThunderClan", color: "#4a8a4c", rect: [48, 40, 104, 88] },
  // Unclaimed land on BOTH sides — clearly distinct from Clan territory
  { id: "wilds", name: "Unclaimed Wilds", color: "#55684f", rect: [192, 0, 48, 220] },
  { id: "wilds-north", name: "Unclaimed Wilds", color: "#55684f", rect: [0, 0, 240, 40] },
  { id: "wilds-south", name: "Unclaimed Wilds", color: "#55684f", rect: [48, 176, 144, 44] },
];

const KIND_COLORS: Record<SpotKind, string> = {
  camp: "#f0b429",
  landmark: "#e8dfc0",
  neutral: "#c0b8e0",
  twoleg: "#d98a5a",
};

const KIND_LEGEND: { kind: SpotKind; label: string }[] = [
  { kind: "camp", label: "Clan Camp" },
  { kind: "landmark", label: "Landmark" },
  { kind: "neutral", label: "Neutral Ground" },
  { kind: "twoleg", label: "Twoleg Place" },
];

export interface MapPlayer {
  x: number;
  y: number;
  facing: 1 | -1;
  clan?: string;
}

/** Local detail: precomputed once — trees, flora, solid objects. */
const LOCAL_TREES = trees.map((tr) => ({ x: tr.x / 32, y: tr.y / 32, pine: tr.pine }));
const LOCAL_FLORA = flora.map((f) => ({ x: f.x / 32, y: f.y / 32 }));
const LOCAL_HOUSES = allObjects
  .filter((o) => o.style === "house" || o.style === "barn" || o.style === "cave")
  .map((o) => ({ x: o.x / 32, y: o.y / 32, w: o.w / 32, h: o.h / 32, door: !!o.interior }));
const LOCAL_DENS = allObjects
  .filter((o) => o.interior && o.style !== "house" && o.style !== "barn" && o.style !== "cave")
  .map((o) => ({ x: o.x / 32, y: o.y / 32 }));

/**
 * The minimap canvas: whole-world overview + a smooth local detail lens.
 * The lens center eases toward the player's position each render (exponential
 * smoothing), so walking produces a glide instead of a jump.
 */
export function WorldMapCanvas({
  px,
  py,
  facing,
  playerClan,
  discovered,
  waypoint,
  onPickSpot,
  remotePlayers,
  size = 116,
  lens = true,
  className,
}: {
  px: number;
  py: number;
  facing: 1 | -1;
  playerClan?: string;
  discovered?: string[];
  waypoint?: string | null;
  onPickSpot?: (spot: MapSpot | null) => void;
  remotePlayers?: { x: number; y: number }[];
  size?: number;
  /** enable the local detail lens (minimap: yes, full map: no) */
  lens?: boolean;
  className?: string;
}) {
  const [lensX, setLensX] = useState(px / 32);
  const [lensY, setLensY] = useState(py / 32);
  // ease the lens toward the player each render — frame-rate independent
  // (caller re-renders at ~10Hz while moving; the ease is stable either way)
  const targetX = px / 32;
  const targetY = py / 32;
  const k = 0.22;
  const nextX = lensX + (targetX - lensX) * k;
  const nextY = lensY + (targetY - lensY) * k;
  if (Math.abs(nextX - lensX) > 0.01 || Math.abs(nextY - lensY) > 0.01) {
    // schedule, don't render-loop
    queueMicrotask(() => {
      setLensX(nextX);
      setLensY(nextY);
    });
  }
  const lx = Math.max(0, Math.min(240, nextX));
  const ly = Math.max(0, Math.min(220, nextY));

  // All coordinates are tiles of the real 240x220 world.
  const tx = (v: number) => (v / 240) * size;
  const ty = (v: number) => (v / 220) * size;
  const aspect = 220 / 240;
  // lens radius in tiles -> svg units (whole map is 240 wide)
  const lensR = lens ? 26 : 0;

  const myTerritory = TERRITORIES.find((t) => {
    const [x, y, w, h] = t.rect;
    return targetX >= x && targetX < x + w && targetY >= y && targetY < y + h;
  });

  // local detail content clipped to the lens (tile coords = svg units here)
  const localTrees = LOCAL_TREES.filter((tr) => Math.hypot(tr.x - lx, tr.y - ly) < lensR + 3);
  const localFlora = LOCAL_FLORA.filter((f) => Math.hypot(f.x - lx, f.y - ly) < lensR + 1);
  const localHouses = LOCAL_HOUSES.filter((h) => Math.hypot(h.x - lx, h.y - ly) < lensR + 4);
  const localDens = LOCAL_DENS.filter((d) => Math.hypot(d.x - lx, d.y - ly) < lensR + 2);

  const lensId = `lens-${size}`;

  return (
    <div className={cn("relative select-none", className)} style={{ width: size, height: size * aspect }}>
      <svg
        viewBox="0 0 240 220"
        className="h-full w-full rounded-lg bg-[#33532e]"
        onClick={() => onPickSpot?.(null)}
      >
        <defs>
          <linearGradient id="riverGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d6f9e" />
            <stop offset="100%" stopColor="#2d5a84" />
          </linearGradient>
          <clipPath id={lensId}>
            <circle cx={lx} cy={ly} r={lensR} />
          </clipPath>
        </defs>

        {/* ---- WHOLE-MAP OVERVIEW (always visible) ---- */}
        {/* territory shading: Clan ground in Clan colors, wilds in muted gray-green */}
        {TERRITORIES.map((t) => (
          <rect
            key={t.id}
            x={t.rect[0]}
            y={t.rect[1]}
            width={t.rect[2]}
            height={t.rect[3]}
            fill={t.color}
            opacity={t.id.startsWith("wilds") ? 0.38 : 0.32}
          />
        ))}
        {/* rivers */}
        <rect x={0} y={68} width={4} height={108} fill="url(#riverGrad)" />
        <rect x={144} y={48} width={8} height={128} fill="url(#riverGrad)" />
        {/* Thunderpath */}
        <rect x={0} y={42} width={240} height={4} fill="#3a3d42" />
        {/* pines / moor / reed textures */}
        <rect x={46} y={0} width={100} height={40} fill="#234024" opacity={0.55} />
        <rect x={108} y={6} width={34} height={30} fill="#3c5a44" opacity={0.5} />
        <rect x={152} y={40} width={40} height={136} fill="#5c7d4a" opacity={0.35} />
        {/* camp clearings */}
        <circle cx={89} cy={86} r={12.5} fill="#cbb27e" opacity={0.85} />
        <circle cx={20} cy={84} r={8} fill="#cbb27e" opacity={0.75} />
        <circle cx={170} cy={96} r={8} fill="#cbb27e" opacity={0.75} />
        <circle cx={96} cy={20} r={8} fill="#cbb27e" opacity={0.75} />
        {/* territory border lines */}
        <line x1={48} y1={0} x2={48} y2={220} stroke="#f5efdd" strokeWidth={0.5} strokeDasharray="3 2.5" opacity={0.35} />
        <line x1={0} y1={40} x2={240} y2={40} stroke="#f5efdd" strokeWidth={0.5} strokeDasharray="3 2.5" opacity={0.35} />
        <line x1={152} y1={40} x2={152} y2={220} stroke="#f5efdd" strokeWidth={0.5} strokeDasharray="3 2.5" opacity={0.35} />
        <line x1={0} y1={176} x2={240} y2={176} stroke="#f5efdd" strokeWidth={0.5} strokeDasharray="3 2.5" opacity={0.28} />
        {/* wilds hatch: subtle diagonal texture so neutral land reads as such */}
        <pattern id="wildsHatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="4" stroke="#2c3a29" strokeWidth="1" opacity={0.35} />
        </pattern>
        {TERRITORIES.filter((t) => t.id.startsWith("wilds")).map((t) => (
          <rect key={t.id + "-hatch"} x={t.rect[0]} y={t.rect[1]} width={t.rect[2]} height={t.rect[3]} fill="url(#wildsHatch)" />
        ))}

        {/* ---- LOCAL DETAIL LENS (smoothly follows the cat) ---- */}
        {lens && (
          <g clipPath={`url(#${lensId})`}>
            {/* brighter local ground */}
            <circle cx={lx} cy={ly} r={lensR} fill="#4d7a45" opacity={0.55} />
            {/* flora specks */}
            {localFlora.map((f, i) => (
              <circle key={"f" + i} cx={f.x} cy={f.y} r={0.5} fill="#6fae5c" opacity={0.7} />
            ))}
            {/* individual trees */}
            {localTrees.map((tr, i) => (
              <circle
                key={"t" + i}
                cx={tr.x}
                cy={tr.y}
                r={tr.pine ? 1.1 : 1.3}
                fill={tr.pine ? "#2c5531" : "#3b7a3f"}
                stroke="#1e3a22"
                strokeWidth={0.25}
              />
            ))}
            {/* houses / barns / caves with doors */}
            {localHouses.map((h, i) => (
              <g key={"h" + i}>
                <rect x={h.x - h.w / 2} y={h.y - h.h / 2} width={h.w} height={h.h} rx={0.5} fill="#a3866a" stroke="#5c4632" strokeWidth={0.3} />
                <rect x={h.x - h.w / 2} y={h.y - h.h / 2} width={h.w} height={h.h * 0.42} rx={0.4} fill="#7a5a44" />
                {h.door && <rect x={h.x - 0.45} y={h.y + h.h / 2 - 0.7} width={0.9} height={0.7} fill="#21160e" />}
              </g>
            ))}
            {/* den entrances */}
            {localDens.map((d, i) => (
              <circle key={"d" + i} cx={d.x} cy={d.y} r={0.9} fill="#2a1c10" stroke="#8a6a3a" strokeWidth={0.25} />
            ))}
            {/* local spot labels (camps only, small) */}
            {MAP_SPOTS.filter((s) => s.kind === "camp" && Math.hypot(s.x - lx, s.y - ly) < lensR).map((s) => (
              <text key={"l" + s.id} x={s.x} y={s.y - 4} fontSize={3.4} textAnchor="middle" fill="rgba(255,255,255,0.95)" fontWeight={700}>
                {s.label.replace(" Camp", "")}
              </text>
            ))}
          </g>
        )}
        {/* lens ring */}
        {lens && (
          <circle cx={lx} cy={ly} r={lensR} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={0.8} />
        )}

        {/* spots (whole map) */}
        {MAP_SPOTS.map((s) => {
          const found = !discovered || discovered.includes(s.id);
          const isWaypoint = waypoint === s.id;
          const inLens = lens && Math.hypot(s.x - lx, s.y - ly) < lensR;
          if (inLens && s.kind !== "camp") return null; // lens shows real detail instead
          return (
            <g key={s.id} onClick={(e) => { e.stopPropagation(); onPickSpot?.(s); }} className="cursor-pointer">
              {isWaypoint && <circle cx={s.x} cy={s.y} r={5.4} fill="none" stroke="#7dd3fc" strokeWidth={1.2} />}
              <circle
                cx={s.x}
                cy={s.y}
                r={s.kind === "camp" ? 3.6 : 2.6}
                fill={found ? KIND_COLORS[s.kind] : "rgba(255,255,255,0.28)"}
                stroke={s.kind === "camp" ? "#5b3d0e" : "rgba(0,0,0,0.35)"}
                strokeWidth={s.kind === "camp" ? 1 : 0.6}
              />
              {s.kind === "camp" && <text x={s.x} y={s.y - 5.5} fontSize={4.6} textAnchor="middle" fill="rgba(255,255,255,0.92)" fontWeight={700}>{s.label.replace(" Camp", "")}</text>}
            </g>
          );
        })}
        {/* remote players */}
        {remotePlayers?.map((r, i) => (
          <circle key={i} cx={r.x / 32} cy={r.y / 32} r={2.2} fill="#8ab4ff" stroke="#1d3a6e" strokeWidth={0.6} />
        ))}
        {/* the player: clan-colored arrow showing facing */}
        <g transform={`translate(${px / 32}, ${py / 32})`}>
          <circle r={4.6} fill={playerClan ? TERRITORIES.find((t) => t.id === playerClan)?.color ?? "#e05d2a" : "#e05d2a"} opacity={0.35} />
          {facing >= 0 ? (
            <polygon points="0,-3.4 2.6,2.4 -2.6,2.4" fill="#ffffff" stroke="#1c1c1c" strokeWidth={0.5} />
          ) : (
            <polygon points="0,-3.4 -2.6,2.4 2.6,2.4" fill="#ffffff" stroke="#1c1c1c" strokeWidth={0.5} transform="scale(-1,1)" />
          )}
        </g>
      </svg>
      {myTerritory && (
        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/85">
          {myTerritory.id.startsWith("wilds") ? "Unclaimed Wilds" : `${myTerritory.name} territory`}
        </div>
      )}
    </div>
  );
}

/** Legend strip shared by minimap + full map. */
export function MapLegend({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1", compact ? "text-[9px]" : "text-[11px]")}>
      {KIND_LEGEND.map((l) => (
        <span key={l.kind} className="flex items-center gap-1 text-white/60">
          <span className="size-1.5 rounded-full" style={{ backgroundColor: KIND_COLORS[l.kind] }} />
          {l.label}
        </span>
      ))}
      <span className="flex items-center gap-1 text-white/60">
        <span className="inline-block h-1.5 w-1.5 rounded-[2px] bg-[#55684f]" /> Unclaimed
      </span>
      <span className="flex items-center gap-1 text-white/60">
        <span className="inline-block h-px w-3 border-t border-dashed border-white/50" /> Border
      </span>
    </div>
  );
}

/** Full-screen world map overlay with waypoint selection. */
export function WorldMapOverlay({
  onClose,
  px,
  py,
  facing,
  playerClan,
  discovered,
  remotePlayers,
  waypoint,
  onSetWaypoint,
}: {
  onClose: () => void;
  px: number;
  py: number;
  facing: 1 | -1;
  playerClan?: string;
  discovered: string[];
  remotePlayers?: { x: number; y: number }[];
  waypoint?: string | null;
  onSetWaypoint?: (id: string | null) => void;
}) {
  const [selected, setSelected] = useState<MapSpot | null>(null);
  const [innerWaypoint, setInnerWaypoint] = useState<string | null>(null);
  const wp = waypoint !== undefined ? waypoint : innerWaypoint;
  const setWp = onSetWaypoint ?? setInnerWaypoint;
  const dist = selected ? Math.round(Math.hypot(selected.x - px / 32, selected.y - py / 32)) : null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#121c12]/95 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-amber-300">Territory Map</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="size-7 rounded-full text-white/80 hover:text-white">
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative mx-auto w-full max-w-[420px]">
            <WorldMapCanvas
              px={px}
              py={py}
              facing={facing}
              playerClan={playerClan}
              discovered={discovered}
              waypoint={wp}
              onPickSpot={setSelected}
              remotePlayers={remotePlayers}
              size={420}
              lens={false}
              className="mx-auto"
            />
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-56">
            {selected ? (
              <div className="rounded-xl border border-white/15 bg-black/40 p-3">
                <p className="text-sm font-bold text-white">{selected.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-white/60">{selected.info}</p>
                {dist !== null && <p className="mt-1.5 text-[11px] font-semibold text-amber-300">{dist} tiles away</p>}
                <Button
                  size="sm"
                  className="mt-2 w-full rounded-lg bg-amber-400 text-[#0d160d] hover:bg-amber-300"
                  onClick={() => setWp(wp === selected.id ? null : selected.id)}
                >
                  {wp === selected.id ? "Clear waypoint" : "Set waypoint"}
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] text-white/50">
                Tap any marker for details and a waypoint. Muted hatched ground is unclaimed wilderness — free for any cat to travel.
              </div>
            )}
            <div className="rounded-xl border border-white/10 bg-black/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Legend</p>
              <div className="mt-1.5"><MapLegend /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

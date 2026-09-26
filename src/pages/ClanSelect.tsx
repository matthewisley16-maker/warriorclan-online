// WarriorCatsRPG — Clan selection: four Into the Wild Clans with themed
// environment previews. Used at session start and from Cat & Clan settings.

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CatPortrait } from "./MainMenu";
import type { CatSkin } from "@/game/draw";
import { cn } from "@/lib/utils";

export interface ClanOption {
  id: string;
  name: string;
  env: string;
  desc: string;
  color: string;
  /** preview background gradient (top, bottom) */
  bg: [string, string];
  /** small decorative silhouettes drawn as emoji-free canvas shapes */
  motif: "tree" | "water" | "moor" | "pine" | "house";
}

export const CLAN_OPTIONS: ClanOption[] = [
  {
    id: "thunderclan",
    name: "ThunderClan",
    env: "Deep oak and beech forest",
    desc: "Brave and loyal. Warriors of the dense forest, sheltered by brambles and gorse.",
    color: "#4a8a4c",
    bg: ["#20401f", "#3a5a30"],
    motif: "tree",
  },
  {
    id: "riverclan",
    name: "RiverClan",
    env: "Riverbanks and reed beds",
    desc: "Sleek and strong swimmers. Fishers of the broad river, at home in the water.",
    color: "#3d6f9e",
    bg: ["#16324a", "#2a5a7a"],
    motif: "water",
  },
  {
    id: "windclan",
    name: "WindClan",
    env: "Open moorland",
    desc: "Swift runners of the open moor. Wide skies, wind-swept grass, no place to hide.",
    color: "#88b15c",
    bg: ["#5a6a2e", "#8aa04c"],
    motif: "moor",
  },
  {
    id: "shadowclan",
    name: "ShadowClan",
    env: "Dense pine and marsh",
    desc: "Proud night hunters. Cold pines, damp bogs, and shadows that swallow intruders.",
    color: "#356840",
    bg: ["#101d16", "#22352a"],
    motif: "pine",
  },
];

/** Extra starting identity: live as a kittypet in Twolegplace (where Rusty began). */
export const KITTYPET_OPTION: ClanOption = {
  id: "kittypet",
  name: "Kittypet",
  env: "Twolegplace neighborhood",
  desc: "Start where Rusty started — a soft pellet-fed life beside Smudge, with the forest calling from beyond the fence.",
  color: "#b8895a",
  bg: ["#4a3a2c", "#7a6248"],
  motif: "house",
};

/** Themed environment strip behind the cat preview. */
function ClanBackdrop({ motif, bg }: { motif: ClanOption["motif"]; bg: [string, string] }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-xl"
      style={{ background: `linear-gradient(to bottom, ${bg[0]}, ${bg[1]})` }}
    >
      {motif === "tree" && (
        <>
          <div className="absolute bottom-0 left-2 h-24 w-10 rounded-t-full bg-[#2c5230]/90" />
          <div className="absolute bottom-0 right-4 h-32 w-12 rounded-t-full bg-[#264a2b]/90" />
          <div className="absolute bottom-0 left-14 h-16 w-8 rounded-t-full bg-[#315a35]/80" />
        </>
      )}
      {motif === "water" && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[#3d6f9e]/80" />
          <div className="absolute bottom-6 left-3 h-16 w-1.5 rounded-full bg-[#4a7a52]/90" />
          <div className="absolute bottom-6 left-8 h-20 w-1.5 rounded-full bg-[#4a7a52]/90" />
          <div className="absolute bottom-6 right-6 h-16 w-1.5 rounded-full bg-[#4a7a52]/90" />
        </>
      )}
      {motif === "moor" && (
        <>
          <div className="absolute bottom-0 h-10 w-full bg-[#7a9448]/70" />
          <div className="absolute bottom-0 left-6 h-16 w-20 rounded-t-full bg-[#8aa455]/80" />
          <div className="absolute bottom-0 right-8 h-12 w-24 rounded-t-full bg-[#7a9448]/80" />
        </>
      )}
      {motif === "pine" && (
        <>
          <div className="absolute bottom-0 left-1 h-28 w-12 bg-[#1c2f22]/95 [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
          <div className="absolute bottom-0 right-2 h-36 w-14 bg-[#16261c]/95 [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
          <div className="absolute bottom-0 left-16 h-20 w-10 bg-[#1f3427]/90 [clip-path:polygon(50%_0,100%_100%,0_100%)]" />
        </>
      )}
      {motif === "house" && (
        <>
          <div className="absolute bottom-8 left-4 h-16 w-24 bg-[#8a705a]/90 [clip-path:polygon(0_30%,50%_0,100%_30%,100%_100%,0_100%)]" />
          <div className="absolute bottom-8 right-6 h-12 w-16 bg-[#7a6248]/90 [clip-path:polygon(0_30%,50%_0,100%_30%,100%_100%,0_100%)]" />
          <div className="absolute bottom-0 h-8 w-full bg-[#9a9a94]/80" />
          <div className="absolute bottom-10 left-12 h-3 w-3 bg-[#ffe9a8]/90" />
        </>
      )}
      {/* ground shadow line */}
      <div className="absolute inset-x-0 bottom-0 h-6 bg-black/25" />
    </div>
  );
}

export function ClanSelect({
  skin,
  currentClan,
  onConfirm,
  onCancel,
  embedded,
  showKittypet = true,
}: {
  skin: CatSkin;
  /** clan the player currently belongs to (pre-highlighted) */
  currentClan?: string;
  onConfirm: (clanId: string) => void;
  onCancel?: () => void;
  /** true when opened from inside the game's Cat & Clan menu */
  embedded?: boolean;
  /** offer the Kittypet/Twolegplace starting life (default true) */
  showKittypet?: boolean;
}) {
  const options = showKittypet ? [...CLAN_OPTIONS, KITTYPET_OPTION] : CLAN_OPTIONS;
  const [selected, setSelected] = useState<string | null>(currentClan ?? null);
  const sel = options.find((c) => c.id === selected);

  return (
    <div className={cn("flex flex-col", embedded ? "" : "absolute inset-0 z-50 bg-[#0d160d]/92 backdrop-blur-md")}>
      <div className={cn("mx-auto w-full max-w-4xl", embedded ? "" : "px-4 py-8")}>
        {!embedded && (
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">Choose your Clan</p>
            <h2 className="mt-1.5 text-2xl font-black tracking-tight text-white">
              Where does your cat belong?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
              Your Clan decides where you live, who your Clanmates are, and where you spawn.
              You can change it later from Cat &amp; Clan — your cat stays exactly the same.
            </p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {options.map((c, i) => {
            const active = selected === c.id;
            const isCurrent = currentClan === c.id;
            return (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => setSelected(c.id)}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-2xl border p-3 text-left transition-all",
                  active ? "border-amber-300 bg-white/10 shadow-[0_0_24px_rgba(251,191,36,0.25)]" : "border-white/15 bg-black/40 hover:border-white/40",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="size-3.5 rounded-full ring-2 ring-white/30" style={{ backgroundColor: c.color }} />
                  <p className="text-sm font-extrabold tracking-tight text-white">{c.name}</p>
                  {isCurrent && (
                    <span className="ml-auto rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">{c.env}</p>
                <p className="mt-1.5 flex-1 text-[11px] leading-snug text-white/60">{c.desc}</p>
                {active && (
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
                    <Check className="size-3" /> Selected
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* preview of the player's cat in the selected Clan's environment */}
        <div className="mt-5 flex flex-col items-center gap-4 rounded-2xl border border-white/15 bg-black/40 p-4 sm:flex-row">
          <div className="relative h-36 w-52 overflow-hidden rounded-xl">
            {sel ? (
              <ClanBackdrop motif={sel.motif} bg={sel.bg} />
            ) : (
              <div className="absolute inset-0 rounded-xl bg-[#1a2a1a]" />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <CatPortrait skin={skin} size={150} />
            </div>
          </div>
          <div className="flex-1 text-center sm:text-left">
            {sel ? (
              <>
                <p className="text-lg font-black tracking-tight text-white">{sel.name}</p>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: sel.color }}>
                  {sel.env}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/65">{sel.desc}</p>
                <p className="mt-2 text-[11px] text-white/45">
                  {sel.id === "thunderclan" && "Spawn: the gorse tunnel beside ThunderClan camp."}
                  {sel.id === "riverclan" && "Spawn: the gravel camp behind the reed beds."}
                  {sel.id === "windclan" && "Spawn: the shallow scoop of the moor camp."}
                  {sel.id === "shadowclan" && "Spawn: the pine hollow north of the Thunderpath."}
                  {sel.id === "kittypet" && "Spawn: Rusty's garden on Smudge's street in Twolegplace."}
                </p>
              </>
            ) : (
              <p className="text-sm text-white/50">Select a Clan to preview your cat in its territory.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {onCancel && (
              <Button variant="outline" className="rounded-xl border-white/20 bg-black/40 text-white hover:bg-white/10" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              className="gap-2 rounded-xl bg-amber-400 font-bold text-[#0d160d] hover:bg-amber-300"
              disabled={!sel}
              onClick={() => sel && onConfirm(sel.id)}
            >
              {sel && currentClan === sel.id ? "Keep this Clan" : "Confirm Clan"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

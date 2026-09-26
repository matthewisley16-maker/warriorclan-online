// WarriorCatsRPG — in-game "Cat & Clan" menu: edit the ONE persistent cat's
// appearance and name, and change Clan at any time. Built on the same
// components as the main-menu Character screen.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Palette, Shield, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw } from "lucide-react";
import type { CatSkin } from "@/game/draw";
import { CatPortrait, CHEST_COLORS, Chip, EYE_COLORS, FUR_COLORS, randomCatName, randomSkin, Swatches } from "./MainMenu";
import { ClanSelect, CLAN_OPTIONS } from "./ClanSelect";
import { cn } from "@/lib/utils";

export interface CatClanSave {
  name?: string;
  skin?: CatSkin;
  clan?: string;
}

export function CatClanMenu({
  open,
  player,
  onClose,
  onSave,
}: {
  open: boolean;
  player: {
    name: string;
    clan?: string;
    rank: string;
    xp: number;
    skin: CatSkin;
  };
  onClose: () => void;
  onSave: (v: CatClanSave) => void;
}) {
  const [skin, setSkin] = useState<CatSkin>(player.skin);
  const [name, setName] = useState(player.name);
  const [clanPickerOpen, setClanPickerOpen] = useState(false);

  const nameError =
    name.trim().length === 0
      ? "Your cat needs a name."
      : name.trim().length < 2
        ? "At least 2 characters."
        : name.trim().length > 20
          ? "Keep it under 20 characters."
          : null;

  const nameDirty = name.trim() !== player.name;
  const skinDirty = JSON.stringify(skin) !== JSON.stringify(player.skin);
  const anyDirty = nameDirty || skinDirty;

  const currentClan = CLAN_OPTIONS.find((c) => c.id === (player.clan ?? "thunderclan"));

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-50 overflow-y-auto bg-[#0d160d]/90 backdrop-blur-md"
      >
        {clanPickerOpen ? (
          <div className="mx-auto max-w-4xl px-4 py-8">
            <ClanSelect
              embedded
              skin={skin}
              currentClan={player.clan}
              onCancel={() => setClanPickerOpen(false)}
              onConfirm={(clan) => {
                setClanPickerOpen(false);
                onSave({ clan });
              }}
            />
            <div className="mt-4 text-center">
              <Button variant="ghost" size="sm" onClick={onClose} className="text-white/70 hover:text-white">
                Back to the forest
              </Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-8">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-extrabold uppercase tracking-[0.2em] text-white">Cat &amp; Clan</h1>
              <Button variant="ghost" size="icon" onClick={onClose} className="size-8 rounded-full text-white/80 hover:text-white">
                <X className="size-4" />
              </Button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[240px_1fr]">
              {/* identity + live preview */}
              <div className="flex flex-col items-center rounded-2xl border border-white/15 bg-black/40 p-4">
                <CatPortrait skin={skin} size={190} showRotate />
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
                <button
                  className="mt-1.5 text-[11px] text-amber-300/90 hover:text-amber-200"
                  onClick={() => setName(randomCatName())}
                >
                  Random name
                </button>
                <div className="mt-3 w-full">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Cat name</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 20))}
                    className="mt-1 border-white/20 bg-black/40 text-center text-sm font-semibold text-white"
                    aria-label="Cat name"
                  />
                  {nameError ? (
                    <p className="mt-1 text-[11px] text-red-300">{nameError}</p>
                  ) : nameDirty ? (
                    <p className="mt-1 text-[11px] text-emerald-300">Saving will rename your cat everywhere.</p>
                  ) : null}
                </div>
                <div className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 p-2.5 text-center">
                  <p className="flex items-center justify-center gap-1.5 text-xs text-white/70">
                    <Heart className="size-3 text-amber-300" /> Current Clan
                  </p>
                  <p className="text-sm font-bold text-white">{currentClan?.name ?? "None"}</p>
                  <p className="text-[11px] capitalize text-white/50">{player.rank} · {player.xp} XP</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full rounded-lg border-white/20 bg-black/30 text-xs text-white hover:bg-white/10"
                    onClick={() => setClanPickerOpen(true)}
                  >
                    <Shield className="size-3.5 text-amber-300" /> Change Clan
                  </Button>
                </div>
              </div>

              {/* appearance editor */}
              <div className="rounded-2xl border border-white/15 bg-black/40 p-4">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/60">
                  <Palette className="size-3.5 text-amber-300" /> Appearance
                </p>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/50">Fur</p>
                    <div className="mt-1">
                      <Swatches colors={FUR_COLORS} value={skin.fur} onChange={(fur) => setSkin((s) => ({ ...s, fur, chest: undefined }))} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/50">Eyes</p>
                    <div className="mt-1">
                      <Swatches colors={EYE_COLORS} value={skin.eye} onChange={(eye) => setSkin((s) => ({ ...s, eye }))} />
                    </div>
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
                    <User className="size-3.5 text-amber-300" />
                    Battle scar
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
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-[11px] text-white/40">
                Changing Clan moves your cat to that camp — appearance, name, and progress are untouched.
              </p>
              <Button
                className="rounded-xl bg-amber-400 font-bold text-[#0d160d] hover:bg-amber-300"
                disabled={!!nameError || (!anyDirty && !player.clan)}
                onClick={() => onSave({ name: name.trim() || player.name, skin, clan: player.clan })}
              >
                Save changes
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

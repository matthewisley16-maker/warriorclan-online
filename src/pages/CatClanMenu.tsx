// WarriorCatsRPG — in-game "Cat & Clan" menu: opens the full customizer for
// the ONE persistent cat (appearance, favorites, presets) and keeps the
// name / Clan controls. Built on the same save flow as the main menu.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatSkin } from "@/game/draw";
import { CatCustomizer } from "./CatCustomizer";
import type { CustomSkin } from "@/game/catItems";
import { ClanSelect, CLAN_OPTIONS } from "./ClanSelect";

export interface CatClanSave {
  name?: string;
  skin?: CatSkin;
  clan?: string;
  favorites?: string[];
  presets?: { name: string; skin: CustomSkin }[];
}

export function CatClanMenu({
  open,
  player,
  favorites = [],
  presets = [],
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
  favorites?: string[];
  presets?: { name: string; skin: CustomSkin }[];
  onClose: () => void;
  onSave: (v: CatClanSave) => void;
}) {
  const [clanPickerOpen, setClanPickerOpen] = useState(false);

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
              skin={player.skin}
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
          <div className="relative flex h-full flex-col">
            {/* top controls: name + clan stay accessible above the customizer */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
              <div className="flex items-center gap-2 text-white">
                <span className="text-sm font-semibold">{player.name}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/60">
                  {currentClan?.name ?? "Loner"} · {player.rank}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 rounded-lg border-white/20 bg-black/30 text-[11px] text-white hover:bg-white/10"
                  onClick={() => {
                    const name = window.prompt("Cat name", player.name);
                    if (name && name.trim().length >= 2) onSave({ name: name.trim() });
                  }}
                >
                  Rename
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 rounded-lg border-white/20 bg-black/30 text-[11px] text-white hover:bg-white/10"
                  onClick={() => setClanPickerOpen(true)}
                >
                  <Shield className="size-3 text-amber-300" /> Clan
                </Button>
                <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[11px] text-white/70" onClick={onClose}>
                  Back to the forest
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <CatCustomizer
                open
                playerName={player.name}
                initialSkin={player.skin as CustomSkin}
                savedSkin={player.skin as CustomSkin}
                favorites={favorites}
                presets={presets}
                onClose={onClose}
                onSave={(v) => {
                  onSave({ skin: v.skin as CatSkin, favorites: v.favorites, presets: v.presets });
                }}
              />
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// keep the Sparkles import referenced (customizer affordance copy)
void Sparkles;

// WarriorCatsRPG — choose your path: Story, Online Open World, or Free Play.

import { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Globe2, Leaf, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CatCreator, type CatAppearanceForm } from "./CatCreator";
import { cn } from "@/lib/utils";

export type GameMode = "story" | "open" | "free";

export interface CreatedCat {
  name: string;
  appearance: CatAppearanceForm;
}

const modes: {
  id: GameMode;
  title: string;
  tagline: string;
  text: string;
  icon: typeof BookOpen;
  accent: string;
}[] = [
  {
    id: "story",
    title: "Story Mode",
    tagline: "Into the Wild",
    text: "Live the first book: Rusty leaves Twolegplace, meets Graypaw, joins ThunderClan, and becomes Firepaw. Playable missions, dialogue, and every major event.",
    icon: BookOpen,
    accent: "from-orange-500/20",
  },
  {
    id: "open",
    title: "Online Open World",
    tagline: "Multiplayer",
    text: "Join the shared forest with other real players. Pick your Clan, create your own cat, hunt, patrol, chat, roleplay, and explore all four territories together.",
    icon: Globe2,
    accent: "from-sky-500/20",
  },
  {
    id: "free",
    title: "Private Free Play",
    tagline: "Solo roleplay",
    text: "The whole world to yourself. No story missions, no other players — just you, the Clans, prey, weather, and quiet exploration.",
    icon: Leaf,
    accent: "from-emerald-500/20",
  },
];

export default function ModeSelect({
  onStart,
  hasSave,
}: {
  onStart: (mode: GameMode, cat: CreatedCat) => void;
  hasSave: boolean;
}) {
  const [creatorFor, setCreatorFor] = useState<GameMode | null>(null);

  if (creatorFor) {
    return (
      <CatCreator
        mode={creatorFor}
        onCancel={() => setCreatorFor(null)}
        onDone={(cat) => onStart(creatorFor, cat)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Choose your path</h1>
          <p className="mt-3 text-sm text-muted-foreground md:text-base">
            The forest is waiting. How will you enter it?
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {modes.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <button
                onClick={() => setCreatorFor(m.id)}
                className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div
                  className={cn(
                    "pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent opacity-0 transition-opacity group-hover:opacity-100",
                    m.accent,
                  )}
                />
                <div className="relative flex size-11 items-center justify-center rounded-xl bg-primary/10">
                  <m.icon className="size-5 text-primary" />
                </div>
                <p className="relative mt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {m.tagline}
                </p>
                <h2 className="relative mt-1 text-lg font-bold tracking-tight">{m.title}</h2>
                <p className="relative mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{m.text}</p>
                <span className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  {m.id === "open" ? "Create your cat" : hasSave ? "Continue" : "Begin"}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </button>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          {hasSave
            ? "You have an existing cat — starting a new mode keeps your progress."
            : "Your first cat will be created when you pick a mode."}
        </p>
        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" onClick={() => (window.location.href = "/")}>
            Back to home
          </Button>
        </div>
      </div>
    </div>
  );
}

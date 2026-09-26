// WarriorCatsRPG — website landing page. Styled to match the in-game title
// screen: the same living ThunderClan-camp canvas scene, dark forest palette,
// amber ember accents, glass panels, and current game information.

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CloudRain,
  Compass,
  Gamepad2,
  Globe2,
  Leaf,
  Map,
  Moon,
  PawPrint,
  ScrollText,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { MenuScene } from "@/game/menuScene";
import { cn } from "@/lib/utils";

/** Living ThunderClan-camp hero backdrop (same scene engine as the title screen). */
function CampHero() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const scene = new MenuScene(canvas, {
      fur: "#d96b2f",
      furDark: "#b04f1d",
      eye: "#4fae6e",
      pattern: "solid",
      tail: "normal",
      ears: "normal",
      size: 1,
      scar: false,
    });
    return () => scene.destroy();
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />;
}

const modes = [
  {
    id: "story",
    icon: BookOpen,
    title: "STORY MODE",
    tagline: "Into the Wild",
    text: "Play through the first book — leave Twolegplace, join ThunderClan, train as an apprentice, and face every major event through 16 story missions.",
    accent: "group-hover:border-amber-300/70",
    chip: "text-amber-300",
  },
  {
    id: "open",
    icon: Globe2,
    title: "ONLINE OPEN WORLD",
    tagline: "Multiplayer",
    text: "Explore the whole forest with other players across all four Clan territories. Hunt, patrol, chat, roleplay, attend Gatherings, and meet the NPCs.",
    accent: "group-hover:border-sky-300/70",
    chip: "text-sky-300",
  },
  {
    id: "free",
    icon: Leaf,
    title: "FREE PLAY",
    tagline: "Solo roleplay",
    text: "The entire Into the Wild world with no missions and no pressure — hunt, wander, watch the weather turn, and roleplay camp life at your own pace.",
    accent: "group-hover:border-emerald-300/70",
    chip: "text-emerald-300",
  },
];

const features = [
  {
    icon: Compass,
    title: "The full book map",
    text: "192×176 tiles of Into the Wild: ThunderClan camp, Sunningrocks, Fourtrees, Snakerocks, Tallpines, Sandy Hollow, the Owl Tree, Highstones, Twolegplace, the farm — and all four Clan territories.",
  },
  {
    icon: PawPrint,
    title: "Dens you can walk into",
    text: "Enter the leader's den inside Highrock, the medicine cat's crevice, the warriors' thornbush, the nursery, the apprentices' and elders' dens — each with its own interior.",
  },
  {
    icon: Users,
    title: "Live multiplayer forest",
    text: "See other players walking their cats in real time, chat in global, Clan, and local channels, and share the forest together. Real players appear with their custom pelts.",
  },
  {
    icon: CloudRain,
    title: "Living wilderness",
    text: "A full day/night clock, shifting weather — rain, storms, fog, wind — prey that flees unless you sneak, herb patches to forage, and NPCs that follow daily camp routines.",
  },
  {
    icon: ScrollText,
    title: "Quests & progression",
    text: "16 story missions from the first book, side quests around camp, XP that earns your rank from kittypet to apprentice to warrior, achievements, and inventory.",
  },
  {
    icon: Shield,
    title: "One cat, saved forever",
    text: "Create ONE cat — name, pelt, eyes, Clan — and use it in every mode. Position, discoveries, and progress autosave to your account every few seconds.",
  },
];

const clans = [
  { name: "ThunderClan", color: "#4a8a4c", text: "Brave and loyal. Warriors of the deep forest." },
  { name: "RiverClan", color: "#3d6f9e", text: "Sleek swimmers. Fishers of the river." },
  { name: "WindClan", color: "#88b15c", text: "Swift runners of the open moor." },
  { name: "ShadowClan", color: "#356840", text: "Proud night hunters of the pines." },
];

const campCats = [
  { name: "Bluestar", role: "Leader", color: "#aeb4bd" },
  { name: "Tigerclaw", role: "Deputy", color: "#6b4a2f" },
  { name: "Lionheart", role: "Warrior", color: "#d9a441" },
  { name: "Whitestorm", role: "Warrior", color: "#e8e6e0" },
  { name: "Spottedleaf", role: "Medicine cat", color: "#c98d5a" },
  { name: "Graypaw", role: "Apprentice", color: "#8f8f96" },
  { name: "Sandpaw", role: "Apprentice", color: "#e3c088" },
  { name: "Dustpaw", role: "Apprentice", color: "#7a5b3a" },
  { name: "Ravenpaw", role: "Apprentice", color: "#2c2c30" },
  { name: "Longtail", role: "Warrior", color: "#b8a284" },
  { name: "Mousefur", role: "Warrior", color: "#8a7a66" },
  { name: "Runningwind", role: "Warrior", color: "#a5622d" },
];

const places = [
  "ThunderClan Camp",
  "Highrock",
  "Sunningrocks",
  "Fourtrees",
  "The Owl Tree",
  "Snakerocks",
  "Great Sycamore",
  "Tallpines",
  "Sandy Hollow",
  "Highstones & Moonstone",
  "Twolegplace",
  "The Farm",
];

const tips = [
  { icon: Gamepad2, keys: "W A S D", label: "Move" },
  { icon: PawPrint, keys: "Shift", label: "Run" },
  { icon: Leaf, keys: "C", label: "Sneak up on prey" },
  { icon: Compass, keys: "E", label: "Interact" },
  { icon: Moon, keys: "Esc", label: "Pause menu" },
];

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const playHref = isAuthenticated ? "/play" : "/auth?returnTo=%2Fplay";

  return (
    <div className="min-h-screen bg-[#0d160d] text-[#f2efe4]">
      {/* ---------------------------------------------------------------- Nav */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#0d160d]/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.35)]">
              <PawPrint className="size-4 text-[#0d160d]" />
            </div>
            <span className="text-sm font-bold tracking-wide">
              WARRIORS <span className="text-amber-300">RPG</span>
            </span>
          </a>
          <nav className="hidden items-center gap-6 text-sm text-white/60 md:flex">
            <a href="#modes" className="transition-colors hover:text-white">Modes</a>
            <a href="#world" className="transition-colors hover:text-white">World</a>
            <a href="#clan" className="transition-colors hover:text-white">The Clan</a>
            <a href="#territory" className="transition-colors hover:text-white">Territory</a>
          </nav>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <div className="h-9 w-24 animate-pulse rounded-full bg-white/10" />
            ) : (
              <Button
                size="sm"
                className="rounded-full bg-amber-400 font-bold text-[#0d160d] shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:bg-amber-300"
                onClick={() => (window.location.href = playHref)}
              >
                {isAuthenticated ? "Return to camp" : "Play free"}
                <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------- Hero */}
      <section id="top" className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <CampHero />
        {/* readability scrims, same as the title screen */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0d160d]/70 via-transparent to-[#0d160d]" />

        <div className="relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-28 text-center">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <h1 className="text-6xl font-black tracking-[0.22em] text-amber-300 drop-shadow-[0_3px_10px_rgba(0,0,0,0.85)] md:text-8xl">
              WARRIORS
            </h1>
            <p className="mt-1 text-2xl font-bold tracking-[0.6em] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)] md:text-4xl">
              RPG
            </p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <span className="h-px w-16 bg-gradient-to-r from-transparent to-amber-300/70" />
              <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/75 md:text-sm">
                Into the Wild
              </p>
              <span className="h-px w-16 bg-gradient-to-l from-transparent to-amber-300/70" />
            </div>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/75 md:text-lg"
          >
            Follow the fire alone into the forest. Create your cat, join a Clan, and live the
            first book in a living top-down world — with other players, canon cats, real dens,
            hunting, weather, and a full day/night cycle.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.32, duration: 0.6 }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button
              size="lg"
              className="h-13 rounded-full bg-amber-400 px-9 text-base font-bold text-[#0d160d] shadow-[0_0_28px_rgba(251,191,36,0.35)] transition-transform hover:scale-[1.03] hover:bg-amber-300"
              onClick={() => (window.location.href = playHref)}
            >
              <PawPrint className="size-4" />
              {isAuthenticated ? "Continue your journey" : "Begin your warrior journey"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-13 rounded-full border-white/25 bg-black/40 px-9 text-base font-semibold text-white backdrop-blur-md hover:bg-black/60 hover:text-white"
              onClick={() => document.getElementById("modes")?.scrollIntoView({ behavior: "smooth" })}
            >
              See what's inside
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-2"
          >
            {tips.map((t) => (
              <span
                key={t.keys}
                className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-md"
              >
                <kbd className="rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{t.keys}</kbd>
                {t.label}
              </span>
            ))}
          </motion.div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 text-center text-[11px] text-white/40">
          A non-commercial fan project inspired by Erin Hunter's Warriors
        </div>
      </section>

      {/* -------------------------------------------------------------- Modes */}
      <section id="modes" className="relative py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">Three ways in</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
              One cat. Every adventure.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-white/60">
              Create your cat once — name, pelt, eyes, Clan — and take it into any mode.
              Your cat, rank, inventory, and discoveries are always the same save.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {modes.map((m, i) => (
              <motion.button
                key={m.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.08, duration: 0.45 }}
                onClick={() => (window.location.href = playHref)}
                className={cn(
                  "group flex h-full flex-col rounded-2xl border border-white/15 bg-black/40 p-6 text-left backdrop-blur-md",
                  "transition-all hover:-translate-y-1 hover:bg-black/55 hover:shadow-2xl hover:shadow-black/40",
                  m.accent,
                )}
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-white/10 transition-colors group-hover:bg-white/20">
                  <m.icon className="size-5 text-amber-300" />
                </div>
                <p className={cn("mt-4 text-[10px] font-bold uppercase tracking-[0.2em]", m.chip)}>{m.tagline}</p>
                <h3 className="mt-1 text-lg font-extrabold tracking-wide text-white">{m.title}</h3>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-white/65">{m.text}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-amber-300">
                  Enter the forest
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- World */}
      <section id="world" className="border-y border-white/10 bg-black/30 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">The world</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
              A living forest, faithful to the book
            </h2>
            <p className="mt-3 text-base leading-relaxed text-white/60">
              Everything below is already in the game — explore it the moment you step into camp.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: (i % 3) * 0.06, duration: 0.4 }}
                className="rounded-2xl border border-white/12 bg-black/40 p-5 backdrop-blur-md transition-colors hover:border-white/25"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-amber-400/10">
                  <f.icon className="size-5 text-amber-300" />
                </div>
                <h3 className="mt-3.5 text-[15px] font-bold tracking-tight text-white">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/60">{f.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- Clan */}
      <section id="clan" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">The Clan</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
                Every cat from the first book
              </h2>
              <p className="mt-3 text-base leading-relaxed text-white/60">
                They live in the world — and in the title-screen camp you'll see behind the menu.
                Bluestar watches from Highrock, Tigerclaw patrols, apprentices tumble by the
                fresh-kill pile, and Spottedleaf tends her herbs.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-2.5">
                {clans.map((c) => (
                  <div key={c.name} className="rounded-xl border border-white/12 bg-black/40 p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="size-3 rounded-full" style={{ backgroundColor: c.color }} />
                      <p className="text-sm font-bold text-white">{c.name}</p>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-white/55">{c.text}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-white/40">
                Choose your Clan from the Character screen — your cat moves to that Clan's camp.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {campCats.map((c, i) => (
                <motion.div
                  key={c.name}
                  initial={{ opacity: 0, scale: 0.94 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.035, duration: 0.3 }}
                  className="flex items-center gap-2.5 rounded-xl border border-white/12 bg-black/40 p-3"
                >
                  <span
                    className="size-8 shrink-0 rounded-full ring-2 ring-white/20"
                    style={{ backgroundColor: c.color }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-white">{c.name}</p>
                    <p className="truncate text-[10px] uppercase tracking-wider text-white/45">{c.role}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Territory */}
      <section id="territory" className="border-y border-white/10 bg-black/30 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">Territory</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
              Twelve named places to discover
            </h2>
            <p className="mt-3 text-base leading-relaxed text-white/60">
              The river marks RiverClan to the west, the Thunderpath runs north toward ShadowClan,
              Tallpines stretch south to Twolegplace, and Highstones wait at the edge of the moor.
              Walk to a place to discover it on your map.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {places.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-black/40 px-3.5 py-1.5 text-xs font-medium text-white/75"
              >
                <Map className="size-3 text-amber-300" />
                {p}
              </span>
            ))}
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Moon, title: "Day & night", text: "A 10-minute day cycle — Gatherings happen under the full moon at Fourtrees." },
              { icon: CloudRain, title: "Weather", text: "Clear, cloudy, rain, storms, fog, and wind sweep across all four territories." },
              { icon: Users, title: "Gatherings", text: "Truce ground where all four Clans meet — and where players cross paths." },
            ].map((b) => (
              <div key={b.title} className="rounded-xl border border-white/12 bg-black/40 p-4">
                <b.icon className="size-4.5 text-amber-300" />
                <p className="mt-2 text-sm font-bold text-white">{b.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/55">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Final CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="relative overflow-hidden rounded-3xl border border-amber-300/25 bg-gradient-to-b from-amber-400/10 to-transparent p-10 text-center shadow-[0_0_60px_rgba(251,191,36,0.12)] md:p-16">
            <Sparkles className="mx-auto size-8 text-amber-300" />
            <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">
              "Fire alone can save our Clan."
            </h2>
            <p className="mx-auto mt-3 max-w-md text-base text-white/60">
              Take your cat into ThunderClan camp, sit beneath Highrock, and see where the
              prophecy begins.
            </p>
            <Button
              size="lg"
              className="mt-7 h-13 rounded-full bg-amber-400 px-9 text-base font-bold text-[#0d160d] shadow-[0_0_28px_rgba(251,191,36,0.35)] transition-transform hover:scale-[1.03] hover:bg-amber-300"
              onClick={() => (window.location.href = playHref)}
            >
              <PawPrint className="size-4" />
              {isAuthenticated ? "Return to the forest" : "Enter ThunderClan"}
            </Button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-white/40 sm:flex-row">
          <div className="flex items-center gap-2">
            <PawPrint className="size-3.5 text-amber-300/70" />
            <span>WarriorCatsRPG — a non-commercial fan project.</span>
          </div>
          <span>Warriors is by Erin Hunter. Not affiliated with the authors or publishers.</span>
        </div>
      </footer>
    </div>
  );
}

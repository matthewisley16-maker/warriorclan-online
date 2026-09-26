// WarriorCatsRPG — themed landing page. Dark forest-night palette with warm
// ember accent, book-flavored copy, and a clear path into the game.

import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Map,
  PawPrint,
  Shield,
  Sparkles,
  Star,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Map,
    title: "Explore the forest territory",
    text: "Walk from the ThunderClan camp to Sunningrocks, Fourtrees, the Owl Tree, Snakerocks, and the Thunderpath — every landmark from Into the Wild.",
  },
  {
    icon: PawPrint,
    title: "Live in the camp",
    text: "Visit the leaders den inside Tallrock, the medicine cats crevice, the warriors thornbush, the nursery, and the elders ivy-draped log.",
  },
  {
    icon: BookOpen,
    title: "Book-accurate Clan",
    text: "Bluestar, Lionheart, Tigerclaw, Whitestorm, Spottedleaf, Graypaw, Sandpaw, Dustpaw, and Ravenpaw — speaking lines straight from the first book.",
  },
  {
    icon: Shield,
    title: "Your save follows you",
    text: "Position, discovered places, and objectives are stored securely to your account. Close the tab and return to the same spot in the forest.",
  },
];

const clanCats = [
  { name: "Bluestar", role: "Leader", color: "#9fb2c8" },
  { name: "Lionheart", role: "Warrior", color: "#d9a441" },
  { name: "Tigerclaw", role: "Deputy", color: "#6b4a2f" },
  { name: "Whitestorm", role: "Warrior", color: "#e8e6e0" },
  { name: "Spottedleaf", role: "Medicine cat", color: "#c98d5a" },
  { name: "Graypaw", role: "Apprentice", color: "#8f8f96" },
  { name: "Sandpaw", role: "Apprentice", color: "#e3c088" },
  { name: "Dustpaw", role: "Apprentice", color: "#7a5b3a" },
  { name: "Ravenpaw", role: "Apprentice", color: "#2c2c30" },
];

const places = [
  "ThunderClan Camp",
  "Tallrock",
  "Sunningrocks",
  "Fourtrees",
  "The Owl Tree",
  "Snakerocks",
  "Great Sycamore",
  "Tallpines",
  "Sandy Hollow",
  "The Thunderpath",
];

export default function Landing() {
  const { isAuthenticated, isLoading } = useAuth();
  const playHref = isAuthenticated ? "/play" : "/auth?returnTo=%2Fplay";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-background text-foreground"
    >
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary">
              <PawPrint className="size-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold tracking-tight">WarriorCatsRPG</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#explore" className="transition-colors hover:text-foreground">Explore</a>
            <a href="#clan" className="transition-colors hover:text-foreground">The Clan</a>
            <a href="#territory" className="transition-colors hover:text-foreground">Territory</a>
          </nav>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <div className="h-9 w-24 animate-pulse rounded-full bg-muted" />
            ) : isAuthenticated ? (
              <Button size="sm" className="rounded-full" onClick={() => (window.location.href = "/play")}>
                Continue journey
                <ArrowRight className="size-3.5" />
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => (window.location.href = "/auth")}>
                  Sign in
                </Button>
                <Button size="sm" className="rounded-full" onClick={() => (window.location.href = playHref)}>
                  Begin
                  <ArrowRight className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* painted forest-sky backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(1100px 520px at 50% -10%, rgba(217,107,47,0.16), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(63,125,67,0.18), transparent 55%)",
          }}
        />
        {/* tree silhouette strip */}
        <svg
          aria-hidden
          viewBox="0 0 1440 180"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-36 w-full text-[#12240f]"
        >
          <path
            fill="currentColor"
            d="M0 180 V120 l40-14 30 26 34-44 28 38 36-52 30 44 40-30 34 40 38-56 30 48 36-34 30 40 40-58 32 50 36-36 30 44 38-30 34 40 40-62 30 54 36-32 30 40 40-48 32 44 36-58 30 50 34-26 30 32 40-44 32 40 36-30 30 36 40-52 32 46 36-28 30 34 40-40 32 36 36-44 30 38 40-30 32 36 36-42 30 34 40-28 32 30 V180 Z"
            opacity="0.85"
          />
        </svg>

        <div className="relative mx-auto max-w-6xl px-6 pb-44 pt-20 text-center md:pt-28">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur"
          >
            <Sparkles className="size-3.5 text-primary" />
            A fan-made Warrior Cats online RPG
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.5 }}
            className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight md:text-6xl"
          >
            Follow the{" "}
            <span className="bg-gradient-to-r from-[#d96b2f] to-[#e8a24a] bg-clip-text text-transparent">
              fire
            </span>{" "}
            alone into the forest.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26, duration: 0.5 }}
            className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg"
          >
            A top-down online RPG set in Erin Hunter&apos;s ThunderClan. Walk the camp, meet the
            Clan, and explore the forest exactly as Rusty first found it.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34, duration: 0.5 }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button size="lg" className="h-12 rounded-full px-7 text-base" onClick={() => (window.location.href = playHref)}>
              <PawPrint className="size-4" />
              {isAuthenticated ? "Continue your journey" : "Begin your warrior journey"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-full px-7 text-base"
              onClick={() => document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" })}
            >
              See what&apos;s inside
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4 text-xs text-muted-foreground"
          >
            WASD to walk · E to interact · Everything saves automatically
          </motion.p>
        </div>
      </section>

      {/* Features */}
      <section id="explore" className="border-t border-border/50 bg-card/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Version 1</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              One Clan. One forest. Fully walkable.
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              This first release is a single, complete experience: explore the ThunderClan camp and
              the forest territory around it, rendered as a living top-down world.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
              >
                <Card className="h-full rounded-2xl border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md">
                  <CardContent className="flex gap-4 p-5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <f.icon className="size-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold tracking-tight">{f.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* The Clan */}
      <section id="clan" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">The Clan</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                Every cat from the first book
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                Find them where they belong: Bluestar beneath Tallrock, Spottedleaf among her herbs,
                Graypaw by the fresh-kill pile, and Ravenpaw watching the shadows.
              </p>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
            {clanCats.map((c, i) => (
              <motion.div
                key={c.name}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.04, duration: 0.35 }}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
              >
                <span
                  className="size-9 shrink-0 rounded-full ring-2 ring-border"
                  style={{ backgroundColor: c.color }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Territory map strip */}
      <section id="territory" className="border-t border-border/50 bg-card/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Territory</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              The forest, as the books drew it
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              The river borders RiverClan to the west. The Thunderpath marks ShadowClan to the
              north. Tallpines run south toward Twolegplace. Ten named places to discover.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {places.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-xs font-medium shadow-sm"
              >
                <Map className="size-3 text-primary" />
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-b from-card to-card/60 p-10 text-center shadow-lg md:p-16">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(600px 260px at 50% 0%, rgba(217,107,47,0.14), transparent 65%)",
              }}
            />
            <Star className="relative mx-auto size-8 text-primary" />
            <h2 className="relative mt-4 text-3xl font-bold tracking-tight md:text-4xl">
              &quot;Fire alone can save our Clan.&quot;
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-base text-muted-foreground">
              Take the name Firepaw, walk beneath Tallrock, and see the prophecy begin.
            </p>
            <Button
              size="lg"
              className="relative mt-7 h-12 rounded-full px-8 text-base"
              onClick={() => (window.location.href = playHref)}
            >
              <PawPrint className="size-4" />
              {isAuthenticated ? "Return to the forest" : "Enter ThunderClan"}
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={cn("border-t border-border/50 py-8")}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <PawPrint className="size-3.5" />
            <span>WarriorCatsRPG — a non-commercial fan project.</span>
          </div>
          <span>
            Warriors is by Erin Hunter. Not affiliated with the authors or publishers.
          </span>
        </div>
      </footer>
    </motion.div>
  );
}

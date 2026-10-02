// WarriorCatsRPG — Story Mode cutscene player (§2/§3/§4/§5/§13-§23/§27/§35).
//
// Plays a StoryBeat over the living 2D world: the engine's cinematic camera
// pans/zooms to each speaking character, the NPC acts (head/tail/pose/look-at
// through the REAL animation system), the written line appears in a cinematic
// caption, and a SHORT per-character cat vocalization accompanies it (never
// human speech, never per-letter — Undertale-style but with meows).
//
// §27: while a line is on screen the audio mix ducks (music -55%, ambience
// -50%) so text stays readable; everything restores smoothly afterwards.
// §6/§2: control returns to the player the moment the beat (or their chosen
// response) finishes — beats are punctuation, not imprisonment.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { GameCanvas } from "@/game/engine";
import { beatCameraSteps, type StoryBeat, type CineLine, type CineChoice } from "@/game/storyCinematics";
import type { VocalEmotion } from "@/game/vocal";
import { pickVocal, emotionForLine } from "@/game/vocal";
import { audio } from "@/game/audio";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  beat: StoryBeat | null;
  game: GameCanvas | null;
  /** fired after the last line (or after choices resolve) — control returns */
  onDone: () => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "lines"; idx: number }
  | { kind: "choices" }
  | { kind: "chosen"; line: CineLine; then: CineLine | null };

export function StoryCutscenePlayer({ beat, game, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [caption, setCaption] = useState<CineLine | null>(null);
  const timers = useRef<number[]>([]);
  const ducked = useRef(false);
  const actedNpcs = useRef<Set<string>>(new Set());

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const clearTimers = useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  /** §27: duck under dialogue, restore between lines and at the end. */
  const duck = useCallback((on: boolean) => {
    if (ducked.current === on) return;
    ducked.current = on;
    audio().setDucked(on);
  }, []);

  /** §4: direct an NPC through the REAL animation system for a line. */
  const actLine = useCallback(
    (line: CineLine) => {
      const a = line.act;
      if (!a || !game) return;
      game.setNpcStoryBeat(a.npcId, {
        pose: a.pose,
        head: a.head,
        tail: a.tail,
        lookAt: a.lookAt,
        durMs: (line.holdMs ?? 2800) + 600,
      });
      actedNpcs.current.add(a.npcId);
    },
    [game],
  );

  const releaseActed = useCallback(() => {
    for (const id of actedNpcs.current) game?.clearNpcStoryBeat(id);
    actedNpcs.current.clear();
  }, [game]);

  /** §13/§16: ONE short vocalization per line, from the speaker's profile. */
  const voiceLine = useCallback((line: CineLine) => {
    const emotion: VocalEmotion = line.emotion ?? emotionForLine(line.text);
    const v = pickVocal(line.speakerId, emotion);
    audio().playCharacterVocal(v);
  }, []);

  // Run the beat whenever a new one arrives.
  useEffect(() => {
    if (!beat || !game) return;
    clearTimers();
    actedNpcs.current.clear();
    duck(true);
    audio().setCinematic(true);

    // camera choreography: pan/zoom per line, then hand back smoothly (§3)
    const s = game.engineState();
    const steps = beatCameraSteps(
      beat,
      (id) => game.getNpcWorldPos(id),
      { x: s.x, y: s.y },
    );
    game.playCinematic(steps);

    game.setPlayerControlEnabled(false);
    setPhase({ kind: "lines", idx: 0 });
    setCaption(beat.lines[0] ?? null);

    return () => {
      clearTimers();
      duck(false);
      audio().setCinematic(false);
      releaseActed();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat?.id]);

  // Advance through lines on a read-time cadence.
  useEffect(() => {
    if (phase.kind !== "lines" || !beat) return;
    const line = beat.lines[phase.idx];
    if (!line) {
      // scripted lines done → choices or the end
      if (beat.choices?.length) setPhase({ kind: "choices" });
      else finish();
      return;
    }
    setCaption(line);
    voiceLine(line);
    actLine(line);
    const hold = line.holdMs ?? 2800;
    const t = window.setTimeout(() => setPhase({ kind: "lines", idx: phase.idx + 1 }), hold);
    timers.current.push(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, beat?.id]);

  const finish = useCallback(() => {
    clearTimers();
    duck(false);
    audio().setCinematic(false);
    releaseActed();
    game?.clearCinematic();
    game?.setPlayerControlEnabled(true);
    setCaption(null);
    setPhase({ kind: "idle" });
    onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, onDone]);

  // §7: the player answers in their own voice (written + vocalized), then the
  // NPC replies; afterwards control returns (§21).
  const choose = useCallback(
    (c: CineChoice) => {
      const playerEcho: CineLine = { speaker: "You", speakerId: "player", text: c.playerLine, holdMs: 2400 };
      setPhase({ kind: "chosen", line: playerEcho, then: c.reply });
      setCaption(playerEcho);
      voiceLine(playerEcho);
      const hold = playerEcho.holdMs ?? 2400;
      timers.current.push(
        window.setTimeout(() => {
          setCaption(c.reply);
          voiceLine(c.reply);
          actLine(c.reply);
          timers.current.push(window.setTimeout(finish, c.reply.holdMs ?? 3000));
        }, hold),
      );
    },
    [actLine, finish, voiceLine],
  );

  // Skim protection: clicking the caption advances long lines early (§36 —
  // never traps the player in a cutscene).
  const advance = useCallback(() => {
    if (phase.kind === "lines") setPhase({ kind: "lines", idx: phase.idx + 1 });
  }, [phase]);

  useEffect(() => () => audio().setDucked(false), []);

  if (!beat) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="cine-frame"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="pointer-events-none absolute inset-0 z-40"
      >
        {/* cinematic letterbox (§3) */}
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 34 }}
          exit={{ height: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/85 to-black/40"
        />
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 34 }}
          exit={{ height: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 to-black/40"
        />

        {/* caption + speaker (§13: written dialogue is the primary channel) */}
        <AnimatePresence mode="wait">
          {caption && (
            <motion.div
              key={`${caption.speakerId}:${caption.text.slice(0, 24)}:${phase.kind === "lines" ? phase.idx : "x"}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="pointer-events-auto absolute inset-x-4 bottom-14 z-20 mx-auto max-w-2xl"
              onClick={advance}
            >
              <div className="rounded-2xl border border-amber-200/20 bg-[#0d160d]/90 p-4 shadow-2xl shadow-black/50 backdrop-blur-md">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300">{caption.speaker}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/95">{caption.text}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* §7: dialogue choices */}
        {phase.kind === "choices" && beat.choices && (
          <div className="pointer-events-auto absolute inset-x-4 bottom-14 z-30 mx-auto max-w-xl space-y-2">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">How do you answer?</p>
            {beat.choices.map((c) => (
              <Button
                key={c.label}
                variant="outline"
                size="sm"
                className="w-full rounded-xl border-amber-200/25 bg-[#0d160d]/90 text-left text-xs text-white hover:bg-white/10"
                onClick={() => choose(c)}
              >
                {c.label}
              </Button>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

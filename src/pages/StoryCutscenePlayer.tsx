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
import { StoryDialogueBox } from "./StoryDialogueBox";

interface Props {
  beat: StoryBeat | null;
  game: GameCanvas | null;
  /** fired after the last line (or after choices resolve) — control returns */
  onDone: () => void;
  /** §STORY-PLACE: the step's real map location — the opening shot frames it */
  frameAt?: { x: number; y: number } | null;
}

type Phase =
  | { kind: "idle" }
  | { kind: "lines"; idx: number }
  | { kind: "choices" }
  | { kind: "chosen"; line: CineLine; then: CineLine | null };

export function StoryCutscenePlayer({ beat, game, onDone, frameAt }: Props) {
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
      frameAt ?? null,
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
    // §36: a manual advance (E / click) cancels this line's read timer, so the
    // stale timer can never fire later and swallow the NEXT line.
    return () => window.clearTimeout(t);
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

  // Skim protection: clicking the box (or pressing E) advances a long line
  // early (§36 — never traps the player in a cutscene). Choices must be
  // answered, so the box ignores advance input while they are pending.
  const advance = useCallback(() => {
    if (phase.kind === "lines") setPhase({ kind: "lines", idx: phase.idx + 1 });
  }, [phase]);

  // §6/§7: E is the game's dialogue key everywhere else — it must advance this
  // SAME box here, not open a second dialogue interface underneath the beat.
  useEffect(() => {
    if (!beat) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "e" || event.key === "E" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, beat]);

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

        {/* §13: written dialogue is the primary channel — ONE shared box for
            every speaker in the beat, and the answer buttons live inside it
            so the choice UI can never stack on top of the line. */}
        <StoryDialogueBox
          line={caption}
          lineKey={`${caption?.speakerId ?? ""}:${caption?.text.slice(0, 24) ?? ""}:${
            phase.kind === "lines" ? phase.idx : "x"
          }`}
          onAdvance={advance}
          hint={phase.kind === "lines" ? "E / click to continue" : undefined}
          choices={
            phase.kind === "choices" && beat.choices
              ? beat.choices.map((c) => ({ label: c.label, onPick: () => choose(c) }))
              : undefined
          }
        />
      </motion.div>
    </AnimatePresence>
  );
}

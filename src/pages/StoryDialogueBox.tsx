// WarriorCatsRPG — the ONE Story Mode dialogue box (§2/§3/§7/§13/§27/§35).
//
// Story Mode used to render dialogue in three places at once: the cinematic
// caption, the generic `dialogue` panel (narrator/completion lines, which never
// auto-cleared) and the NPC conversation panel. Talking to Graypaw could show
// all three stacked over the forest.
//
// This component is the single surface every Story Mode line goes through —
// narrator lines and NPC lines alike. The BOX itself is one persistent node:
// a new speaker turn re-animates only the content inside it, so advancing a
// conversation updates this box instead of mounting a second one. Closing a
// line unmounts it immediately, so a finished conversation can never leave a
// panel behind. Online World keeps its own conversation panel; this is
// story-only.

import { motion } from "framer-motion";

export interface StoryDialogueLine {
  /** display name shown above the text ("Narrator", "Graypaw", "You") */
  speaker: string;
  /** voice profile id; "narrator" is unvoiced by design */
  speakerId?: string;
  text: string;
}

export interface StoryDialogueChoice {
  label: string;
  onPick: () => void;
}

interface Props {
  /** the single line to display — null closes the box */
  line: StoryDialogueLine | null;
  /** identity of this line; re-animates the content on each speaker turn */
  lineKey?: string;
  /** answer buttons rendered INSIDE the same box (never a second panel) */
  choices?: StoryDialogueChoice[];
  /** subtle affordance under the text; e.g. "E / click to continue" */
  hint?: string;
  /** click / tap advances (E is handled by the key handler in the player) */
  onAdvance?: () => void;
  className?: string;
}

/** Stable content key: same speaker + same line = same content element. */
export function storyLineKey(line: StoryDialogueLine | null, index?: number): string {
  if (!line) return "none";
  return `${line.speakerId ?? line.speaker}:${index ?? ""}:${line.text.slice(0, 32)}`;
}

export function StoryDialogueBox({ line, lineKey, choices, hint, onAdvance, className }: Props) {
  // No exit animation on purpose: a closed box must disappear at once (and an
  // interrupted exit animation must never pin dialogue over the world).
  if (!line) return null;
  const narrator = line.speakerId === "narrator";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      // above the cinematic letterbox, below the HUD menus; the speaking cats
      // stand in the upper part of the screen and stay visible
      className={`pointer-events-auto absolute inset-x-4 bottom-14 z-[58] mx-auto w-[min(640px,calc(100%-2rem))] ${className ?? ""}`}
      onClick={onAdvance}
      data-story-dialogue=""
      data-speaker={line.speaker}
      role="dialog"
      aria-label={`${line.speaker} dialogue`}
      aria-live="polite"
    >
      <div className="rounded-2xl border border-amber-200/20 bg-[#0d160d]/92 p-4 shadow-2xl shadow-black/50 backdrop-blur-md">
        {/* the turn itself: keyed, so each speaker fades in INSIDE this box */}
        <motion.div
          key={lineKey ?? storyLineKey(line)}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          <div className="flex items-center justify-between gap-3">
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.25em] ${
                narrator ? "text-sky-200/80" : "text-amber-300"
              }`}
            >
              {line.speaker}
            </p>
            {narrator && (
              <span className="rounded-full border border-sky-200/20 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-sky-200/60">
                story
              </span>
            )}
          </div>
          <p
            className={`mt-1.5 text-sm leading-relaxed ${
              narrator ? "italic text-white/85" : "text-white/95"
            }`}
          >
            {line.text}
          </p>
          {choices && choices.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {choices.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    c.onPick();
                  }}
                  className="w-full rounded-lg border border-amber-200/25 bg-white/5 px-3 py-1.5 text-left text-xs text-white/90 transition-colors hover:border-amber-200/50 hover:bg-white/10"
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : hint ? (
            <p className="mt-2 text-[10px] text-white/40">{hint}</p>
          ) : null}
        </motion.div>
      </div>
    </motion.div>
  );
}

// WarriorCatsRPG — the ONE interaction controller.
//
// The duplicate-interface bug came from E being handled by more than one
// system at once: the engine emitted an interaction for the nearest target on
// EVERY keyboard event (including OS key-repeat), and the React layer happily
// opened a conversation on top of whatever chatter panel / cutscene line box
// was already on screen. Two panels, two handlers, one key press.
//
// This module is the single authority. It takes one *press* and decides what
// happens, with explicit guards:
//
//   * key-repeat events never open anything (they may only advance a line);
//   * one physical press can only produce one decision (input-edge debounce);
//   * while a scene owns the screen (cutscene / conversation / chatter panel)
//     the press advances or closes that scene — it can never open a second
//     interface on top of it;
//   * while a transition is in flight (map change, interior load, conversation
//     opening) presses are ignored, so a slow load cannot be double-triggered;
//   * with nothing selected there is nothing to act on (no ghost prompts).
//
// It is a pure state machine with no DOM access, so the check suites drive it
// with real key-event bursts, overlapping listeners and map changes.

/** What owns the screen right now. */
export type SceneState =
  | "play"          // free play: the world is interactive
  | "cutscene"      // a story beat / cinematic is playing (E advances lines)
  | "conversation"  // an NPC conversation is open (E advances / ends)
  | "dialogue"      // a one-off chatter panel is open (E closes it)
  | "locked";       // a scripted scene holds the controls (E does nothing)

export interface PressContext {
  /** performance.now() of the key event */
  nowMs: number;
  /** the browser's key-repeat flag for this event */
  repeat: boolean;
  scene: SceneState;
  /** is there a valid interactable under the cursor right now? */
  hasTarget: boolean;
}

export type Decision =
  | { type: "ignore"; reason: "repeat" | "debounce" | "scene" | "transition" | "no-target" }
  | { type: "advance" } // the open scene consumes the press (next line / next step)
  | { type: "close" }   // close the open interface
  | { type: "open" };   // open exactly one interface for the selected target

/** One physical press may not be counted twice (keydown also fires as "keyup+keydown" bursts). */
export const PRESS_DEBOUNCE_MS = 140;
/** How long a newly opened interface blocks further opens (transition guard). */
export const OPENING_GUARD_MS = 260;

export class InteractionController {
  private lastPressAt = -Infinity;
  private transitionUntil = -Infinity;
  private opened = 0;
  private ignored = 0;

  /** Note that a transition (map change, interior, conversation open) started. */
  beginTransition(nowMs: number, ms = OPENING_GUARD_MS) {
    this.transitionUntil = Math.max(this.transitionUntil, nowMs + ms);
  }

  /** A press is arriving. Returns the single decision for it. */
  press(ctx: PressContext): Decision {
    if (ctx.repeat) {
      this.ignored++;
      // a held key may still advance a scene (that is the existing behavior),
      // but it must never OPEN anything
      if (ctx.scene === "cutscene" || ctx.scene === "conversation") return { type: "advance" };
      return { type: "ignore", reason: "repeat" };
    }
    if (ctx.nowMs - this.lastPressAt < PRESS_DEBOUNCE_MS) {
      this.ignored++;
      return { type: "ignore", reason: "debounce" };
    }
    this.lastPressAt = ctx.nowMs;
    if (ctx.nowMs < this.transitionUntil) {
      this.ignored++;
      return { type: "ignore", reason: "transition" };
    }
    if (ctx.scene === "locked") {
      this.ignored++;
      return { type: "ignore", reason: "scene" };
    }
    if (ctx.scene === "cutscene" || ctx.scene === "conversation") return { type: "advance" };
    if (ctx.scene === "dialogue") return { type: "close" };
    if (!ctx.hasTarget) {
      this.ignored++;
      return { type: "ignore", reason: "no-target" };
    }
    // ONE interface: open it and immediately guard the opening window so a
    // second event from any other listener cannot open a second one.
    this.transitionUntil = ctx.nowMs + OPENING_GUARD_MS;
    this.opened++;
    return { type: "open" };
  }

  /**
   * Scene changes (entering a house, a new mission, a reconnect) clear the
   * guards: the new scene starts from a clean press history, so the first E in
   * the new map is never swallowed by the old map's debounce.
   */
  reset() {
    this.lastPressAt = -Infinity;
    this.transitionUntil = -Infinity;
  }

  /** Diagnostics (used by the check suite). */
  get stats(): { opened: number; ignored: number } {
    return { opened: this.opened, ignored: this.ignored };
  }
}

/**
 * Which single interface is allowed on screen for a given state. The UI renders
 * the panel this returns — and only this one — so a story line can never show
 * underneath an NPC conversation, etc.
 */
export type Panel = "none" | "prompt" | "dialogue" | "conversation" | "cutscene";

export function activePanel(input: {
  cutscene: boolean;
  conversation: boolean;
  dialogue: boolean;
  nearby: boolean;
}): Panel {
  if (input.cutscene) return "cutscene";
  if (input.conversation) return "conversation";
  if (input.dialogue) return "dialogue";
  if (input.nearby) return "prompt";
  return "none";
}

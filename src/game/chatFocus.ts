// §CHAT-FOCUS: interaction ↔ open-world chat arbitration.
//
// The reported bug: pressing E to talk to Graypaw (or any other cat), reading a
// narrator line, or interacting inside a house put the dialogue on screen while
// the open-world chat panel stayed up over it, so the text was hard to read.
//
// This module owns the ONE rule, applied at the interaction layer, on top of
// the EXISTING interaction controller + dialogue state (no second E handler,
// no duplicate dialogue window):
//
//  1. The instant an interaction owns the screen — a narrator/speaker line, a
//     player↔NPC conversation, or a story beat — the chat panel is hidden, so
//     it can never cover the dialogue at any screen size.
//  2. Chat keeps running in the background: the subscription, the feed and the
//     channel live outside the panel, so nothing is disconnected or discarded.
//  3. When the interaction ends the panel is restored ONLY if it was open when
//     the interaction began; a chat that was already closed is never reopened.
//     Advancing dialogue keeps the interaction active, so it never reopens chat.
//  4. While the interaction is up the chat layer is cleared from the UI stack,
//     so the world underneath is not left paused by a hidden chat layer (that
//     pause is what silently swallowed E mid-conversation), and the chat toggle
//     cannot reopen the panel over the dialogue.

import { useCallback, useEffect, useRef } from "react";

export interface InteractionChatFocus<T extends string> {
  /** true while a narrator line, story beat or NPC conversation owns the screen */
  talking: boolean;
  /** whether the open-world chat panel should be rendered right now */
  chatVisible: boolean;
  /** open/close the chat panel — a no-op while an interaction owns the screen */
  toggleChat: () => void;
}

export function useInteractionChatFocus<T extends string>({
  dialogueOpen,
  conversationOpen,
  cinematicOpen,
  activeUI,
  setActiveUI,
  chatLayer,
  playLayer,
}: {
  /** a narrator/speaker line is on screen (`dialogue !== null`) */
  dialogueOpen: boolean;
  /** a player↔NPC conversation is on screen (`npcConvo !== null`) */
  conversationOpen: boolean;
  /** a story cinematic owns the screen (`cineBeat !== null`) */
  cinematicOpen: boolean;
  /** the single active UI layer */
  activeUI: T;
  setActiveUI: React.Dispatch<React.SetStateAction<T>>;
  /** the chat layer's name in the UI stack */
  chatLayer: T;
  /** the "nothing open" gameplay layer's name in the UI stack */
  playLayer: T;
}): InteractionChatFocus<T> {
  const talking = dialogueOpen || conversationOpen || cinematicOpen;
  const activeUIRef = useRef(activeUI);
  activeUIRef.current = activeUI;
  const talkingRef = useRef(talking);
  talkingRef.current = talking;
  /** the interaction state the previous commit saw (edge detection) */
  const wasTalkingRef = useRef(false);
  /** chat must come back when the interaction ends (it was open when it began) */
  const restoreRef = useRef(false);

  useEffect(() => {
    if (talking === wasTalkingRef.current) return; // only real transitions
    wasTalkingRef.current = talking;
    if (talking) {
      restoreRef.current = activeUIRef.current === chatLayer;
      // collapse chat out of the stack — the interaction is unimpeded and the
      // world is not left frozen underneath by a hidden chat layer
      if (restoreRef.current) setActiveUI(playLayer);
      return;
    }
    if (!restoreRef.current) return; // chat was closed before → never reopen
    restoreRef.current = false;
    // restore only if nothing else took the screen while we were talking
    if (activeUIRef.current === playLayer) setActiveUI(chatLayer);
  }, [talking, activeUI, chatLayer, playLayer, setActiveUI]);

  const toggleChat = useCallback(() => {
    // an interaction owns the screen: the toggle must not put chat back up
    if (talkingRef.current) return;
    setActiveUI((u) => (u === chatLayer ? playLayer : chatLayer));
  }, [chatLayer, playLayer, setActiveUI]);

  return {
    talking,
    // never rendered while an interaction is on screen: chat cannot cover the
    // dialogue, even for the frame before the collapse above is committed
    chatVisible: activeUI === chatLayer && !talking,
    toggleChat,
  };
}

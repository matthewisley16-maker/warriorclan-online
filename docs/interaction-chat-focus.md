# Interaction ↔ open-world chat focus

**Reported bug.** Pressing E to talk to a cat (Graypaw and every other NPC), or
reading any narrator line, put the dialogue on screen while the open-world chat
panel stayed up over it — the text was hard to read, and once chat was open the
world was paused underneath (so E no longer advanced the conversation).

## The invariant

The interaction layer owns the screen; the chat panel yields to it.

1. **On interaction start, chat collapses.** A narrator/speaker line
   (`dialogue`), a player↔NPC conversation (`npcConvo`) or a story beat
   (`cineBeat`) hides the chat panel — messages *and* input field.
2. **Chat stays connected.** The Convex subscription, the feed and the channel
   live outside the panel, so nothing is disconnected or discarded while hidden.
3. **Restore is conditional.** When the interaction ends the panel comes back
   **only if it was open when the interaction began**. A chat that was already
   closed is never reopened, and advancing dialogue (which keeps the interaction
   active) never reopens it.
4. **The chat layer is removed, not just covered.** A hidden chat layer used to
   leave the world paused *and* swallow E. It is cleared from the UI stack, so
   the world is not frozen under the dialogue.
5. **E with nothing to interact with does nothing.** Collapse is driven by
   interaction *state*, never by the key press, so normal open-world chat is
   unchanged when the player is not talking to a character.

## Where it lives

- `src/game/chatFocus.ts` — `useInteractionChatFocus` (the single policy: which
  layer wins, `chatVisible`, `toggleChat`). Used once, in `Game.tsx`.
- `src/pages/Game.tsx` — supplies the *existing* interaction/dialogue state
  (`dialogue`, `npcConvo`, `cineBeat`, the `activeUI` stack). There is still
  exactly one `ChatPanel` render and one E handler.
- `src/game/engine.ts` — `setPaused(paused, interactWhilePaused)`: a **chat-only**
  pause keeps the world stopped (typing must never cost a cat its life on the
  Thunderpath) but still lets the one existing E handler start an interaction.
  Menus, dialogues, map, friends and codex keep swallowing E exactly as before.

## Suites

```sh
bun scripts/check-chat-focus.ts   # 39 checks: real hook + real ChatPanel, the whole requested flow
bun scripts/check-interact-e.ts   # 14 checks: the real engine's E gating
```

`check-chat-focus.ts` mounts the production hook with the production `ChatPanel`
and drives: chat open → talk to Graypaw → advance → close (chat restored with
every message, including one that arrived while hidden); chat closed → narrator
line → toggle Chat mid-interaction → close (chat never reopened); and normal
open/close of chat with nobody talking.

## Deployment

The deployed game is the static build committed in `isolate/` (see
`docs/customization.md`). A fix that is never built does **not** reach the
running game: rebuild and mirror it after this file's behaviour changes, then
confirm the bundle carries the fix:

```sh
bun run build
rm -rf isolate/assets isolate/audio isolate/index.html isolate/logo.svg isolate/manifest.webmanifest
cp -r dist/. isolate/
grep -c "interactWhilePaused" isolate/assets/Game-*.js   # 1 once rebuilt
```

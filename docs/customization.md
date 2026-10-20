# Cat Customization — System Reference

Post-pass-3 state. The customizer is a real avatar editor: every option renders
on the live cat through the same `drawCat` the game and multiplayer use.

## Data model
`CustomSkin` (`src/game/catItems.ts`) → persisted as `appearance` on the
players row (validators in `src/game/saveShared.ts` + `src/convex/schema.ts`,
kept in sync) → sent on every multiplayer heartbeat (`presence.appearance`).

Fields: `fur, furDark, eye, chest?, pattern?, patternIntensity?, furLength,
furStyle? ("thick"|"scruffy"|"tufted"), tail?, ears?, size, scar, eye2? (hetero),
nose?, face?, markings?: string[], scars?: string[], acc?: slot→item,
accColor?, accColors?: slot→tint, morph?, presetId?`.

`fullSkin` (`src/pages/gameUi.tsx`) is the ONE normalizer: every supported field
must survive it, or the field is neither saved nor synchronized (it was
dropping `morph`/`presetId`), and `appearanceVersion` must react to that field
too, or the edit is never broadcast at all (it ignored the classic `scar`).

## Catalog
~100 items in `catItems.ts`. Categories: FUR (8 styles), COLORS (22),
PATTERNS (10 + intensity slider), MARKINGS (10 white overlays, multi-select),
EYES (13 incl. heterochromia), FACE (7 facial markings + 5 nose colors),
EARS (5), TAIL (5), SCARS (7, multi-select), ACCESSORIES (42 across six slots:
head/ear/neck/body/paws/tail — one item per slot, all combinable), favorites.
Accessory themes: Nature / Seasonal / Roleplay / Fun.

### Randomize (§A)
`randomSkin(base?)` builds a complete appearance from the real catalog: coat,
pattern (+intensity), fur style, eyes (heterochromia only when the two eyes
differ), ears, tail, nose, face, white markings, scars and up to one accessory
per slot — with each accessory's value resolved through
`accessoryValueOf(slot, item)` so an item that has no renderer art for its slot
is SKIPPED rather than equipped with a made-up id. A rolled look drops the
previous look's preset/morph identity and its legacy pale chest band, and the
result goes through `sanitizeSkin`, the ONE validation gate shared by the
randomizer, the preview and the save payload. RANDOMIZE in the editor only
replaces the PENDING look (`setSkin`) — it never touches the camera, the pose,
the animation clock or the sprite transforms — and the player reviews it before
SAVE CAT. The editor keeps NO second copy of the accessory tint (it lives on
`skin.accColor`), so a rolled tint cannot be shadowed by stale component state.

### Save path (§B)
Every write goes through ONE serialized queue — `createSaveQueue` in
`src/game/saveQueue.ts`, with the bounded write (`withTimeout`,
`src/game/saveFlow.ts`) as its `write` — driven by `CatCustomizer`:

- the write is bounded (`withTimeout(..., SAVE_TIMEOUT_MS)` from
  `src/game/saveFlow.ts`): a request that never settles (offline socket,
  reconnecting client) becomes a FAILURE — never an endless "Saving…" and never
  a silent success;
- each caller is answered with the real outcome of the write of ITS OWN look
  (a queued save used to be answered with an immediate `true`, which closed the
  editor and claimed "Saved" while the write was still in flight);
- a look already confirmed on the server this session is not written again;
- on failure the editor keeps every selection, shows the real reason with a
  Retry button (visible at every screen size) and never reports success before
  the backend confirmed the write (a non-`ok` mutation result is a failure);
- `loading` means "the account row is still IN FLIGHT" (`player === undefined`,
  bounded to 8s in `Game.tsx`) — never `player === null`. Deriving it from
  `!player` left SAVE disabled behind a permanent "Loading…" for any signed-in
  account without a character row yet; and a save with no row now creates that
  record (`ensurePlayer`) instead of failing forever.

Verified by `scripts/check-randomize.ts` (catalog ↔ renderer agreement, 30
consecutive rolls checked for validity/assembly/attachment/depth in 8 poses,
and a real save→reload→render round trip for 20 rolled cats) and
`scripts/check-save.ts` (§12: a pending write can never hang the editor;
§13: the queue is serialized, answers every caller with the truth about its own
look, never overlaps writes, skips an already-confirmed look, retries a failed
one, and turns a never-answering write into a failure).

## Rendering guarantees
All accessories/markings/scars anchor to the same pose geometry as the body
(`fam`/`headX`/`headY`/`tg.*` in `drawCat`), so they track walk, sit, sleep,
swim, groom, stretch, crouch-family and all four dances. Head items ride the
head; neck/tail/body/paw anchors follow each pose family. Verified by
`scripts/check-custom.ts`: every accessory must produce extra draw ops in all 6
anchor poses, and the fully-loaded cat renders in all 21 poses.

### Attachment (one coordinate system per part)
`drawCat` draws ONE cat in painter order; every layer is positioned from the
pose anchors (`headX/headY`, `fam`, the tail's `tg`) rather than from a canvas
translate that wraps unrelated parts:

1. shadow → 2. tail stroke + pale tail-tip + **tail accessory** (behind body) →
3. base body → 4. pattern/fur/chest → 5. legs → 6. head → 7. ears, eyes, nose,
muzzle, face markings → 8. **body/leg markings** → 9. **collar** →
10. back/paw items → 11. carried prey.

Head acting (nod / shake / look / sniff) is folded into `headX/headY` — the
HEAD'S own anchor — so head/face/ear parts move while body-anchored layers
(chest/belly/leg markings, collar, back & paw items, the tail) stay attached.
Tail layers (stroke, tip marking, accessory) all read the same `tg` geometry and
share the tail's depth, so a band/bow can never float in front of the body.
Verified by `scripts/check-align.ts` (attachment across every pose + head fx,
depth/no-duplicate base, and the editor preview/thumbnails show the whole cat).

## Flow
- Editor edits are temporary; SAVE CAT persists skin + favorites + presets
  (`updateCat` + `customization.ts` mutations). CANCEL discards. RESET returns
  to the saved cat. Up to 10 named presets on the account.
- In-game saves also live-update `mySkin` so the change is visible instantly.
- Multiplayer: appearance rides the existing heartbeat → presence → remote
  watch; no extra frames are synchronized.
- Suite: `bun scripts/check-custom.ts` (~90 checks) + `bun scripts/check-align.ts`
  (attachment, depth, preview/thumbnail framing).

## Multiplayer skin sync (invariants)
`appearanceVersion` is a CONTENT fingerprint of the look; the presence row's
copy of it is derived by the SERVER (`nextPresenceAppearance`, `saveShared.ts`)
and never taken from the client's number.

1. **The look and its version move together.** Only a packet carrying an
   appearance payload can change either. A version-only packet is inert — the
   old failure mode was a client marking a saved look as "already broadcast",
   so no packet ever carried it while the row kept the previous coat.
2. **The send gate is invalidated on a confirmed save** (`sentAppearanceVerRef
   = null`), never primed with the new fingerprint: the next packet (≤300ms)
   must ride with the full new appearance.
3. **Both cadences fingerprint the NORMALIZED skin.** Taking the raw save in the
   300ms path made it disagree with the 5s heartbeat, so they re-broadcast at
   each other's cadence forever.
4. **A real change advances the version monotonically; a fresh row starts from
   the server clock** so a returning player's look is always numerically newer
   than anything a remote cached, and can never be skipped as "already seen".
5. **Remote swaps are appearance-only**: the engine keyes cats by user id and
   draws `r.appearance` live, so a swap preserves position, facing, pose,
   interpolation buffer and object identity (no duplicate, flicker or
   movement reset).
6. Cat sprites are drawn procedurally (no image/texture cache to invalidate),
   so there is no async asset load to wait on.

Dev readout: `?mpdebug=1` (or `localStorage wcrpg-mp-debug=1`) renders the
local fingerprint, the last broadcast fingerprint, the server row's version,
the last save result and each remote's applied version — off for players.
Suite: `bun scripts/check-skin-sync.ts` (20 checks incl. the stranding control).

## Deployment (what the deployed game actually runs)
The deployed game is the static build committed in `isolate/` (a byte-identical
mirror of `dist/`, which is gitignored). A source fix that is never built does
NOT reach the running game — that is exactly how a "Save stuck on Loading…"
report survived a correct save path: the shipped bundle was built BEFORE the
save-queue fix, so it still carried `loading: !player` (permanent "Loading…" for
an account without a row) and the old inline queue that answered a queued save
with an immediate `true` and never bounded the write.

After changing anything on the save path, rebuild and mirror it:

```sh
bun run build            # tsc -b && vite build → dist/ (same VITE_CONVEX_URL)
rm -rf isolate/assets isolate/audio isolate/index.html isolate/logo.svg isolate/manifest.webmanifest
cp -r dist/. isolate/
```

Verify the shipped bundle really contains the fix (the minifier preserves string
literals):

```sh
grep -c "the server did not confirm the save" isolate/assets/Game-*.js   # 1
grep -c "previous cat is safe"            isolate/assets/Game-*.js        # 0 (pre-fix build)
```

Behavioural check of the real button (real DOM, real component):
`bun scripts/check-save-ui.ts`.

## Story Mode has exactly one dialogue box
`src/pages/StoryDialogueBox.tsx` is the single surface for Story Mode speech.
The box is ONE persistent node: a new speaker turn re-animates only its keyed
content, and a closed line unmounts it immediately (no exit animation can pin a
panel over the world).

Invariant — in Story Mode, only one of these may be on screen, and the shared
box is the only one that is:

| Source | Renders where |
|---|---|
| Cinematic beat lines (`STORY_BEATS`, `STORY_INTRO`) | shared box (`StoryCutscenePlayer`) |
| E-talk with a cat (narrator → cat → step resolution) | shared box (`composeStoryTalk`) |
| Step completion narration (`advanceStory` in story mode) | shared box (queued beat) |
| Generic `dialogue` panel (rooms, hunting, respawn) | hidden while a beat owns the screen |
| Online `npcConvo` panel | never in Story Mode (`mode !== "story"` gate) |

Mechanics that keep it to one box:

1. `setCineBeat` plays one beat at a time — a beat requested while another owns
   the screen waits its turn (`pendingBeatRef`) instead of cutting it off.
2. E is ignored by `handleInteract` while `cineBeatRef` is set; it advances the
   box instead. The story player also binds E/Enter/Space.
3. A manual advance cancels the current line's read timer, so a stale timer can
   never rewind or skip a turn.
4. `composeStoryTalk` authors the exchange as data: narrator (scene brief) →
   the cat's opening line → the step's `onComplete` lines. Talking to a
   bystander omits the mission narration.
5. Choices render inside the same box; closing restores control, the camera and
   the normal Story Mode HUD.

Suite: `bun scripts/check-story-dialogue.ts` (43 checks: the composed script,
the real box updating in place, the real story player never exceeding one box,
E advancing, choices inside the box, close-on-end, and the wiring gates).

## Story Mode scenes play where the story happens

`src/game/storyStaging.ts` is the single source of truth for WHERE a story
scene takes place. `stepScenePoint(stepId)` returns the step's real staged
scene (a map landmark + radius); a beat is only allowed to start once the
player is inside that radius + a 260px camera margin. A travel montage with no
scene of its own (`s2-into-forest`) plays wherever the player stands.

Consequences (all verified):

1. The camp arrival scene cannot start while the player is still at the forest
   edge. Before this gate the beat fired on step change, so the camera panned
   across the whole map from the pine trail to the Tallrock.
2. The Graypaw ambush is staged on the real pine trail in Tallpines
   (`STORY_LOCATIONS["forest-edge"]`, 5+ tiles outside the camp wall) — not on
   the gorse-tunnel doorstep. He walks there from camp along an authored route
   (`STORY_TRAVEL["s2-into-forest"]`) around the dens and down the tunnel, so
   he is already waiting when Rusty arrives.
3. Graypaw then **leads** Rusty to camp through the engine's escort system
   (`setStoryEscort`, `STORY_ESCORTS["s4-the-camp"]`): he walks the authored
   tunnel route, waits if the player falls behind, hurries if the player is
   ahead, and holds at the camp edge. The camp objective will not complete
   until the escort has arrived, so the arrival cutscene always plays with him
   present, inside the camp they actually walked into.
4. The opening shot of a scene beat frames the scene point (`frameAt`), not the
   player's exact spot; authored `openOn` still wins when a beat names its own
   framing.
5. Staging is deferred while a dialogue box owns the screen: a step that
   advances mid-conversation stages its cast (and starts its escort) when the
   box closes, never yanking a cat away from the player mid-line.

Suite: `bun scripts/check-story-place.ts` (93 checks: the encounter's real
location, every beat's gate point, walkable/continuous routes, end-to-end
reachability of every scene, live engine walks without teleports, the escort
arriving inside camp, planted-paw physics, and the ground-cache/minimap perf
guards).

## Story Mode cutscenes are directed scenes

Story Mode is not a caption sequence over a static camera. Each beat in
`src/game/storyCinematics.ts` is a small scene with two extra layers of data on
every line:

- **`shot` / `focus`** — `wide` (establish the place), `medium`, `two` (both
  cats interacting) or `close` (the speaker or a reaction). `focus` names the
  cats in frame (`"player"` or npc ids). `lineCameraShot()` is the ONE rule
  that turns a line into a shot, with the speaker as the sensible default.
- **`cues`** — real acting for that line: `face` (turn to the speaker, live
  target), `step` (walk toward someone and stop a polite gap short),
  `pose` (sit / crouch / pounce / …), `head` (nod / shake / look / sniff),
  `tail`, `alert` (ears prick) and `talking` (mouth moves). `actingForLine()`
  adds the conversational defaults: the speaker talks, listeners turn toward
them.

`src/pages/StoryCutscenePlayer.tsx` applies both layers exactly ONCE per line
(guarded by a line key), so pressing E fast, or a React re-render, can never
replay a camera move or a step/turn. Choices hold a two-shot; the player's own
answer is acted (turn + mouth) and the reply gets its own shot.

### Camera framing (`src/game/cinematic.ts`)

`planCineFrame()` composes a shot around the live subjects: it picks the zoom
from the shot type, keeps the group inside the readable area (below the
letterbox, above the dialogue box, inside the side margins), converts ground
points to body centres, and clamps to the world. `focusCamera()` re-resolves
the actors every frame and eases the camera toward that composition
(`tau` from the requested `durMs`), so a shot follows a cat that walks during
the scene and changes are glides, never cuts. World coordinates are never
touched: the camera moves, the map does not.

`clearCinematic()` no longer snaps the zoom back to 1; the normal follow branch
eases it, so the return to gameplay is a pull-back rather than a pop.

### Engine contract

- `setNpcStoryBeat(id, { pose, head, tail, alert, face, stepTo, talking })`
  directs an NPC; `stepTo` walks the cat inside the staging loop
  (`cineMove`), collision-checked, and is cleared on arrival. `head` is now
  actually passed to `drawCat` — before this, story head acting was stored but
  never rendered.
- `setPlayerStoryAct({ face, pose, head, tail, alert, talking })` directs the
  player's cat while movement input is held.
- `setNpcStoryAnchor` clears any leftover cutscene step; releasing a beat
  (`clearNpcStoryBeat`) clears it too, so normal AI resumes from where the cat
  stands. `stepCineMove` runs in the NPC loop before the escort/anchor branches,
  so a cutscene can direct the guide that led the player in.
- `beatActorIds` counts cue actors, so a scene still waits for every cat it
  will direct to be on its mark — except the escort, whose arrival is gated by
  `escortStatus` instead (it has no anchor while it leads).
- The player's own cat walks the kittypet side of the story (the retelling's
  Rusty); canon NPCs such as Rusty, Graypaw and Bluestar live in the world
  beside them.

### Book fidelity

The beats follow *Warriors: Into the Wild* in order: the pine-trail encounter
with Graypaw (he is hunting, boasts, and invites the kittypet to meet
Bluestar), the gorse-tunnel walk into camp, the camp in mourning for Redtail,
Bluestar's "fire alone can save our Clan", the test, the naming (Rusty becomes
Firepaw), hunting and training, the river border, Oakheart, Yellowfang at
Snakerocks, Tallstar on the moor, the Gathering, the Moonstone, the battle at
Sunningrocks and Ravenpaw's secret about Tigerclaw. Dialogue is original and
short; no long passages are copied.

Suites:

- `bun scripts/check-cine-framing.ts` — shot composition at three viewports,
  live engine close-up/two-shot/tracking/return, real step walking, head
  acting reaching the renderer, authored-scene shot variety, and a line-by-line
  playthrough of the encounter and the camp arrival measuring every frame.
- `bun scripts/check-story-shots.ts` — the real player component with a
  recording engine: one shot per line, no replay on fast advance, cue delivery,
  choices, one box, control and camera restored.
- `bun scripts/check-story-playthrough.ts` — the real player AND the real game
  engine together: the camp arrival and the forest encounter played end to end
  (wide → close → two-shot, Graypaw physically advancing, one box, input dead
  during the scene and working afterwards, camera back to gameplay framing).

## Leg rendering (the gait contract)

`gaitLegs` produces a true four-leg cycle whose stance paws are **planted in
world space**: fore/aft reach is `STRIDE_PX / 2`, exactly the body's advance
over one stance, so a foot does not skate. Paw tops sit on the ground line
(`y = -PAW_H`), a swinging paw lifts visibly, and `drawCat` adds the body bob
back to planted paws (the whole cat is translated by `-bob`) so feet stay
welded to the floor while the shoulders rise and fall.

`CatAnimator` always supplies four legs for a walking cat — even at blend 0 —
so the renderer's old time-based fallback can no longer cycle the legs of a
cat standing still, and stopping blends the stride out over ~0.3s instead of
snapping the legs away.

Rules the animator now enforces (each one is a bug that was visible in play):

- **A movement gait only expresses while the cat really travels**
  (`travelled > 0.01px`). Holding a walk/crouch pose while blocked or idle
  settles the stride instead of holding a frozen mid-step forever.
- **The crouch/stalk slide animates.** `drawCat` uses the gait legs for
  `crouch`/`stalk` while the cat is travelling (it used to fall through to the
  static two-paw stance and ground-skate), and falls back to the original
  crouch stance art once the stride has settled.
- **The settle is time-based** (`SETTLE_SECONDS`), not per-frame: 30fps and
  144fps finish a stop at the same speed. Stride *phase* is always driven by
  travelled distance, never by a timer.
- **A teleport is not travel** (`TELEPORT_PX`): interior transitions, story
  placement and network corrections are not fed to the gait, so legs cannot
  sprint through a stride.
- **Turns never snap.** `easeFacing` always moves *toward* the target, so
  reversing mid-turn no longer pops the sprite from a lean to full side-on.
  The drawn facing crosses 0 while the cat pivots, and `drawCat` clamps the
  sprite's width to 0.6 there — a literal 0 would collapse the cat to an
  invisible sliver for a frame.
- **Legs engage immediately.** The stride blend ramps on distance with a floor
  (`max(0.35, moved/22)`), so a creeping cat animates its legs on the first
  frame instead of sliding on half-tucked paws, and the body bob comes only
  from the real stride (the old time-based bob under settled legs read as a
  cat floating over frozen paws).
- **Tail smoothing survives a clock reset** (forward or backward) by
  re-seeding its shape instead of interpolating across the discontinuity.

## Frame cost

Measured with a recording 2D context (draw calls per frame, 1600×900 CSS at
DPR 2 — the stub context can count calls but not time the browser rasterizer):

| view | before | after |
| --- | --- | --- |
| river | 19,838 ops (11,873 `fillRect`) | 6,337 ops (494 `fillRect`) |
| deep forest | 11,590 | 6,500 |
| camp | 6,820 | 5,662 |
| moor | 6,249 | 4,426 |
| twolegplace | 5,741 | 4,454 |

- **Terrain is baked.** `drawGround` blits 320px chunks (2x baked) and only
  paints animated water live. Painting ~22,000 8px cells per frame was the
  first big draw cost to go.
- **Water is tiled, not per-cell.** The moving surface was painted per 8px
  water cell (3-4 calls each ≈ 12,000 in one frame at the river). It is now
  generated into two tiny reused tiles (a 7-cell × 16-row wave tile and a
  12-cell flow tile, both exact multiples of the wave's own periods) and
  tiled once per contiguous water run, with the per-cell path kept as the
  fallback when no offscreen canvas exists.
- **One lighting pass.** The background clear, up to four uniform full-screen
  tints (weather dark, golden hour, night blue, moonlight) and a vignette
  gradient rasterized every frame are now: no clear (the terrain covers the
  canvas; `renderWorld` paints only the world-edge bands), ONE composed tint
  (flat source-over layers compose exactly), and a baked vignette blitted.
- **Static detail is batched.** Ground detail (9,000 specks) and forest flora
  are filled as one path per style, tree canopies/boughs merge their
  same-colour clusters and rim lights, and redundant
  `save/translate/rotate/restore` around rotation-aware `ellipse` calls are
  gone. Same pixels, a fraction of the calls.
- **A batched path must anchor EVERY shape.** `arc()` and `ellipse()` join the
  current point to the arc's start with a straight line, so a batch that calls
  them back to back collapses into ONE contour and `fill()` then paints the
  hull between the shapes — giant translucent blobs spread across the whole
  map. Multi-shape paths therefore add each shape through the `pathCircle` /
  `pathEllipse` / `pathArc` helpers (engine.ts), which `moveTo` the shape's own
  start first so every shape is an independent subpath. `check-perf.ts`
  measures this on every rendered frame (camp, forest, river) and fails on a
  single joint.
- **The render path never simulates.** Thunderpath traffic advances in the
  update step (still only while the road is near the camera); `renderWorld`
  draws it. A renderer must not mutate the world, and a simulated step must
  happen exactly once per frame.
- **The minimap no longer re-renders the game from inside render**, and it is
  now memoized: `WorldMapCanvas` used to schedule `setLensX/setLensY` in a
  `queueMicrotask` (re-rendering the entire Game tree dozens of times per
  movement tick), then re-scanned 5,700 world items on every HUD render. It
  caches its world scan per lens tile and skips unrelated state changes.
- `resize()` only reassigns `canvas.width/height` when the size actually
  changed (assigning them reallocates and clears the backing store, and zoom
  calls resize every frame).

Suite: `bun scripts/check-perf.ts` — water cost bounded (not per cell), full-
screen budget, baked vignette, one frame loop per frame (and none after
`destroy`), no simulation in the render path, plus the animation rules above.

## Stale-chunk recovery (why the game can die after a deploy)
A tab keeps the shell it booted from. When a new build replaces
`assets/Game-<hash>.js`, that tab's next client-side navigation asks for a file
that no longer exists. The host's SPA fallback answers with `index.html`, and a
module script with a `text/html` MIME type is rejected by the browser:

```
TypeError: Failed to fetch dynamically imported module:
  https://<app>/assets/Game-<oldhash>.js
```

Nothing in the app used to handle that, so the route stayed dead until the
player hard-refreshed. `src/lib/chunkRecovery.ts` now wraps every lazy route
(`recoverableImport`) and listens for `vite:preloadError`: the failure starts
ONE cache-busted shell reload (`?__v=<ts>`, marker stripped once the fresh shell
boots). A 20s session guard means a genuinely broken deploy cannot loop the tab;
then the error boundary shows “The game was updated → Reload”. Dev builds are
excluded, so a code error still surfaces instead of reloading the preview.

Suite: `bun scripts/check-chunk-recovery.ts` (34 checks: both error wordings,
pending-during-recovery, single reload, loop guard, marker strip, wiring).

When a deploy looks broken, check that the published snapshot is internally
consistent — every `/assets/*` the served `index.html` names must return its
real content type, not the 894-byte HTML fallback:

```sh
curl -sI https://<app>/assets/index-<hash>.js | grep -i content-type
# application/javascript  → good
# text/html               → the snapshot is missing that file
```

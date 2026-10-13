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

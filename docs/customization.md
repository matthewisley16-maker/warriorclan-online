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
Accessory themes: Nature / Seasonal / Roleplay / Fun. `randomSkin()` builds a
complete valid randomized appearance from the real catalog.

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

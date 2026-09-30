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
accColor?`.

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
(`fam`/`headX`/`headY`/`tailLen` in `drawCat`), so they track walk, sit, sleep,
swim, groom, stretch, crouch-family and all four dances. Head items ride the
head; neck/tail/body/paw anchors follow each pose family. Verified by
`scripts/check-custom.ts`: every accessory must produce extra draw ops in all 6
anchor poses, and the fully-loaded cat renders in all 21 poses.

## Flow
- Editor edits are temporary; SAVE CAT persists skin + favorites + presets
  (`updateCat` + `customization.ts` mutations). CANCEL discards. RESET returns
  to the saved cat. Up to 10 named presets on the account.
- In-game saves also live-update `mySkin` so the change is visible instantly.
- Multiplayer: appearance rides the existing heartbeat → presence → remote
  watch; no extra frames are synchronized.
- Suite: `bun scripts/check-custom.ts` (~90 checks).

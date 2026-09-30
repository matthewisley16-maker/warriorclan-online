# Map Reconciliation — Warriors_Map.png vs world.ts

Executed `node scripts/map_probe.cjs` (pure-Node zlib PNG decode; no PIL/ImageMagick
in this environment) to pixel-sample `public/assets/Warriors_Map.png` (1176×881 RGBA)
into a 60×45 terrain-classification grid.

## Reference-map features found (color-classified)
- Blue water regions: winding river bands top/left/center, a broader water body
  bottom-center, shoreline strips — rivers visibly DIVIDE the territories.
- Light yellow-green open grassland on the west/northwest (moor).
- Large central/east forest mass (mixed greens), dark pine clusters NE/E (pines/marsh).
- Gray rocky highland band across the north (Highstones / Thunderpath corridor).
- Light-toned built areas: bottom-left corner (Twolegplace) and bottom-right corner
  (the farm). Small horizontal gray strip mid-north consistent with a road crossing.
- Small scattered water bodies in the SE quadrant (ponds).
- A right-edge legend/label panel (UI chrome, not terrain).

## Reconciliation result: CONSISTENT — no world.ts changes required
Cross-checked against `src/game/world.ts` (240×220 tiles):
- ThunderClan forest centered (TC_OX/TC_OY shift) ↔ reference central forest mass.
- West river border → WindClan moor (open grass, few trees) ↔ reference west
  grassland across a river band. ✔
- East river border → RiverClan (riverbank, reeds, lake/streams SE) ↔ reference
  east water bands + SE water bodies. ✔
- Thunderpath along the north → ShadowClan pine/marsh beyond ↔ reference northern
  gray road strip with pine clusters NE. ✔
- Twolegplace SW (full residential grid) and Farm SE ↔ reference light built
  corners bottom-left / bottom-right. ✔
- Landmarks (Fourtrees, Sunningrocks, Snakerocks, Owl Tree, Great Sycamore,
  Highstones/Moonstone) ↔ reference's rocky band, groves and clearings. ✔

The reference's relative geography matches the book-canonical layout world.ts
already implements, so world.ts remains the canonical playable interpretation
of the uploaded map. The probe script `scripts/map_probe.cjs` is kept as a
read-only audit tool.

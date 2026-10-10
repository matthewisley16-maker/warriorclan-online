# WarriorCatsRPG — Audio assets & licensing

All audio is free-to-use stock audio bundled under `public/audio/`. Nothing
here is original music composed for the game, and no copyrighted Warrior Cats
soundtracks are used. Every file below is **CC0 (Public Domain)** unless a
specific attribution is noted — safe to use inside this game, but **do not
redistribute the files as a standalone audio collection**.

Audio system code: `src/game/audio.ts` (music / ambience / SFX routing,
fades, volumes). Settings UI: `MainMenu.tsx` → Settings → "Music & sound".

## Why these files are not from Pixabay (and how to swap them)

The request asked for Pixabay audio. Pixabay's CDN and site both **block
automated downloads** (Cloudflare 403 for machines — verified during this
task), so files cannot be fetched into the repo from here. Every slot in
`src/game/audio.ts` maps 1:1 to an in-game purpose so any Pixabay track can
be dropped in later without touching code:

1. Download the chosen MP3 from pixabay.com (manual, in a browser — license:
   Pixabay Content License, free for commercial use, no attribution required,
   redistribution-as-collection prohibited).
2. Save it into `public/audio/…` with the existing filename (or update the
   path in `MUSIC_FILES` / `LAYERS` / `SFX_FILES` in `src/game/audio.ts`).
3. Record the title + Pixabay URL in the table below.

## Music (`public/audio/music/`)

| File | In-game use | Author / Source | License |
|---|---|---|---|
| `junkala_stage1.ogg` | ThunderClan / default forest theme (warm, adventurous chiptune) | Juhani Junkala — [Chiptune Adventures](https://opengameart.org/content/4-chiptunes-adventure) | CC0 (author statement bundled as `junkala-chiptunes-INFO.txt`) |
| `junkala_stage2.ogg` | WindClan / moor theme (light, energetic, open) | Juhani Junkala — same pack | CC0 |
| `junkala_stage_select.ogg` | RiverClan theme (flowing, calm) + quieter Twolegplace theme | Juhani Junkala — same pack | CC0 |
| `junkala_boss.ogg` | ShadowClan / marsh theme (low, dark, mysterious) | Juhani Junkala — same pack | CC0 |

## Ambience (`public/audio/ambience/`)

| File | In-game use | Author / Source | License |
|---|---|---|---|
| `forest_day.mp3` | Forest biome bed (day) | [Forest Ambience](https://opengameart.org/content/forest-ambience) by filmmakingforcats | CC0 |
| `birds_day.mp3` | Bird layer (day/evening) | [Forest bird sounds](https://opengameart.org/content/forest-bird-sounds) by ultrarfid | CC0 |
| `night_crickets.mp3` | Night layer (20:00–05:00) | [Crickets Ambient Noise](https://opengameart.org/content/crickets-ambient-noise-loopable) by ToivoZike | CC0 |
| `rain_light.mp3` | Rain / heavy-rain weather | [Rain (loopable)](https://opengameart.org/content/rain-loopable) by Ylmir (file 2) | CC0 |
| `rain_heavy.mp3` | Heavy-rain weather | same pack (file 3) | CC0 |
| `storm.ogg` | Storm weather (+ wind boost) | [Rain and Thunders](https://opengameart.org/content/rain-and-thunders) by Wagna | CC0 |
| `wind.ogg` | WindClan moor bed + windy/storm weather | [Birds and Wind — Ambient](https://opengameart.org/content/birds-and-wind-ambient-birds-wind-and-synth) by Spring Spring | CC0 |
| `river.mp3` | River/riverbank biome bed | [Sea and river wave sounds](https://opengameart.org/content/sea-and-river-wave-sounds) by RandomMind (short version) | CC0 |

## SFX (`public/audio/sfx/`, `public/audio/steps/`)

| File | In-game use | Author / Source | License |
|---|---|---|---|
| `cat_mew.ogg` | Rare ambient mew (indoors) | [Kitten Mew](https://opengameart.org/content/kitten-mew) by pozlor | CC0 |
| `cat_mew2.wav` | NPC greeting mew / ambient | [Cat Purr & Meow](https://opengameart.org/content/cat-purr-meow) by cardgamesolitaireftw | CC0 |
| `cat_purr.wav` | Ambient purr (indoors) | same pack (`cat_mewpurr.wav`) | CC0 |
| `ui_click.wav` / `ui_open.wav` / `ui_move.wav` | Menu buttons / open / ESC-nav | [512 Retro SFX](https://opengameart.org/content/512-sound-effects-8-bit-style) by Juhani Junkala (`sfx_sound_neutral2`, `sfx_menu_select1`, `sfx_menu_move2`) | CC0 |
| `ui_confirm.wav` / `ui_cancel.wav` | Confirm / cancel (waypoints, dialogue) | same pack (`sfx_sounds_powerup6`, `sfx_sounds_error1`) | CC0 |
| `collect.wav` | Lore discovery / prey claimed | same pack (`sfx_coin_cluster4`) | CC0 |
| `door.wav` | Entering dens/interiors | same pack (`sfx_movement_dooropen2`) | CC0 |
| `jump.wav` / `land.wav` | Reserved jump/landing cues | same pack (`sfx_movement_jump12[+landing]`) | CC0 |
| `hunt_pounce.wav` | Hunting pounce impact | same pack (`sfx_sounds_impact14`) | CC0 |
| `quest_done.wav` | Story milestone / side-quest complete | same pack (`sfx_sounds_fanfare1`) | CC0 |
| `rank_up.wav` | Rank progression (XP fanfare) | same pack (`sfx_sounds_fanfare2`) | CC0 |
| `clan_join.wav` | Joining/changing Clan | same pack (`sfx_sounds_fanfare3`) | CC0 |
| `steps/grass/0–3.ogg` | Footsteps on grass/sand/dirt/moor | [Fantozzi's Footsteps](https://opengameart.org/content/fantozzis-footsteps-grasssand-stone) — derived from [swuing on freesound](https://freesound.org/people/swuing/sounds/38874/) | CC-BY 3.0 (per-file license.txt; attribution above) |
| `steps/tile/0–2.ogg` | Footsteps on stone/paved/interiors | same pack (tile folder) | CC-BY 3.0 (as above) |
| `steps/water/0–1.ogg` | Footsteps in water/shallows | same pack (water folder) | CC-BY 3.0 (as above) |
| `hunt_rustle` (slot) | Prey-approach rustle — reuses `steps/grass/2.ogg` | — | as grass steps |

## Notes

- Files were transcoded/trimmed **not at all** — they are bundled exactly as
  published by their authors, with sources listed above.
- Twolegplace reuses `junkala_stage_select.ogg` at reduced volume
  (`MUSIC_GAIN.twoleg = 0.55`) until a dedicated "eerie small-town" track is
  dropped in (e.g. a Pixabay "ambient mystery" loop).
- If you replace a slot with a Pixabay file, delete the old file from
  `public/audio/` **only if** nothing else references it (grep the filename),
  and update this README.

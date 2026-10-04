# Task 7 — 0x72 Tileset Acquisition & Monster Frame Map

**Date:** 2026-10-03 · **License of all assets: CC0 (public domain)** — no attribution required.
**Method:** itch.io pages browsed via headless browser (agent-browser) → "Download Now" → "No thanks, just take me to the downloads" → signed CDN URL captured from network log → `curl`. All coordinates below come from the author's own `tile_list_v1.7` / Aseprite JSON and were **pixel-verified** (crop of atlas == individual frame file, 370/370 frames DTS-II, 242/243 DTS-I, 16/16 µFantasy-troll).

## 1. Saved files (project)

| file | source pack | size (px) | content |
|---|---|---|---|
| `public/images/tilesets/dungeon-tileset-ii.png` | 16x16 DungeonTileset II v1.7 | 512×512 RGBA | **main atlas** — 370 named frames (22 animated monsters, 10 hero chars, weapons, items, UI, walls/floors) |
| `public/images/tilesets/dungeon-tileset-i.png` | 16x16 Dungeon Tileset v5 | 512×256 RGBA | 243 **static** sprites (front view): bat, dark_knight, 6 elementals, bies, rokita, demonolog, tentackle(32×32), demon(32×32), ogre(32×32), npcs |
| `public/images/tilesets/microfantasy-characters.png` | µFantasy Tileset v0.4 | 384×782 RGBA | animated characters incl. **troll** (idle 4 + run 4 + attack 8), rhino, mooseman + 12 heroes; art is ~8-16px (micro style, scale ×2 for 16px grid) |

Reference text: `agent-ctx/dtsii-tile-list-v1.7.txt` (author's full tile list "name x y w h").
Archives + individual frames + itch reference GIFs/PNG kept in `/tmp/tilesets/` (DTSII.zip, DTSI.zip, microfantasy.zip, ref1-5, contact_sheet.png).

## 2. Site inventory — https://0x72.itch.io/ (24 items)

Free asset packs (all CC0 unless noted):
- **16x16 DungeonTileset II** (`dungeontileset-ii`) — free/$0, v1.7: tileset + **animated characters + weapons**. ← PRIMARY, downloaded.
- **16x16 Dungeon Tileset** (v5) — free: original set, **static** characters incl. bat/elementals. Downloaded.
- **µFantasy Tileset** (v0.4) — free: 8px-style characters: barbarian, knights, wizard, monk, dwarf, lizard, oldman, guard + **troll, rhino, mooseman** (idle/run/attack). Downloaded.
- **16x16 Industrial Tileset** (v2) — free, sci-fi (enemies = robots/mutants). Downloaded to /tmp (not copied — not fantasy).
- **16x16 Pirates Tileset** (v1) — free, static pirates/ships. Downloaded to /tmp (not copied).
- **DungeonUI** — free, WIP UI elements (works with DTS-II). Skipped (DTS-II already has ui_heart).
- **16x16 DungeonTileset II – Sewers** — official DTS-II expansion, **$2 minimum (NOT free)** — 4 new slug characters. **Skipped (paid).**
- Others (checked, not fantasy-relevant): Lynx Robots, 8x8 F24 Tileset, 2Bit Micro Metroidvania, pixeldudesmaker, 2BitCharactersGenerator, tilesetssplitter, PaperDungeonMaker, 16x16+ Robot Tileset (sci-fi, 9 chars), + games/tools (Warp Defender, SlashSlashSlash, JustMakeALevel, CirclesWorld, brainiac, Tiny Stealthy Scout, LÖVE guide, PRoll, GameBoy exporter).

**❌ NO dragon and NO wolf/canid anywhere on the site** (checked every fantasy pack). Also no crowned "king" monster. Big sprites available: ogre, big_zombie, big_demon (DTS-II, 32×36); demon/ogre/tentackle (DTS-I, 32×32 static). → per task plan, **big_demon stands in for the dragon**.

## 3. CRITICAL rendering facts (verified pixel-level + VLM)

- **All DTS-II characters are side-view facing RIGHT** (+X). Proof: masked_orc's white mask is on the right half of the head; knight's plume trails left & sword strip right; wizard hat tip bends left-back; weapon_axe handle left / cutting edge right; forward foot is the right one; VLM scene check agrees. → draw with `ctx.scale(-1,1)` to face left.
- DTS-II monsters have **idle (4f) + run (4f)** animations; single-`anim` characters (muddy, swampy, zombie, ice_zombie, necromancer, slug, tiny_slug) have one 4-frame cycle (walk/sway) — use it for both idle & walk. **No attack animations** in DTS-II (heroes have 1 hit frame; a community "red demon attack" extension exists at itch.io/post/14696304, not downloaded).
- Sprite anchor: feet at bottom-center of rect. "16×23/16×28" sprites sit in a 1-tile-wide column (16px), extend upward. Big sprites are 32×36 (2 tiles wide + 4px headroom).
- DTS-I sprites are **front view** (facing camera), single frame.
- µFantasy sprites are ~8-16px side-view; troll attack anim is 8 frames — the only real **attack** animation in the whole acquisition.

## 4. DTS-II monster frames — `dungeon-tileset-ii.png` (512×512), rects `{x,y,w,h}` in px, facing RIGHT

| sprite | size | anim | frames (x,y,w,h) | look |
|---|---|---|---|---|
| `goblin` | 16×16 | idle+run | idle f0-f3: {368,40}{384,40}{400,40}{416,40} · run f0-f3: {432,40}{448,40}{464,40}{480,40} | green skin, big ears, loincloth |
| `imp` | 16×16 | idle+run | idle: {368,64}{384,64}{400,64}{416,64} · run: {432,64}{448,64}{464,64}{480,64} | small red demon, horns |
| `skelet` | 16×16 | idle+run | idle: {368,88}{384,88}{400,88}{416,88} · run: {432,88}{448,88}{464,88}{480,88} | skeleton w/ shield+club |
| `muddy` | 16×16 | anim | {368,112}{384,112}{400,112}{416,112} | brown mud blob — golem-like |
| `swampy` | 16×16 | anim | {432,112}{448,112}{464,112}{480,112} | green swamp blob, teeth, root-feet |
| `zombie` | 16×16 | anim | f10:{368,136} f1:{384,136} f2:{400,136} f3:{416,136} — loop in atlas order f10→f1→f2→f3 (arms rising) | green zombie |
| `ice_zombie` | 16×16 | anim | {432,136}{448,136}{464,136}{480,136} | cyan frozen zombie |
| `tiny_zombie` | 16×16 | idle+run | idle: {368,16}{384,16}{400,16}{416,16} · run: {432,16}{448,16}{464,16}{480,16} | mini zombie (swarm) |
| `angel` | 16×16 | idle+run | idle: {368,304}{384,304}{400,304}{416,304} · run: {432,304}{448,304}{464,304}{480,304} | **winged** humanoid, halo — flying |
| `tiny_slug` | 16×16 | anim | {432,376}{448,376}{464,376}{480,376} | small green slug |
| `masked_orc` | 16×23 | idle+run | idle: {368,153}{384,153}{400,153}{416,153} · run: {432,153}{448,153}{464,153}{480,153} | orc, white ritual mask — bandit look |
| `orc_warrior` | 16×23 | idle+run | idle: {368,177}{384,177}{400,177}{416,177} · run: {432,177}{448,177}{464,177}{480,177} | helmet, axe+shield |
| `orc_shaman` | 16×23 | idle+run | idle: {368,201}{384,201}{400,201}{416,201} · run: {432,201}{448,201}{464,201}{480,201} | red feather headdress, bones |
| `necromancer` | 16×23 | anim | {368,225}{384,225}{400,225}{416,225} | dark hood, glowing eyes |
| `wogol` | 16×23 | idle+run | idle: {368,249}{384,249}{400,249}{416,249} · run: {432,249}{448,249}{464,249}{480,249} | stocky orange-red beast, white belly |
| `chort` | 16×23 | idle+run | idle: {368,273}{384,273}{400,273}{416,273} · run: {432,273}{448,273}{464,273}{480,273} | grey-red small demon, 2 horns |
| `pumpkin_dude` | 16×23 | idle+run | idle: {368,321}{384,321}{400,321}{416,321} · run: {432,321}{448,321}{464,321}{480,321} | halloween pumpkin-head |
| `doc` | 16×23 | idle+run | idle: {368,345}{384,345}{400,345}{416,345} · run: {432,345}{448,345}{464,345}{480,345} | old man, blue hooded robe |
| `slug` | 16×23 | anim | {368,369}{384,369}{400,369}{416,369} | big green slug, eye stalks |
| `big_zombie` | **32×36 BIG** | idle+run | idle: {16,332}{48,332}{80,332}{112,332} · run: {144,332}{176,332}{208,332}{240,332} | grey hulk, green moss hair |
| `ogre` | **32×36 BIG** | idle+run | idle: {16,380}{48,380}{80,380}{112,380} · run: {144,380}{176,380}{208,380}{240,380} | green ogre w/ club |
| `big_demon` | **32×36 BIG** | idle+run | idle: {16,428}{48,428}{80,428}{112,428} · run: {144,428}{176,428}{208,428}{240,428} | red demon, horns+fangs |

(All rects are 16×16 / 16×23 / 32×36; only x,y vary per frame — w,h constant per row.)

### DTS-II hero characters 16×28 (idle 4 + run 4 + hit 1) — useful for hero/barracks soldiers
x per frame: **idle f0-f3 = 128,144,160,176 · run f0-f3 = 192,208,224,240 · hit f0 = 256**; y per char:
`elf_f` y=4 · `elf_m` y=36 · `knight_f` y=68 · `knight_m` y=100 · `wizzard_f` y=132 · `wizzard_m` y=164 · `lizard_f` y=196 · `lizard_m` y=228 · `dwarf_f` y=260 · `dwarf_m` y=292.
Example: `knight_m_run_f2` = {224, 100, 16, 28}; `dwarf_m_hit_f0` = {256, 292, 16, 28}.

### DTS-II useful props (rects)
- `ui_heart_full` {289,370,13,12} · `ui_heart_half` {305,370,13,12} · `ui_heart_empty` {321,370,13,12}
- `coin_anim f0-f3`: {289,385,6,7} {297,385,6,7} {305,385,6,7} {313,385,6,7}
- chests 16×16: `chest_full_open f0-f2` y=416 (x=304,320,336) · `chest_empty_open` y=400 · `chest_mimic` y=432
- flasks 16×16 y=352 (red 288, green 320, blue 304, yellow 336) · big flasks y=336
- `floor_spikes_anim f0-f3`: {16,192}{32,192}{48,192}{64,192} (16×16) · `floor_stairs` {80,192} · `hole` {96,144}
- `skull` {288,432,16,16} · `crate` {288,408,16,24}
- weapons (x≈288-352, y≈0-200): `weapon_axe` {341,74,9,21}, `weapon_big_hammer` {291,26,10,37}, `weapon_bow` {289,195,14,26}, `weapon_spear` {309,161,6,30}, `weapon_knight_sword` {339,98,10,29}, `weapon_green_magic_staff` {340,129,8,30}, +20 more (full list in dtsii-tile-list-v1.7.txt)
- walls/floors/doors/fountains/banners: full autotile set (v1.7), see tile list.

## 5. DTS-I static monsters — `dungeon-tileset-i.png` (512×256), FRONT view, single frame

| sprite | rect {x,y,w,h} | notes |
|---|---|---|
| `monster_bat` | {64,144,16,16} | **flying**, front view, symmetric wings |
| `monster_dark_knight` | {96,139,16,21} | armored knight, steel right side — bandit/elite |
| `monster_skelet` | {16,144,16,16} | |
| `monster_zombie` | {32,144,16,16} | |
| `monster_necromancer` | {80,144,16,16} | |
| `monster_goblin` | {0,160,16,16} | |
| `monster_orc_masked` | {16,160,16,16} | |
| `monster_orc` | {32,160,16,16} | |
| `monster_orc_armored` | {48,160,16,16} | |
| `monster_orc_veteran` | {64,160,16,16} | |
| `monster_orc_shaman` | {80,160,16,16} | |
| `monster_imp` | {0,176,16,16} | |
| `monster_wogol` | {16,176,16,16} | |
| `monster_bies` | {32,176,16,16} | goat-demon (Slavic) |
| `monster_chort` | {48,176,16,16} | |
| `monster_rokita` | {64,176,16,16} | goat-demon w/ fiddle |
| `monster_demonolog` | {80,176,16,16} | robed cultist |
| `monster_ogre` | {96,176,32,32} | **BIG** |
| `monster_demon` | {128,176,32,32} | **BIG** |
| `monster_tentackle` | {160,176,32,32} | **BIG** tentacle horror |
| `monster_elemental_earth` | {0,192,16,16} | **rock golem look** |
| `monster_elemental_fire` | {32,192,16,16} | fire elemental |
| `monster_elemental_air` | {48,192,16,16} | air elemental |
| `monster_elemental_goo` | {80,192,16,16} | slime |
| `monster_elemental_earth_small` | {0,208,16,16} | |
| `hero_basic` | {64,128,16,16} | |
| `npc_trickster` | {112,224,16,16} | hooded jester — bandit look |
| `npc_barbarian` | {160,224,16,16} | |

(Also present: npc_dwarf/elf/knight×3/mage/merchant×2/paladin/sage/wizzard/wrestler; 25+ weapons; walls/floors. Full 243-slice JSON: /tmp/tilesets/DTSI/.../0x72_16x16DungeonTileset.v5.json.)

## 6. µFantasy — `microfantasy-characters.png` (384×782), side view, tiny art (~8-16px, draw ×2)

| sprite | anim | frames {x,y,w,h} |
|---|---|---|
| `troll` | idle 4 | {1,706,10,13} {12,706,10,12} {23,706,12,11} {36,706,10,12} |
| `troll` | run 4 | {1,720,11,12} {13,720,10,13} {24,720,10,12} {35,720,12,10} |
| `troll` | **attack 8** | {1,688,10,13} {12,688,13,17} {26,688,16,15} {43,688,16,12} {60,688,10,13} {71,688,13,15} {85,688,12,10} {98,688,11,12} |
| `rhino` | idle 4 | {1,666,8,10} {10,666,8,10} {19,666,10,8} {30,666,8,8} |
| `rhino` | run 4 | {1,677,8,9} {10,677,10,10} {21,677,9,10} {31,677,8,10} |
| `rhino` | attack 4 | {1,655,8,10} {10,655,9,8} {20,655,13,8} {34,655,12,8} |
| `mooseman` | idle 4 | {1,602,8,10} {10,602,8,9} {19,602,10,8} {30,602,8,8} |
| `mooseman` | run 4 | {1,613,8,10} {10,613,9,10} {20,613,9,10} {30,613,8,9} |
| `mooseman` | attack 6 | {1,591,8,10} {10,591,8,10} {19,591,14,9} {34,591,13,8} {48,591,8,8} {57,591,8,9} |

## 7. Recommended mapping — 15 game enemies → sprites (zero sprite reuse)

| # | game enemy | sprite (file) | anim | comment |
|---|---|---|---|---|
| 1 | goblin | `goblin` (DTS-II) | idle4+run4 | perfect match |
| 2 | wolf | `wogol` (DTS-II) — alt: `rhino` (µF, true quadruped, ×2) | idle4+run4 | no canid on site; wogol = fast feral beast (optionally grey tint) |
| 3 | orc | `orc_warrior` (DTS-II) | idle4+run4 | armored orc |
| 4 | bandit | `masked_orc` (DTS-II) — alt static: `npc_trickster` / `monster_dark_knight` (DTS-I) | idle4+run4 | white mask reads as bandit mask |
| 5 | harpy (flying) | `angel` (DTS-II) | idle4+run4 | winged humanoid; add hover-bob + no shadow contact |
| 6 | shaman | `orc_shaman` (DTS-II) | idle4+run4 | feather headdress healer |
| 7 | necromancer | `necromancer` (DTS-II) | anim4 | hood, glowing eyes |
| 8 | skeleton | `skelet` (DTS-II) | idle4+run4 | |
| 9 | troll | `troll` (µFantasy, draw ×2 ≈ 24-32px) — alt: `ogre` (DTS-II 32×36) | idle4+run4+**attack8** | only sprite with a real attack anim |
| 10 | demon | `chort` (DTS-II) — alt: `imp` | idle4+run4 | small horned demon |
| 11 | golem | `muddy` (DTS-II) — alt: `swampy`, or static `monster_elemental_earth` (DTS-I) | anim4 | mud/stone elemental |
| 12 | goblin_king (mini-boss) | `goblin` ×2 scale (32×32) + gold tint/crown overlay | idle4+run4 | reads as "big goblin"; alt: `big_zombie` |
| 13 | gorgak (big orc boss) | `ogre` (DTS-II 32×36) | idle4+run4 | green warlord w/ club |
| 14 | golem_patriarch (big boss) | `big_zombie` (DTS-II 32×36, stone-grey tint) — alt: `monster_elemental_earth` ×2 (static) | idle4+run4 | grey mossy hulk = stone patriarch |
| 15 | dragon (final flying boss) | **`big_demon` (DTS-II 32×36)** + vertical hover-bob & shadow — *no dragon exists on 0x72 site* | idle4+run4 | red horned hulk, most "boss" presence |

**Spare/extra sprites for future content:** imp, zombie, ice_zombie, tiny_zombie, swampy, slug, tiny_slug, doc, pumpkin_dude (Halloween events), DTS-I statics (bat = cheap flying critter, bies/rokita/demonolog/tentackle = elite/boss variants, elementals fire/air/goo), µF mooseman. **Heroes/soldiers:** knight_m (tank), wizzard_m (mage), elf_m (archer — barracks archers), dwarf_m, lizard_m, all with idle+run+hit.

## 8. Verification

- `file` on all 3 project PNGs: valid PNG RGBA, non-empty (26.8 KB / 39.6 KB / 29.6 KB).
- DTS-II: 370/370 frames of `frames/` dir pixel-equal to atlas crops at tile_list coords (programmatic check).
- DTS-I: 242/243 slices pixel-equal (1 mismatch: `Wall_outline_2` — wall tile, irrelevant).
- µFantasy: 16/16 troll frames pixel-equal to atlas crops at all.json coords.
- Facing (RIGHT) verified by pixel analysis of masked_orc/knight/wizzard/imp/angel/weapon_axe + VLM cross-check (2 VLM runs; noise on big_demon/necromancer resolved by direct pixel reading — eyes/mask right-shifted).

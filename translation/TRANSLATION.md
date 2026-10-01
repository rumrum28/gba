# Summon Night: Swordcraft Story 3 — AI translation project

**Read this first after a `/clear` or restart.** This file is the source of truth for the project's state.
Update the **Progress log** at the bottom at the end of every session.

## Goal

Finish the English translation of
`Summon Night - Craft Sword Monogatari - Hajimari no Ishi (Japan)` (GBA, header `CRAFTSWORD`, code `B3CJ`).
The community calls it "Summon Night Swordcraft Story 3". Ship a `.bps` patch and **never distribute the ROM**.

## Strategy (decided 2026-09-28)

We **build on the AutomataVM/GBA-StoneOfBeginnings project** (GPL-3.0, https://github.com/AutomataVM/GBA-StoneOfBeginnings, last push 2025-12-15).
It already has everything hard: decompiled scripts, a script compiler/inserter, a VWF (variable-width font), graphics, and system text.
**Our job = translate the Japanese strings inside its script `.txt` files, fix the build failures, and build.**

Other sources:
- SNSC3Translation site (https://snsc3translation.github.io/) claims a full 1.0.3.f patch (2026-09-24), but the download 404s.
  The user thinks it's a placeholder. Check it again occasionally.
- github.com/wangds/sncsm3: the 2014 project our old `Summon_Night_Swordcraft_Story_3_Beta.bps` came from. Has `resources/Dialogue Encoding.txt` and old script translations (Day 0–3) that may be reusable.

## Files

| Path | What |
|---|---|
| `games/...(Japan).zip` | Original JP ROM, the clean base. Never modify. |
| `games/...(Japan) (patched).gba` | Old beta result (~8% translated). Just for reference now. |
| `translation/upstream/StoneOfBeginnings/` | Clone of the AutomataVM repo. **Our translations are edits in here** (gitignored in our repo). |
| `translation/upstream/StoneOfBeginnings/script/*.txt` | 1053 decompiled scripts, named by ROM offset (+ `script/Day2_scripts/` 51 files). UTF-8. |
| `translation/upstream/StoneOfBeginnings/system_messages/*.txt` | Items, menus, weapons, magic, etc. |
| `translation/tools/` | Our Node scripts (Python is NOT installed; Node v24 is). |
| `translation/work/` | `original.gba`, `build.log`, scratch (gitignored). |

⚠ `upstream/` and `work/` are gitignored, so **the translations live only on this disk**. Back up the `upstream/StoneOfBeginnings/script` folder regularly
(or fork the repo on GitHub and push there, which is the best option).

## How to build

```powershell
cd translation\upstream\StoneOfBeginnings
copy ..\..\work\original.gba swordcraft3.gba     # once
cmd /c "set NoDefaultCurrentDirectoryInExePath=&& build.bat < nul" > ..\..\work\build.log 2>&1
```
Output: `swordcraft3-test.gba` + `patches\swordcraft3.bps`. The env-var trick is needed because this shell won't run exes from the current dir otherwise.
Search `build.log` for `too large` / `Too many` / `error`.
**Note:** `build.bat` inserts only the scripts it lists (Day 0–2, restart-battle, some unsorted). Newly translated files must be ADDED to `build.bat`.

## Script format (upstream decompiled)

```
dialogtxt       "The portal is not activated."   ; one line of a dialogue box
code0309                                         ; end of box / wait for input
menutitle       "Return to dungeon?"
menutxt         @Label_00b6, "Quit"
```
- Translate ONLY the text inside quotes. Never touch opcodes, labels, or numbers.
- Consecutive `dialogtxt` lines = lines in one box. Look at already-translated files (e.g. `script/17221cc.txt`, Day 0/1) for line length and style.
- Scripts are inserted **in place**: the compiled script must fit the original slot. Error `New script is too large, X bytes out of Y` means the English must be shortened.
- `tools/status.js [--list]` counts JP vs EN strings per file.

## Status

- Counted with `tools/status.js` (Day2_scripts override root copies): **1052 scenes: 331 fully EN, 535 partial, 186 fully JP.**
  Strings: ~11,782 EN / ~28,826 JP (**~29% done**).
- Build: **clean, all scripts insert** (as of 2026-09-28, after the step 1 fixes).
- Remaining armips warning `areas 080A87CC and 080a880e overlap` is **harmless**: `asm/naming.asm` patches bytes inside a function that
  `asm/name_input.asm` (included later) fully rewrites, so the earlier patch is dead code. Left as-is.

## Upstream quirks to know

- `script/Day2_scripts/X.txt` = the translated version of `script/X.txt` (51 files). The root copies are stale and mostly JP. **Edit the Day2 copy.**
- Exception: `18c69fc` and `18c754c` exist in both folders as *different English versions*. `build.bat` inserts Day2 first, then the root copy under
  `::sidequests`, so **the root copy is the one in-game**. Pick one eventually.
- `build.bat` lists a few scripts twice (`172ea2c`, `1725f4c`, `172768c`). Harmless.
- Strings support `\"` escapes. A bare `"` inside a string breaks compilation ("Too many arguments").
- Some lines start with a full-width space `　` for indentation inside `( ... )` thought bubbles. Keep it.
- The male and female hero branches duplicate lines. Edit both copies identically (`tools/replace.js` replaces all occurrences).

## Our tools (translation/tools)

| Tool | Use |
|---|---|
| `status.js [--list]` | Count JP vs EN strings per scene |
| `plan.js [--all]` | Build list vs status: what to translate next |
| `boxes.js export/import <id>` | JP boxes → JSON for translation, and English back into the script |
| `parallel.js [--grep x]` | Upstream JP→EN corpus lookup |
| `addbuild.js "<comment>" <ids>` | Add scenes to build.bat |
| `fit.js <script.txt>...` | Dry-run insert: OK/FAIL + bytes spare in the slot (needs `swordcraft3-test.gba` from a build) |
| `replace.js <script.txt> <edits.json>` | Exact line replacements `[["old","new"],...]` (all occurrences). Backs up the upstream original to `work/backup/` |
| `lib.js`, `setup.js`, `scan.js` | ROM-level helpers (LZ77, block scan) |

## Batch workflow (how we translate)

1. Pick scenes: `node tools/plan.js --all` lists not-yet-built, mostly-JP scenes. Story order ≈ ROM offset order
   (Day 0 starts `17bcb2c`, Day 1 `17ccf1c`, Day 2 `17df6ac`–`17f44fc`, then continues upward).
2. `node tools/boxes.js export <id>` → `work/tl/<id>.json` (JP text boxes, with decompiler kana misreads fixed).
3. Write `work/tl/<id>.en.json` = `{ "<line>": ["en line 1", "en line 2"], ... }`.
4. `node tools/boxes.js import <id>` validates (≤3 lines/box, ≤38 chars, no JP, quotes escaped) and writes the script.
5. `node tools/fit.js upstream/StoneOfBeginnings/script/<id>.txt`. If over, tighten with `tools/replace.js` (it replaces ALL occurrences, so check duplicates first).
6. `node tools/addbuild.js "<comment>" <ids...>`, then build (see above), then copy `patches/swordcraft3.bps` → `build/SNSS3_EN_WIP.bps`
   and `swordcraft3-test.gba` → `games/Summon Night Swordcraft Story 3 (EN WIP).gba` (the web launcher has an entry for it in `js/app.js`).
- `node tools/parallel.js --grep <text>` searches ~1400 upstream JP→EN box pairs (from Day2 scenes) for how a term was translated before.
- If a re-export is needed after partial import, move the old `<id>.json`/`<id>.en.json` aside (export refuses to overwrite).

## Decompiler quirks in JP text

- `[NAME 4] [NAME 5] [NAME 6] [NAME 7] [NAME 8]` inside Japanese are **misread kana**: キ ソ ネ ポ レ (bytes 83 4C/5C/6C/7C/8C). `boxes.js export` fixes them.
- Real names = Greek letters in JP = `[NAME n]` in EN (bytes 83 C0+n): β=`[NAME 0]`, γ=`[NAME 1]` **partner**, δ=`[NAME 2]` **hero nickname** (β=`[NAME 0]` hero real name), ζ=`[NAME 4]` item name.
- Text commands: `dialogtxt` (box lines), `choicetxt`/`menutxt @label, "..."`, `menutitle`, `popuptxt`, `placetxt` (location), `dialogbig x,y,..., "..."`,
  plus `menutxtp`/`tabletxt`/`dictionarytxt` (mostly system_messages). Leave `setname`/`strlen` alone (engine default names).

## Translation style guide

- Box: max 3 lines, aim ≤34 chars per line (38 hard max). Continuation lines inside `( ... )` thoughts start with a full-width space `　`.
- Natural, casual English, not literal. Hero choices come in male/female pairs (オレ vs わたし). Usually the same English, just slightly different tone.
- Voices:
  - Robot partner: Title Case, formal ("Lady Murno", "Affirmative", "Roger"). Katakana speech.
  - Toramata (tiger youkai, じゃ/おぬし/ワガハイ): old-fashioned. Swears "by this topknot". Insists he's a tiger, not a cat.
  - Rude partner (キサマ): curt, "Tch".
  - Polite partner (ですわ): ladylike, "Lady Murno".
  - Master V.E (親方, アタシ/アンタ): tough, blunt woman. Her late husband(?) is Rob (ロブ).
  - Tier (ティエ): cheeky guide, trailing "~".
- **Glossary** (JP → EN): 親方 Master · ヴィー V.E (Murno calls her "Miss V.E") · ミューノ Murno (robot/polite: "Lady Murno") · アニキ Bro ·
  ロブ Rob · ジェイド Jade · サージ Sarge · ゴヴァン Govan · ボスタフ Bostaph · ディックル Deckell · ティエ Tier · トラマタ Toramata ·
  鍛冶師 Craftknight · 召喚獣 Summon Beast · はぐれ strays · バーム Baam (currency, our choice) · 転送の間 Teleportation Chamber ·
  ほほえみ亭 Smile Inn · マーネイル宿場 Marnail Station · コンシールの森 Conceal Forest · プロスバン Prosban · リィンバウム Lyndbaum ·
  ロシェ Roche (ours) · テュス Tyus (ours) · レミィ Lemmy · 召喚獣トロッコ Summon Beast trolley · ロレイラル Loreilal · シルターン Silturn ·
  サプレス Sapureth · メイトルパ Maetropa · 金の派閥 Auric Collective (upstream placetxt) · ベルヴォレン・リングヴァル Belvoren Ringvall (ours) · イアナ Iana (ours) ·
  自警団 town watch · ねえさん (Jade→V.E) sis · アニキ = Jade · イアナ・モーティア Iana Mortia (ours) · ミシュース村 Mishus Village ·
  ベンソン Benson (Benson's Workshop) · エリエ Elie (ours) · リュート岩窟 Lute Cave · ザック Zakk · スポート洞窟 Sport Cave (ours) · パイク Pike (ours) · ギラン Gilan (ours) · アニス Anis (ours) ·
  魔晶柱 Mana Crystal Pillar (ours) · グマグの炎遺跡 Ghumag Flame Ruins (upstream) · 裁きの間 Hall of Judgment · 幻龍鬼 Genryuki (ours) · レクイの水遺跡 Rekui Water Ruins (upstream) · 百里山 Hyakuri Mountain · トラム Tram · ギャラハン Gallahan · ルイーズ村 Louise Village · ヌシさま the Guardian (ours) · ウェルマン Welman (Murno's father, ours) · ヴォイジン Voijin (ours) · ゴヴァンの魔石 Govan's Demon Stone · マグドラド Magdrado (ours) · 不死身のジェイド the Immortal Jade · 魔石 Demon Stone · ベリートの森 Beleet Forest (upstream) · ピュビックの森 Pubick Forest · 西門 West Gate · スレンジ採掘場 Slenge Quarry (ours) · アカバネ Redwing (ours) · 商店通り Shopping Street · 南門 South Gate

## ROM facts (from our own analysis, still useful)

- 32 MB ROM (the GBA max). Only ~270 KB free at the end.
- Scripts = 1124 LZ77 blocks (`0x10` header) in `0x1720A8C–0x18C8D99`, decompressing to `PSI3` bytecode. No pointer table found, so everything is inserted in place.
- `tools/lib.js` has LZ77 compress/decompress + a block finder, and `tools/scan.js` compares two ROMs.

## Progress log

- **2026-09-28** — Analyzed ROMs. The beta only translated ~94/1124 script blocks. Wrote `tools/lib.js`, `setup.js`, `scan.js`.
- **2026-09-28** — Found the SNSC3 site (patch download 404s). Found AutomataVM repo, cloned it into `upstream/`, and a baseline build works.
  Wrote `tools/status.js`. Recorded the build failures above.
  **Next:** (1) fix the 5 failing Day 2 scripts, (2) pick the next batch of JP scripts in story order (Day 2 → Day 3...) and translate them, (3) add them to `build.bat`, build, and test in the emulator.
- **2026-09-28 — Step 1 done.** Fixed all 5 failing Day 2 scenes:
  - `17e49dc`: unescaped quotes in `"Code To "Enemy"."` → `\"Enemy\"`.
  - `17e5e5c` (8 spare), `17e967c` (12), `17f08ec` (20), `17f034c` (20): tightened wordy English to fit, meaning kept. Also fixed the typo "I guess that true" in 17f08ec.
    Edit lists are in `work/e_*.json` and upstream originals in `work/backup/`.
  - Wrote `tools/fit.js` and `tools/replace.js`. Made `status.js` aware of Day2 overrides.
  - Clean build → `build/SNSS3_EN_WIP.bps` (apply to the clean JP ROM) and `games/Summon Night Swordcraft Story 3 (EN WIP).gba` for testing.
  - **Needs play-test:** Day 2 scenes: Murno outside after the chief's house (17e5e5c), "Bro" night scene (17e967c), Master the night before the match (17f034c), the investigator "Of course it's you" scene (17f08ec), and the robot "Enemy" identification scene (17e49dc).
  - **Next:** step 2. Find which JP scenes come next in story order (Day 2 leftovers, then Day 3). Need a way to map offsets → story day (upstream `build.bat` sections + wangds `resources/Main Script` names help).
- **2026-09-28 — Step 2, batch 1 done.** User play-tested the WIP ROM in the launcher: no crashes.
  - Found **113 scenes already fully English upstream but missing from `build.bat`** (location names, menus, short events). Added them.
  - Fixed stray JP in built scenes: teleporter menu (1721b4c), "carry only one weapon" popups (1725f4c, 1726cac, 1726e0c, 1726f6c, 17271dc),
    17386cc, and 18c33ec, where upstream had **mistranslated "また、いつか頼むよ" as a second "Here, your reward."** (now "I'll ask you again sometime.").
  - Translated **batch 1 = 8 Day 2 scenes**: 17f160c 17f190c 17f1f0c 17f259c 17f2c8c 17f358c 17f3a3c 17f49ec
    (before the match with Master, the match and its aftermath, departure, meeting Tier the guide). Tools added: `plan.js`, `boxes.js`, `parallel.js`, `addbuild.js`.
  - Build clean. `build/SNSS3_EN_WIP.bps` = 685 KB. Status: 347 done / 521 partial / 184 JP scenes.
  - **Needs play-test:** Day 2 from the match with Master V.E through meeting Tier on the road to town.
  - **Next batch:** continue in offset order after `17f49ec`: 17f529c, 17f5e7c, 17f63dc, 17f6cdc, 17f78ac, 17f7cfc, 17f871c, 17f8f0c ...
- **2026-09-29 — Batch 2 done:** 17f501c 17f529c 17f5bcc 17f5e7c 17f63dc 17f6cdc 17f78ac (Tier's half-price haggling, V.E pays,
  stray Summon Beast fight, arguing with Tier → match vs Tier to get the guide fee back). All fit first try. New `tools/build.js` = build + copy outputs (~10 s).
  User was at the end of Day 1 (Murno waking up, `17ddaec`) when this batch was made.
- **2026-09-29 — Batch 3 done:** 17f7cfc 17f871c 17f8f0c 17fa00c (Tier loses and "gets hurt", Marnail Station, Smile Inn: Tier's mom Roche,
  Jade eating cake, Tier runs off, the search begins). New names: Roche (ロシェ, our spelling), Smile Inn, Conceal Forest, Lyndbaum (upstream spellings).
- **2026-09-29 — Batch 4 done:** 17fa2fc 17fae8c 17fbc3c (thugs searching for a kid with a Summon Beast, fight to protect Tier, Tier's job offer,
  partners can't talk about Murno, meeting Lemmy + friend hauling ore by trolley). Worlds: Loreilal, Silturn (upstream), Sapureth, Maetropa (official spellings).
  Confirmed: `[NAME 0]` = hero's real name, `[NAME 2]` = hero's nickname (17fae8c line ~142).
- **2026-09-29 — Batch 5 done:** 17fc50c (Smile Inn: Tier's dad Tyus, Tier claims the hero, Murno storms off jealous, "your smiles as payment").
  New name: Tyus (テュス, our spelling). `boxes.js import` now auto-escapes plain `"` in translations.
- **2026-09-29 — Batch 6 done:** 17fddbc 17fe06c 17fe32c 17fe76c 17fea8c 17ff12c (bridge is out, night at the inn: Murno hurt by the
  "husband/star attraction" talk, each partner warns the hero). Repeated hero lines are worded identically on purpose.
- **2026-09-29 — Batch 7 done:** 17ffd2c 18003cc 1800aac 180119c 180184c (night talk menu: Master about Rob, Lemmy, Bro, Tier's inn plan).
  Note: `◎` (heart) only appears upstream in `dialogbig`. In `dialogtxt` we use `~` instead, since the VWF may not have the glyph.
- **2026-09-29 — Batch 8 done:** 1801b4c 180238c 1802b8c 180344c (next morning: one room only, partners tease the hero, Tier tags along,
  Murno drags V.E ahead, alarm bell near town, arrival at Prosban and ambush).
- **2026-09-29 — Batch 9 done:** 1803a6c 1804a0c 1804cdc 18052cc 180572c (after the ambush: Jade of the town watch, Tier demands an
  "extermination fee", Murno asks about Belvoren Ringvall, V.E goes to Bostaph's, walk to the Gold Faction).
- **2026-09-29 — Batch 10 done:** 1805d4c 1806a5c 1806e3c (Gold Faction: Iana Mortia, Belvoren recognizes Murno from Mishus Village, she collapses,
  Iana takes Tier aside; Jade brings the hero to Benson's Workshop, meets little Elie, escorts her to Lute Cave).
- **2026-09-29 — Batch 11 done:** 1807ebc 18087bc 1808aac 1808fac 180945c (Zakk: V.E is rampaging at Bostaph's; heading to Lute Cave with Elie;
  being followed; Bostaph apprentices confront the hero).
- **2026-09-29 — Batch 12 done:** 1809b7c 180a7ac (Lemmy defends the hero from Bostaph's apprentices, warns about Belvoren;
  deeper in Lute Cave: giant strays, "the Steel Pike" (パイク → Pike, ours), dressed like Murno's pursuers).
- **2026-09-29 — Batch 13 done:** 180b34c 180bd3c 180c0ac (Tier catches up and takes Elie home; Pike wants pain; Gilan (flamboyant, "ボク") and
  Anis arrive; Bostaph appears: blames "the girl with the Summon Beast" for the strays, his scar and Rob's death).
- **2026-09-29 — Batch 14 done:** 180d5cc 180dd6c 180e05c 180e95c 180ec7c (partners want to leave town, hero can't tell V.E about Murno;
  Pike attacks the partner ("Summon Beasts are tools"); night: Murno says she still has something to do in town).
  Centered monologue lines are padded with ASCII spaces to ~35 chars, like upstream does.
- **2026-09-29 — Batch 15 done:** 180f22c 181004c (night: each partner says they'd quit being the hero's partner to protect Murno;
  V.E: "You're not alone"). Upstream phrase reused: "A Craftknight promise is stronger than steel."
- **2026-09-29 — Batches 16–17 done:** 18106fc 1810cbc 181120c (night talk menu: Lemmy on patrol, Jade "don't stick your neck out",
  Tier cheers the hero up) + 181177c 1811a9c 1811fbc 1812bfc (next day: Murno helping at Benson's, Jade's fragile-delivery errand, "don't run!").
- **2026-09-29 — Batch 18 done:** 181340c 1813a0c 18142fc 181463c 18150ac 181550c 181594c (alarm at the South Gate, Murno has gone missing;
  Belvoren told her the rumor of a girl with a Demon Stone controlling strays; she and Tier went to Beleet Forest; fights on the way).
- **2026-09-29 — Batch 19 done:** 1815ccc 18168dc (Beleet Forest: "the Immortal Jade" (upstream term) and Lemmy after the fight, the Bostaph-hired trio
  is missing; V.E demands answers; injured Tier: Murno ran and the trio chased her; V.E takes Tier back to town, Jade joins the hero).
- **2026-09-29 — Batch 20 done:** 181739c (the trio corners Murno for the Demon Stone; Anis calls Murno the real villain; Murno asks the hero
  not to get involved; partners rally the hero).
- **2026-09-29 — Batch 21 done:** 181814c 1818c7c (Gilan wants the hero as a "little sister/brother"; Lemmy joins to keep Bostaph's hired help in check;
  Anis knows Rob and swears revenge, summons Magdrado; partners' tactic: target the summoner).
- **2026-09-29 — Batch 22 done:** 181a27c 181afac 181b2cc 181b76c 181ba9c (Magdrado beaten; Anis: "Voijin died because of the Demon Stone";
  everyone falls; the hero wakes up jailed, weapons gone; Murno in the next cell tells the story of Govan's Demon Stone and her village).
- **2026-09-29 — Batch 23 done:** 181c3ac (jail: the partner, restrained by a power-sealing bracelet, explains Govan's Demon Stone; Murno's father Welman;
  the hero vows to protect Murno together). Big 4-variant scene generated with `work/tl/make_181c3ac.js` (shared hero lines).
- **2026-09-29 — Batch 24 done:** 181e00c 181e37c 181e71c 181ed8c (Louise Village: Tram's people think the hero is one of "Voijin's lackeys";
  Anis is actually from this village; Murno explains; talk of "the Guardian"; smith Gallahan will test if the hero is a real Craftknight).
- **2026-09-29 — Batch 25 done:** 181feac 18202dc 18208ec 182130c (Gallahan's test: weapon quiz (upstream weapon names Sword/Axe/Knuckle...),
  repairing a broken sword; Gallahan removes the partner's bracelet and his aura scares them).
  **Next:** continue at 182173c (Louise Village), then 1821ecc 18223bc 182261c 1822fec 18235bc ...
- **2026-09-29 — Batch 26 done:** 182173c 1821ecc 18223bc (a villager frees the hero: Murno will be fed to the Guardian in the Requi Water Ruins (ours)).
- **2026-09-29 — Batch 27 done:** 182261c 1822fec 18235bc 182394c (hero smashes the partner's bracelet, sneaks through Louise Village).
- **2026-09-29 — Batch 28 done:** 1823d3c 182427c 18246ac (borrowing Gallahan's workshop, entering the Requi Water Ruins).
- **2026-09-29 — Batch 29 done:** 1824c5c 182554c 1825aec 18262ac (Requi Water Ruins: an illusory Tier begs the hero to turn back, attacks,
  and vanishes; the party briefly forgets Murno; a voice like Master's calls out).
- **2026-09-29 — Batch 30 done:** 18266bc 1826e7c 182741c (illusory Master V.E and Jade try to send the hero home, then attack; second memory
  lapse (1826e7c = identical copy of 182554c); the party figures out the ruins' aura makes illusions).
- **2026-09-29 — Batch 31 done:** 18279fc 1827fac 182854c (illusory Murno "escaped", then claims she was Voijin's accomplice; partners see through it.
  1827fac = copy of the memory-lapse scene; 182854c generated by `work/tl/make_182854c.js`).
- **2026-09-29 — Batch 32 done:** 182902c 1829cdc (choice: trust fake Murno or the partner; a fake hero taunts ("quit acting tough"); fake partners;
  the real partner proves itself; generated with `work/tl/make_182902c.js`).
- **2026-09-29 — Batch 33 done:** 182a76c 182b50c (the hero was framed; Anis tells Tram the hero is a thief; Tram summons the Guardian Genryuki;
  the partner transforms for the first time to protect the hero). Toramata: "once feared as [NAME 1] of Hyakuri Mountain".
- **2026-09-29 — Batch 34 done:** 182c12c (Genryuki accepts the hero; Gallahan brings Murno; Anis slips about the sleep bomb and is arrested;
  Murno recognizes the Mana Crystal Pillars; Gallahan sets a one-on-one match with Tram in the Hall of Judgment for access to the Gumag Fire Ruins).
- **2026-09-29 — Batch 35 done:** 182d6fc 182d99c 182dccc 182e08c (narration: match with Tram tomorrow, staying at Gallahan's; night talk with Murno).
- **2026-09-29 — Batch 36 done:** 182e64c (night before the Tram match: talk with each partner about their transformation; generated by make_182e64c.js).
- **2026-09-29 — Batch 37 done:** 182f92c 183013c (match morning: partners insist on coming; Murno wants to attend; Gallahan is the witness).
- **2026-09-29 — Batch 38 done:** 1830bac 183166c 1831fcc 18327bc (match rules (one weapon), Gumag Fire Ruins with lava, Tram escorts Murno ahead,
  Hall of Judgment legend, the match starts).
- **2026-09-29 — Batch 39 done:** 1832e0c 1833a4c (hero beats Tram; the ruins guard Magdrado's Summon Stone; Tram tells how Voijin's gang
  took hostages, killed his parents and Gallahan's family, and Anis gave herself up with Magdrado to save the village).
- **2026-09-29 — Batch 40 done:** 18345ac 1834d0c (Magdrado's altar; the Mana Crystal Pillar's wave resonates with Govan's Demon Stone,
  like what they felt fleeing Murno's village; Magdrado goes berserk).
- **2026-09-29 — Batch 41 done:** 1835afc (Magdrado rampages; Tram readies Genryuki; the partner/hero insist on helping; hero is sent to bring Anis
  from the jail; Murno goes with Gallahan). Status after this: ~21.4k EN / ~19.3k JP strings.
- **2026-09-29 — Batch 42 done:** 18369ac 1836fbc 183784c (jail guard ran off; hero breaks Anis out; partners distrust her; Magdrado won't obey Anis,
  Tram is hurt, the hero finds the Summon Stone and summons Genryuki).
- **2026-09-29 — Batch 43 done:** 183863c 1838dac (Magdrado is sent back; Anis escapes with its Summon Stone; the pillar reacted to the Demon Stone;
  Murno decides to head for Mishus Village; Tram lets them leave).
- **2026-09-29 — Batch 44 done:** 183968c 183992c 183a04c 183a96c 183ad8c 183b4bc (Tram gives a Guardian scale charm, tearful Gallahan goodbye;
  plan: head near town first; reunion: V.E / Jade find the hero (two variants depending on who finds them)).
- **2026-09-29 — Batch 45 done:** 183bb6c 183c32c 183cd5c (Tier hugs the hero half to death; everyone gathers; the hero explains; Lemmy refuses to believe
  Bostaph is involved, fights, then runs off to warn Bostaph; V.E sends everyone to rest at Jade's).
- **2026-09-29 — Batch 46 done:** 183d4fc 183db0c 183debc 183e21c (back at Benson's: Elie, Zakk, taciturn Benson; night talk menu; Murno night talk).
- **2026-09-29 — Batch 47 done:** 183e84c (night: partner talk; the rallying cry reuses upstream's "To a Craftknight!" / "The hammer is...").
- **2026-09-29 — Batch 48 done:** 183f5ac 183fcbc 184024c 184089c 1840e9c (night talk menu: V.E (stew, "Randy the cat", rock 'n' roll lullaby),
  Lemmy hasn't told Bostaph, Jade blames himself for the cliff, Tier was truly worried).
- **2026-09-29 — Batch 49 done:** 184119c 184183c 184202c (Day 7 morning: partners tease the hero before the Gold Faction meeting; Elie worried Bostaph
  is "suspicious"; V.E: "Serious mode!"; Tier sneaks off to do business).
- **2026-09-29 — Consistency fix:** upstream `placetxt` (location banners) already names places, so our dialogue now matches it:
  Gold Faction → **Auric Collective**, Berito Forest → **Beleet Forest**, Requi → **Rekui Water Ruins**, Gumag Fire → **Ghumag Flame Ruins**.
  New tool `tools/rename.js "Old" "New" [--dry]` renames across our translated scripts + en.json and flags lines > 38 chars.
  **Rule:** before inventing a place name, check `grep -rh "^placetxt" upstream/StoneOfBeginnings/script | sort -u`.
- **2026-09-29 — Batch 50 done:** 184295c 184357c (meeting at the Auric Collective: Belvoren visited Mishus Ruins before Rob's death;
  Bostaph refuses to doubt Anis; Iana returns the Stone but Murno is still under suspicion; search teams: Jade → Beleet Forest,
  V.E → Lute Cave, hero → Pubick Forest; Slenge Quarry has the man-eating "Redwing").
- **2026-09-29 — Batch 51 done:** 1843fec 184466c 1844ffc 184566c 1845d2c (the hero tries Benson's one-word "Mm" on the partner; Zakk, "town's best
  informant", says Anis's gang hides in Slenge Quarry; Tier and Zakk go get V.E/Jade; Lemmy "forging weapons" at the quarry; a lookout).
- **2026-09-29 — Batch 52 done:** 184609c 184662c 184730c 184783c 1847ebc (Slenge Quarry hideout: lookout thugs, Anis, Gilan; Gilan grabs the hero,
  plans to trade them for the Stone, gets called "creep" and turns scary). Note: Gilan calls the MALE hero "little sister" and the
  FEMALE hero "little brother" (reversed on purpose in the JP).
- **2026-09-29 — Batch 53 done:** 18488fc 18499ec (the hero wakes up captive; partner held by Pike next door; Anis: "Rob was a murderer, he killed
  my master Voijin"; Voijin wanted to "free humanity from Summon Beasts" with the Demon Stone; Lemmy breaks in, the barrier breaks,
  Redwing is loose, Lemmy stays to hold it off).
- **2026-09-29 — Batch 54 done:** 184a4bc 184aaec 184b40c 184b99c (free the partner; choose to go back for Lemmy; beat Redwing together;
  V.E, Jade, Tier, Zakk arrive; "Anis's gang deceived Bostaph"; Lemmy is Iana's son).
- **2026-09-29 — Batch 55 done:** 184c6ac 184ca5c 184cecc 184d1ec 184d79c (narration: Murno cleared, Bostaph will help; the hero can't shake
  "Rob was a murderer"; night talks: Murno "promise you'll come back", partners vow revenge on Gilan/Pike).
- **2026-09-29 — Batch 56 done:** 184e4dc 184ebac 184f28c 184f86c 184fdfc (night talk menu: V.E recalls Rob went out alone and Bostaph brought back
  the pick she gave him; Lemmy apologizes; Jade asks if a Summon Beast was with Lemmy ("he still..."); Tier comforts the hero).
- **2026-09-29 — Batch 57 done:** 185014c 18508dc 1850cdc (Day 8: partners want revenge, the hero insists on capture; alarm, Jade goes to fight strays;
  V.E, Tier and the hero search for Anis's gang, Murno stays with the Stone).
- **2026-09-29 — Batch 58 done:** 185145c 1851d9c 185243c (Belvoren brings a tip: Anis's ally seen at Lute Cave; V.E brushes him off;
  following a thug into a sealed-off area, Tier keeps watch "for free"; the party gets spotted).
- **2026-09-29 — Batch 59 done:** 185282c 1852bec 185376c 18539bc 1853e6c (Lute Cave was a trap; Anis's gang raided Benson's workshop holding
  Murno's father hostage and took Murno; V.E goes back to Benson; Zakk followed them and got hurt; they went through to Sport Cave).
- **2026-09-29 — Batch 60 done:** 18544dc 1854c0c 185584c (Pike demands a duel ("give me pain!"), V.E storms in and beats him ("that's for Zakk!");
  Gilan/Pike taunt V.E as "a Summon Beast from the Nameless World" (**V.E is a Summon Beast**); Jade arrives; the hero takes on Gilan
  to prove Master taught right). V.E's slur オカマ rendered as "dandy" (deliberately softened).
- **2026-09-29 — Batch 61 done:** 18562bc 1856cdc (hero beats Gilan, "A. Po. Lo. Gize."; V.E kicks him where it hurts; deeper in, Anis holds Murno
  with her father Welman as hostage, abandons Gilan/Pike, attacks the helpless hero; Murno cries "Stop it!").
- **2026-09-29 — Batch 62 done:** 18578fc 18588ac 185939c (Tier and Lemmy free Welman; V.E and Jade chase Gilan/Pike; the hero fights Anis and
  Magdrado; Anis breaks down ("no no no"); Magdrado goes berserk; victory; V.E takes Magdrado's Summon Stone and will question Anis about Rob;
  "you two totally rocked!"; the Demon Stone still needs returning; Murno cries with relief).
- **2026-09-29 — Batch 63 done:** 185a29c 185a61c 185a9dc (narration: Anis handed over, Welman resting; night: Murno asks to make a weapon
  together with the hero tomorrow).
- **2026-09-29 — Batch 64 done:** 185b1ec (night: each partner reflects on being a Craftknight's partner; robot on having a "soul";
  "is there anything left undone before returning the Stone?").
- **2026-09-29 — Batch 65 done:** 185c31c 185ca4c 185d13c (night talk menu: V.E will test the hero tomorrow since the partner will leave after the Stone
  is returned; Lemmy defies his mother to help Bostaph; Jade will show the one weapon Rob approved of).
- **2026-09-29 — Batch 66 done:** 185d75c 185dfac 185e2fc 185e9cc 185eebc (Tier agrees to stay home if the hero walks her back; Day 9: Murno
  sends the partner away to forge alone with the hero ("there isn't much time left"), then asks for a real sparring match).
- **2026-09-29 — Batch 67 done:** 185f1cc 185f7fc (partner walks in on the sword lesson, joins practice; "I won't forget today...";
  each partner challenges the hero to a rematch, now at full power; the hero insists on using only one weapon).
- **2026-09-29 — Batch 68 done:** 18608fc 1860dbc 186159c (rematch results: robot learns "the weight of souls", cries with an "unknown system error";
  Toramata tells of being feared and hated as a mountain guardian in Silturn, thanks the hero for teaching him fun battles exist).
- **2026-09-29 — Batch 69 done:** 1861dec 18628fc (rude partner explains its debt to Murno: she faced the barking dog Gau (our spelling) for it;
  now leaves Murno to the hero and will "focus on protecting only you"; polite partner admits being a scaredy-cat teased by her brother in
  Maetropa, asks to hold the hero's hand when scared).
- **2026-09-29 — Batch 70 done:** 18632cc 186398c 1863f3c 186424c (partners go talk with Murno; V.E has the hero repair the axe she made with Rob,
  then fights them with it and loses; she resolves to move on as "the second Master" and rock all of Lyndbaum).
- **2026-09-29 — Batch 71 done:** 186491c 1864e4c 186568c 186593c (Iana forbids Lemmy to go; the hero and Lemmy duel one-on-one; Lemmy opens up:
  after his father died his mother became Belvoren's secretary for the Mortia family's standing; Bostaph accepted him as a person but changed
  after his wife left; "supporting each other is what family is").
- **2026-09-29 — Batch 72 done:** 186653c 1866d5c 186707c (Jade shows the Excel Knuckles (upstream item name) Rob approved of; the hero duels him and
  breaks them; Jade acknowledges the hero as Rob's true successor).
- **2026-09-29 — Batch 73 done:** 18677dc 1867ddc 186810c 186880c (walking Tier home to the Smile Inn; Tier insists on coming to Mishus Village,
  challenges the hero to prove herself; the hero fights for her parents' sake).
- **2026-09-29 — Batch 74 done:** 1868b9c 186961c (Tier loses but cries; her parents beg the hero to take her; it was an act, "Suc-cess!";
  Welman, not fully recovered, went to the Auric Collective when summoned and comes back acting strangely cold).
- **2026-09-29 — Batch 75 done:** 186a25c 186aa1c 186b01c 186b32c 186b66c 186b96c 186bf2c (Murno's sparring match (the partner mistakes it for an
  attack), match intro lines for partner/V.E/Lemmy/Jade, Lemmy recovered; Day 10: Murno and Welman are missing).
- **2026-09-29 — Batch 76 done:** 186c49c 186ca0c (Day 10: searching for Murno and Welman; Anis's gang escaped with Welman's help
  and fled via the West Gate to Sport Cave; Tier stays behind to watch the town since V.E is hopeless with directions; Belvoren is brushed off).
- **2026-09-29 — Batch 77 done:** 186d88c 186eb6c 186f80c 186fcdc 18700ec (Day 10: the hero finds Murno leaving with Welman and Anis's gang;
  Welman says they're going home, Murno tells the hero not to follow; V.E slaps sense into the hero ("If Murno told you to die, would you die!?");
  showdown: V.E and Jade hold off Gilan/Pike so the hero can chase Murno ("the man/woman I believe in!"); Anis retreats with Murno;
  the ruined Mishus Village; on to the Govan Ruins (upstream name)). Build clean. ~29.0k EN / ~11.6k JP.
  **Next: 18706ec**, then 1870c0c 187185c 187314c 187409c ... 187f5dc, then 188xxxx, then side content 172–17b.

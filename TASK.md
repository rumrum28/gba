# Task: Personal GBA web launcher

## Goal
Browser-based GBA game launcher (HTML/CSS/vanilla JS, no build tools) for personal use,
hosted on GitHub Pages later. Runs `games/pokemon-fire-red.gba` via EmulatorJS (mGBA-wasm
core loaded from CDN). Requirements given by user: game-card launcher, fetch ROM + .sav
from `/games`, IndexedDB autosave with newer-wins vs server file, Download/Import Save
buttons, 3 save-state slots, custom keybinds in localStorage, on-screen touch controls,
Gamepad API, pause/fast-forward/volume/fullscreen, Pokemon-inspired retro theme (no
Nintendo assets), optional save.php/Node upload endpoint with a secret key, deployment
instructions.

## Status: done, verified working in browser

All files written: `index.html`, `css/style.css`, `js/app.js`, `server/save-server.js`,
`README.md`. Verified locally (node one-off static server + claude-in-chrome): launcher
grid renders, ROM boots via EmulatorJS/mGBA, save-state slots save/load, Download Save,
Mute toggle — no console errors. A "Mute" button was added to the custom top toolbar
(next to Download/Import Save) per a follow-up ask; uses the confirmed real
`EJS_emulator.setVolume(0 / .volume)` + `.muted` API from frontend.js.

## Possible follow-ups (not requested yet, don't do unless asked)
- Add cover art images under `games/covers/` (currently falls back to a placeholder).
- Wire up `UPLOAD_ENDPOINT`/`UPLOAD_SECRET` in `js/app.js` if the user actually runs
  `server/save-server.js`.
- Double check the shipped ROM at `games/pokemon-fire-red.gba` — it's actually a ROM
  hack ("Pokemon Unbound"/"SKELI" watermark), not vanilla Fire Red. Cosmetic only
  (filename/title in GAMES array), user's own file, not something to "fix" unprompted.

## Key research findings (don't re-derive these)
- Use EmulatorJS: `EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/"`, then
  `<script src=".../data/loader.js">`. `EJS_core = "gba"` (mGBA core under the hood).
  Confirmed from EmulatorJS/EmulatorJS `data/src/emulator.js` on GitHub (main branch).
- Confirmed real config vars (from source, not just docs): `EJS_gameUrl`, `EJS_gameName`,
  `EJS_gameId`, `EJS_biosUrl`, `EJS_color`, `EJS_backgroundColor`, `EJS_alignStartButton`,
  `EJS_startOnLoaded`, `EJS_fullscreenOnLoad`, `EJS_volume`, `EJS_defaultControls`,
  `EJS_controlScheme`, `EJS_VirtualGamepadSettings`, `EJS_Buttons`, `EJS_cheats`,
  `EJS_disableDatabases`, `EJS_fixedSaveInterval` (ms interval that auto-persists SRAM via
  `gameManager.saveSaveFiles()` into the emulator's own storage — this is what gives us
  "survives refresh" almost for free), `EJS_loadState` (URL to a savestate blob, auto
  loaded on boot — NOT the same as an SRAM .sav, don't conflate).
- Documented callbacks (options page): `EJS_onSaveState`, `EJS_onLoadState`,
  `EJS_onSaveSave` (overrides default SAV-download behavior, receives
  `{screenshot, format, save}`), `EJS_onLoadSave` (overrides default file-picker when the
  built-in "Import Save File" button is clicked), `EJS_onSaveUpdate` (fires on detected
  SRAM changes with `{hash, save, screenshot, format}` — this is our hook for
  auto-mirroring saves into IndexedDB), `EJS_onGameStart`, `EJS_ready`, `EJS_onExit`.
- Built-in toolbar already ships "Export Save File" / "Import Save File" buttons
  (`EJS_Buttons.saveSavFiles` / `loadSavFiles`) — real, tested, native file-picker/download.
  We reuse these via the callbacks above rather than reimplementing SRAM read/write via
  undocumented `gameManager.FS` internals (too version-fragile to hardcode).
- No official "preload SRAM save from a URL" config exists. Design decision: rely on
  EmulatorJS's own automatic same-browser persistence for "survives refresh"; for
  cross-device sync, ship the server `.sav` and have the user click the (real, native)
  Import Save File button once per new device — plus an optional convenience "Load
  server save" button that fetches the bytes and feeds them through the documented
  `EJS_onLoadSave` override.

## File plan
- `index.html` — launcher grid + emulator screen + control bar (exists, stub only so far)
- `css/style.css` — retro red/white pixel theme, responsive, on-screen dpad layout
- `js/app.js` — games array, card rendering, EmulatorJS bootstrap, save IndexedDB logic,
  keybind remap UI + localStorage, gamepad polling glue (EmulatorJS handles most of this
  itself, we just theme/wire buttons), save-state slot UI (3 slots via
  EJS_onSaveState/onLoadState + IndexedDB)
- `games/pokemon-fire-red.gba` — already present (user's own ROM)
- `games/savefiles/` — already present, empty
- `server/save-upload.example.js` (or `save.php`) — optional upload endpoint with shared
  secret header, off by default, documented in README
- `README.md` — setup + local test + GitHub Pages deployment steps

## Next steps when resuming
1. Write `css/style.css`
2. Write `js/app.js`
3. Rewrite `index.html` to wire it all together
4. Add optional upload endpoint + README
5. Test locally with a static server (GitHub Pages needs no build step, but ES modules /
   fetch of local files require serving over http://, not file://)

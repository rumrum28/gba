# GBA Launcher

A personal, browser-based Game Boy Advance launcher. Plain HTML/CSS/JS, no
build step. The actual emulation is done by [EmulatorJS](https://emulatorjs.org)
(a WebAssembly build of the mGBA core), loaded from its CDN - nothing here
reimplements a GBA emulator.

For personal use with ROMs you own. Don't distribute copyrighted ROMs or the
`games/` folder publicly.

## Project structure

```
index.html
css/style.css
js/app.js                  <- games list + all launcher/save logic
games/pokemon-fire-red.gba <- your ROM (already present)
games/savefiles/           <- shipped .sav files, one per game
server/save-server.js      <- optional local upload endpoint (see below)
```

## Run it locally

Browsers block `fetch()` of local files under `file://`, so serve the folder
over `http://` instead. Any static server works, e.g. from this folder:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open the printed `http://localhost:...` URL. Click a game card to boot it.

## Adding more games

Edit the `GAMES` array at the top of `js/app.js`:

```js
{
  id: "my-game",                       // unique, becomes the save/state key
  title: "My Game",
  rom: "games/my-game.gba",
  save: "games/savefiles/my-game.sav", // optional - fine if it doesn't exist yet
  cover: "games/covers/my-game.png",   // optional - falls back to a placeholder
}
```

Drop the `.gba` file in `games/` and it shows up on the launcher screen.

## How saves work

- **While playing**, EmulatorJS auto-checks the cartridge save every 5s and,
  whenever it actually changed, the launcher mirrors it into IndexedDB. Reloading
  the page restores it automatically - no button needed.
- **On a fresh browser/device**, the launcher fetches `games/savefiles/<id>.sav`
  and loads it in automatically the first time you start the game there.
- **Download Save** grabs the current in-game save and downloads it as
  `<id>.sav`. Upload that file into `games/savefiles/` (or push it to your repo)
  to carry progress to another device.
- **Import Save** lets you pick any `.sav` file from disk and load it into the
  running game immediately.
- Whichever is newer (your IndexedDB copy vs. the shipped server file, compared
  by save time) wins when a game starts.

### Optional: auto-upload saves to a server
GitHub Pages is static and can't receive uploads, but if you self-host
(a home server, VPS, or just `localhost` while testing), you can auto-POST
each downloaded save straight into `games/savefiles/`. This is already wired
up in `js/app.js`:

```js
const UPLOAD_ENDPOINT = "http://localhost:8787/save";
const UPLOAD_SECRET = "b367c1263f4d50ab4c9489a4e2e1f6d8"; // must match SAVE_UPLOAD_SECRET
```

To turn it on, start the matching server with the same secret:

```bash
SAVE_UPLOAD_SECRET=b367c1263f4d50ab4c9489a4e2e1f6d8 node server/save-server.js
```

Clicking **Download Save** now also POSTs the bytes to that endpoint
(authenticated via the `X-Save-Key` header), so random visitors can't overwrite
your saves. If you deploy the launcher itself somewhere public while pointing
at a real (non-localhost) upload server, generate your own secret instead of
reusing the one above:

```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

and put it in both places. To disable auto-upload again, set
`UPLOAD_ENDPOINT = ""` in `js/app.js`.

## Save states

Three slots per game, stored in IndexedDB (independent from the cartridge
`.sav`/autosave system above). Use the Save/Load buttons under the emulator.

## Controls, fullscreen, volume, fast-forward, gamepad

These are all provided by EmulatorJS's own control bar under the game screen:
- Keyboard remapping: the controller icon opens "Control Settings", which
  saves your bindings to `localStorage` automatically.
- On mobile/touch, a virtual D-pad + A/B/L/R/Start/Select overlay appears
  automatically.
- Gamepad API support is automatic - connect a controller and it's picked up.
- Play/Pause, Fullscreen, and the Settings menu (fast-forward ratio, volume,
  rewind) are built into the same bar.

The launcher recolors this bar (`EJS_color`) to match the red/white theme but
doesn't reimplement any of it.

## Deploying to GitHub Pages

1. Commit everything (make sure your ROM's license/ownership is something
   you're comfortable with - GitHub Pages is public by default unless the
   repo is private with Pages on a paid plan).
2. Push to a GitHub repo.
3. Repo Settings -> Pages -> Deploy from branch -> pick `main` and `/ (root)`.
4. Your launcher will be live at `https://<user>.github.io/<repo>/`.

No build step is needed - it's the same static files as local testing.

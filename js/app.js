"use strict";

/* =========================================================================
   GAMES LIST
   Add more .gba games by adding entries here. `id` must be unique and is
   used as the IndexedDB key and the default save/state filenames.
   ========================================================================= */
const GAMES = [
  {
    id: "pokemon-fire-red",
    title: "Pokemon Fire Red",
    rom: "games/pokemon-fire-red.gba",
    save: "games/savefiles/pokemon-fire-red.sav",
    cover: "games/covers/pokemon-fire-red.svg", // optional; falls back to a placeholder if missing
  },
  {
    id: "summon-night-Craft-sword-monogatari-hajimari-no-ishi",
    title: "Summon Night - Craft Sword Monogatari - Hajimari no Ishi",
    rom: "games/Summon Night - Craft Sword Monogatari - Hajimari no Ishi (Japan) (patched).gba",
    save: "games/savefiles/Summon Night - Craft Sword Monogatari - Hajimari no Ishi (Japan) (patched).sav",
    cover: "games/covers/Summon Night - Craft Sword Monogatari - Hajimari no Ishi (Japan) (patched).svg", // optional; falls back to a placeholder if missing
  },
  {
    id: "summon-night-swordcraft-story-3-en-wip",
    title: "Summon Night Swordcraft Story 3 (EN WIP)",
    rom: "games/Summon Night Swordcraft Story 3 (EN WIP).gba",
    save: "games/savefiles/Summon Night Swordcraft Story 3 (EN WIP).sav",
    cover: "games/covers/Summon Night Swordcraft Story 3 (EN WIP).svg", // optional; falls back to a placeholder if missing
  },
];

/* =========================================================================
   OPTIONAL server upload endpoint (see server/save-server.js in the repo).
   Leave UPLOAD_ENDPOINT empty to hide the "Upload to server" button - this
   only works when self-hosting the server script; GitHub Pages is static
   and cannot run it.
   ========================================================================= */
const UPLOAD_ENDPOINT = "http://localhost:8787/save";
const UPLOAD_SECRET = "b367c1263f4d50ab4c9489a4e2e1f6d8"; // must match SAVE_UPLOAD_SECRET on the server

/* =========================================================================
   OPTIONAL cloud save (see server/apps-script/Code.gs).
   A Google Apps Script Web App backed by your Drive - unlike UPLOAD_ENDPOINT
   above (localhost only), this is reachable from any device anywhere, which
   is what actually makes "play on my phone, continue on my laptop" work.
   Leave CLOUD_SAVE_URL empty to disable it entirely.
   ========================================================================= */
const CLOUD_SAVE_URL = "https://script.google.com/macros/s/AKfycbwdCMqr8rJqMIBWA2r-hex1eTpEZsoYDE6lMgbzUwRI7B0MlF2jtu-iWpB_Y2ZyIaq8TQ/exec"; // e.g. "https://script.google.com/macros/s/AKfycb.../exec"
const CLOUD_SAVE_KEY = "whenthedaysarered";  // must match SECRET_KEY in Code.gs
const DEPLOYMENT_ID = "AKfycbwdCMqr8rJqMIBWA2r-hex1eTpEZsoYDE6lMgbzUwRI7B0MlF2jtu-iWpB_Y2ZyIaq8TQ"

const EMULATORJS_CDN = "https://cdn.emulatorjs.org/stable/data/";

/* =========================================================================
   Tiny IndexedDB helper (no external library).
   Stores:
     "saves"  keyPath "gameId"          -> { gameId, bytes, savedAt, hash }
     "states" keyPath ["gameId","slot"] -> { gameId, slot, bytes, savedAt }
   ========================================================================= */
const DB_NAME = "gba-launcher-db";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("saves")) {
        db.createObjectStore("saves", { keyPath: "gameId" });
      }
      if (!db.objectStoreNames.contains("states")) {
        db.createObjectStore("states", { keyPath: ["gameId", "slot"] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/* =========================================================================
   UI helpers
   ========================================================================= */
const $ = (sel) => document.querySelector(sel);

let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function renderLauncher() {
  const grid = $("#game-grid");
  grid.innerHTML = "";
  if (GAMES.length === 0) {
    grid.innerHTML = '<p class="empty-hint">No games yet - add one to GAMES in js/app.js</p>';
    return;
  }
  for (const game of GAMES) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "game-card";
    card.innerHTML = `
      <div class="cover">${
        game.cover ? `<img src="${game.cover}" alt="" onerror="this.parentElement.textContent='GBA'">` : "GBA"
      }</div>
      <div class="title">${game.title}</div>
    `;
    card.addEventListener("click", () => launchGame(game));
    grid.appendChild(card);
  }
}

/* =========================================================================
   Base64 <-> bytes (chunked to stay safe for large arrays; String.fromCharCode
   with a giant spread/args list can blow the call stack).
   ========================================================================= */
function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* =========================================================================
   Cloud save (Google Apps Script + Drive) - see server/apps-script/Code.gs.
   Requests are kept "simple" (no custom headers, default text/plain POST
   body) on purpose so the browser never sends a CORS preflight, which Apps
   Script Web Apps don't handle.
   ========================================================================= */
async function fetchCloudSave(gameId) {
  if (!CLOUD_SAVE_URL) return null;
  try {
    const url = `${CLOUD_SAVE_URL}?action=get&game=${encodeURIComponent(gameId)}&key=${encodeURIComponent(CLOUD_SAVE_KEY)}`;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    if (!data.ok || !data.exists) return null;
    return { bytes: base64ToBytes(data.base64), modifiedTime: data.modifiedTime };
  } catch (e) {
    return null; // cloud unreachable - fall back to local/server sources
  }
}

/* A freshly booted cartridge has uninitialized SRAM (all 0xFF, sometimes all
   0x00). Treating that as a real save is what lets a new device wipe the
   cloud copy, so blank saves are never pushed, stored, or preferred. */
function isBlankSave(bytes) {
  if (!bytes || bytes.length === 0) return true;
  const first = bytes[0];
  if (first !== 0xff && first !== 0x00) return false;
  for (let i = 1; i < bytes.length; i++) if (bytes[i] !== first) return false;
  return true;
}

async function pushCloudSave(gameId, bytes) {
  if (!CLOUD_SAVE_URL || isBlankSave(bytes)) return false;
  try {
    const res = await fetch(CLOUD_SAVE_URL, {
      method: "POST",
      body: JSON.stringify({ action: "save", game: gameId, key: CLOUD_SAVE_KEY, base64: bytesToBase64(bytes) }),
    });
    const data = await res.json();
    return !!data.ok;
  } catch (e) {
    return false; // best-effort - IndexedDB still has the save locally
  }
}

/* =========================================================================
   Save-file resolution: pick the newest of (IndexedDB copy, shipped server
   .sav, cloud save). The server .sav uses its Last-Modified response header
   as a timestamp (missing on some static hosts, treated as "unknown/oldest"
   then); the cloud save's timestamp comes straight from Drive.
   ========================================================================= */
async function resolveInitialSave(game) {
  const local = await idbGet("saves", game.id); // { gameId, bytes, savedAt, hash } | null

  let serverBytes = null;
  let serverTime = 0;
  try {
    const res = await fetch(game.save, { cache: "no-store" });
    if (res.ok) {
      const lastModified = res.headers.get("Last-Modified");
      serverTime = lastModified ? new Date(lastModified).getTime() : 0;
      serverBytes = new Uint8Array(await res.arrayBuffer());
    }
  } catch (e) {
    // no server save shipped yet - that's fine, start fresh
  }

  const cloud = await fetchCloudSave(game.id); // { bytes, modifiedTime } | null

  const candidates = [];
  if (local) candidates.push({ bytes: local.bytes, time: local.savedAt, source: "browser" });
  if (serverBytes) candidates.push({ bytes: serverBytes, time: serverTime, source: "server" });
  if (cloud) candidates.push({ bytes: cloud.bytes, time: cloud.modifiedTime, source: "cloud" });
  const real = candidates.filter((c) => !isBlankSave(c.bytes));
  if (real.length === 0) return null;
  candidates.length = 0;
  candidates.push(...real);

  candidates.sort((a, b) => b.time - a.time);
  return candidates[0];
}

/* =========================================================================
   Write save bytes into the running core's filesystem and reload them.
   This mirrors EmulatorJS's own "Import Save File" button handler
   (data/src/frontend.js) so it stays correct across EmulatorJS versions
   without depending on the button/file-picker itself.
   ========================================================================= */
function applySaveBytes(bytes) {
  const gm = window.EJS_emulator.gameManager;
  const path = gm.getSaveFilePath();
  const parts = path.split("/");
  let cur = "";
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === "") continue;
    cur += "/" + parts[i];
    if (!gm.FS.analyzePath(cur).exists) gm.FS.mkdir(cur);
  }
  if (gm.FS.analyzePath(path).exists) gm.FS.unlink(path);
  gm.FS.writeFile(path, bytes);
  gm.loadSaveFiles();
}

function downloadBlob(bytes, filename) {
  const blob = new Blob([bytes]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* =========================================================================
   Launching a game
   ========================================================================= */
let currentGame = null;
// False until the initial save has been resolved and applied. Until then the
// core's SRAM is still blank, and mirroring it would clobber the real save.
let saveReady = false;

async function launchGame(game) {
  currentGame = game;
  saveReady = false;
  $("#launcher-screen").classList.add("hidden");
  $("#player-screen").classList.remove("hidden");
  $("#player-title").textContent = game.title;
  $("#game").innerHTML = "";
  $("#mute-btn").textContent = "Mute";
  document.body.classList.remove("force-landscape");
  $("#landscape-btn").textContent = "Landscape";

  // ---- EmulatorJS config (must be set on window before loader.js runs) ----
  window.EJS_player = "#game";
  window.EJS_core = "gba"; // mGBA core
  window.EJS_pathtodata = EMULATORJS_CDN;
  window.EJS_gameUrl = game.rom; // EmulatorJS fetches this itself
  window.EJS_gameName = game.title;
  window.EJS_gameID = game.id;
  window.EJS_color = "#cc2b2b";
  window.EJS_backgroundColor = "#241414";
  window.EJS_startOnLoaded = true;
  window.EJS_fullscreenOnLoad = false;
  window.EJS_volume = Number(localStorage.getItem("gba-volume") ?? 0.5);
  // Periodic SRAM check -> fires the "saveUpdate" event below whenever the
  // save actually changed, which is how we auto-mirror it into IndexedDB.
  window.EJS_fixedSaveInterval = 5000;
  // We build our own Download/Import/Slot buttons, so hide the built-in
  // equivalents to avoid a duplicate, differently-styled toolbar.
  window.EJS_Buttons = {
    saveState: { visible: false },
    loadState: { visible: false },
    saveSavFiles: { visible: false },
    loadSavFiles: { visible: false },
    netplay: { visible: false },
    cheat: { visible: false },
    screenRecord: { visible: false },
  };

  window.EJS_onGameStart = async () => {
    try {
      const resolved = await resolveInitialSave(game);
      if (resolved) {
        await new Promise((r) => setTimeout(r, 50));
        applySaveBytes(resolved.bytes);
        toast(`Loaded save from ${resolved.source}`);
      }
    } catch (e) {
      console.error("Save preload failed", e);
    }
    saveReady = true;
    $("#save-controls").classList.remove("hidden");
    renderSlots(game);
  };

  window.EJS_onSaveUpdate = async (e) => {
    // e: { hash, save, screenshot, format } - fired only when the SRAM
    // content actually changed since the last check (every EJS_fixedSaveInterval).
    if (!saveReady || isBlankSave(e.save)) return;
    await idbPut("saves", { gameId: game.id, bytes: e.save, savedAt: Date.now(), hash: e.hash });
    pushCloudSave(game.id, e.save); // best-effort, keeps other devices in sync automatically
  };

  loadEmulatorScript();
}

function loadEmulatorScript() {
  document.querySelectorAll('script[data-ejs-loader="1"]').forEach((s) => s.remove());
  if (window.EJS_emulator) {
    try { window.EJS_emulator.callEvent("exit"); } catch (e) {}
    delete window.EJS_emulator;
  }
  const script = document.createElement("script");
  script.src = EMULATORJS_CDN + "loader.js";
  script.dataset.ejsLoader = "1";
  document.body.appendChild(script);
}

function backToLibrary() {
  if (window.EJS_emulator) {
    try { window.EJS_emulator.callEvent("exit"); } catch (e) {}
  }
  $("#game").innerHTML = "";
  $("#save-controls").classList.add("hidden");
  $("#player-screen").classList.add("hidden");
  $("#launcher-screen").classList.remove("hidden");
  document.body.classList.remove("force-landscape");
  currentGame = null;
}

/* =========================================================================
   Fullscreen + Landscape (mobile)
   toggleFullscreen(true) is EmulatorJS's own real method (data/src/emulator.js)
   and on mobile it already tries screen.orientation.lock("landscape") itself
   for the gba core - Android Chrome honors that inside fullscreen, iOS Safari
   doesn't support the API at all. The Landscape button below is a separate,
   CSS-only fallback (see .force-landscape in style.css) that rotates the
   player screen so it works everywhere, fullscreen or not.
   ========================================================================= */
function onToggleFullscreen() {
  if (!window.EJS_emulator) return;
  try {
    window.EJS_emulator.toggleFullscreen(!document.fullscreenElement);
  } catch (e) {
    toast("Fullscreen not available in this browser/app");
  }
}

function onToggleLandscape() {
  const on = document.body.classList.toggle("force-landscape");
  $("#landscape-btn").textContent = on ? "Undo Landscape" : "Landscape";
  try {
    if (on && screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    } else if (!on && screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  } catch (e) {
    // Orientation Lock API unsupported (e.g. iOS Safari) - the CSS rotation above still applies
  }
}

/* =========================================================================
   Haptic feedback for the on-screen touch controls
   EmulatorJS renders its virtual D-pad/A/B/Start/Select/L/R buttons with the
   stable class "ejs_virtualGamepad_button" (data/src/frontend.js) whenever a
   touch device is detected. We don't touch how input is sent to the core -
   just delegate a touchstart listener to add a short vibration on tap.
   ========================================================================= */
function setupVibration() {
  if (!("vibrate" in navigator)) return;
  document.addEventListener(
    "touchstart",
    (e) => {
      if (e.target.closest(".ejs_virtualGamepad_button, .ejs_dpad_main")) {
        navigator.vibrate(15);
      }
    },
    { passive: true }
  );
}

/* =========================================================================
   Mute toggle
   Mirrors EmulatorJS's own built-in mute button (data/src/frontend.js):
   setVolume(0) mutes, setVolume(this.volume) restores the last set level.
   ========================================================================= */
function onToggleMute() {
  const ejs = window.EJS_emulator;
  if (!ejs) return;
  const btn = $("#mute-btn");
  if (ejs.muted) {
    ejs.muted = false;
    ejs.setVolume(ejs.volume);
    btn.textContent = "Mute";
  } else {
    ejs.muted = true;
    ejs.setVolume(0);
    btn.textContent = "Unmute";
  }
}

/* =========================================================================
   Download / Import Save buttons
   ========================================================================= */
async function onDownloadSave() {
  if (!currentGame || !window.EJS_emulator) return;
  const bytes = await window.EJS_emulator.gameManager.getSaveFile();
  await idbPut("saves", { gameId: currentGame.id, bytes, savedAt: Date.now() });
  downloadBlob(bytes, `${currentGame.id}.sav`);
  toast("Save downloaded");

  if (CLOUD_SAVE_URL) {
    pushCloudSave(currentGame.id, bytes).then(() => toast("Synced to cloud"));
  } else {
    toast("Upload it to games/savefiles/ to sync other devices");
  }

  if (UPLOAD_ENDPOINT) {
    try {
      const res = await fetch(UPLOAD_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Save-Key": UPLOAD_SECRET,
          "X-Game-Id": currentGame.id,
        },
        body: bytes,
      });
      toast(res.ok ? "Save uploaded to server" : "Server upload failed");
    } catch (e) {
      toast("Server upload failed (endpoint unreachable)");
    }
  }
}

/* =========================================================================
   Manual cloud sync buttons
   The game only reads SRAM at boot, so after pulling a save we restart the
   core; otherwise "Continue" on the title screen would still show old data.
   ========================================================================= */
async function onPullCloudSave() {
  if (!currentGame || !window.EJS_emulator) return;
  toast("Fetching cloud save...");
  const cloud = await fetchCloudSave(currentGame.id);
  if (!cloud) return toast("No cloud save found (or cloud unreachable)");
  if (isBlankSave(cloud.bytes)) return toast("Cloud save is empty - not loading it");
  applySaveBytes(cloud.bytes);
  await idbPut("saves", { gameId: currentGame.id, bytes: cloud.bytes, savedAt: Date.now() });
  try { window.EJS_emulator.gameManager.restart(); } catch (e) {}
  toast(`Loaded cloud save (${new Date(cloud.modifiedTime).toLocaleString()})`);
}

async function onPushCloudSave() {
  if (!currentGame || !window.EJS_emulator) return;
  const bytes = await window.EJS_emulator.gameManager.getSaveFile();
  if (isBlankSave(bytes)) return toast("No in-game save yet - save in the game first");
  await idbPut("saves", { gameId: currentGame.id, bytes, savedAt: Date.now() });
  toast((await pushCloudSave(currentGame.id, bytes)) ? "Uploaded to cloud" : "Cloud upload failed");
}

function onImportSaveFile(fileList) {
  const file = fileList[0];
  if (!file || !currentGame) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const bytes = new Uint8Array(reader.result);
    applySaveBytes(bytes);
    await idbPut("saves", { gameId: currentGame.id, bytes, savedAt: Date.now() });
    pushCloudSave(currentGame.id, bytes);
    toast(`Imported ${file.name}`);
  };
  reader.readAsArrayBuffer(file);
}

/* =========================================================================
   Save states: 3 slots in IndexedDB, mirrored to the cloud.
   Each slot is stored on Drive as its own file ("<gameId>-state<N>.sav"),
   reusing the same Apps Script endpoint - no Code.gs changes needed.
   ========================================================================= */
function cloudStateId(game, slot) {
  return `${game.id}-state${slot}`;
}

async function renderSlots(game) {
  const container = $("#save-slots");
  container.innerHTML = "";
  for (let slot = 1; slot <= 3; slot++) {
    const record = await idbGet("states", [game.id, slot]);
    const el = document.createElement("div");
    el.className = "save-slot";
    el.innerHTML = `
      <div class="slot-label">Slot ${slot}</div>
      <div class="slot-meta">${record ? new Date(record.savedAt).toLocaleString() : "empty"}</div>
      <div class="slot-actions">
        <button class="pixel-btn" data-act="save">Save</button>
        <button class="pixel-btn" data-act="load" ${record ? "" : "disabled"}>Load</button>
        ${CLOUD_SAVE_URL ? '<button class="pixel-btn" data-act="cloud">Load Cloud</button>' : ""}
      </div>
    `;
    el.querySelector('[data-act="save"]').addEventListener("click", () => saveStateSlot(game, slot));
    el.querySelector('[data-act="load"]').addEventListener("click", () => loadStateSlot(game, slot));
    el.querySelector('[data-act="cloud"]')?.addEventListener("click", () => loadCloudStateSlot(game, slot));
    container.appendChild(el);
  }
}

function saveStateSlot(game, slot) {
  if (!window.EJS_emulator) return;
  try {
    const state = window.EJS_emulator.gameManager.getState();
    idbPut("states", { gameId: game.id, slot, bytes: state, savedAt: Date.now() }).then(() => {
      toast(`Saved to slot ${slot}`);
      renderSlots(game);
    });
    if (CLOUD_SAVE_URL) {
      pushCloudSave(cloudStateId(game, slot), state).then((ok) =>
        toast(ok ? `Slot ${slot} uploaded to cloud` : `Slot ${slot} cloud upload failed`)
      );
    }
  } catch (e) {
    toast("Save state failed");
  }
}

async function loadStateSlot(game, slot) {
  if (!window.EJS_emulator) return;
  const record = await idbGet("states", [game.id, slot]);
  if (!record) return;
  try {
    window.EJS_emulator.gameManager.loadState(record.bytes);
    toast(`Loaded slot ${slot}`);
  } catch (e) {
    toast("Load state failed");
  }
}

async function loadCloudStateSlot(game, slot) {
  if (!window.EJS_emulator) return;
  toast(`Fetching slot ${slot} from cloud...`);
  const cloud = await fetchCloudSave(cloudStateId(game, slot));
  if (!cloud) return toast(`No cloud copy of slot ${slot} (or cloud unreachable)`);
  try {
    window.EJS_emulator.gameManager.loadState(cloud.bytes);
    await idbPut("states", { gameId: game.id, slot, bytes: cloud.bytes, savedAt: cloud.modifiedTime });
    renderSlots(game);
    toast(`Loaded slot ${slot} from cloud`);
  } catch (e) {
    toast("Load state failed");
  }
}

/* =========================================================================
   Wire up static controls
   ========================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  renderLauncher();
  setupVibration();
  $("#back-btn").addEventListener("click", backToLibrary);
  $("#fullscreen-btn").addEventListener("click", onToggleFullscreen);
  $("#landscape-btn").addEventListener("click", onToggleLandscape);
  $("#mute-btn").addEventListener("click", onToggleMute);
  $("#download-save-btn").addEventListener("click", onDownloadSave);
  $("#pull-cloud-btn").addEventListener("click", onPullCloudSave);
  $("#push-cloud-btn").addEventListener("click", onPushCloudSave);
  $("#import-save-input").addEventListener("change", (e) => onImportSaveFile(e.target.files));
});

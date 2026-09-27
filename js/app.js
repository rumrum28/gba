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
];

/* =========================================================================
   OPTIONAL server upload endpoint (see server/save-server.js in the repo).
   Leave UPLOAD_ENDPOINT empty to hide the "Upload to server" button - this
   only works when self-hosting the server script; GitHub Pages is static
   and cannot run it.
   ========================================================================= */
const UPLOAD_ENDPOINT = "http://localhost:8787/save";
const UPLOAD_SECRET = "b367c1263f4d50ab4c9489a4e2e1f6d8"; // must match SAVE_UPLOAD_SECRET on the server

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
   Save-file resolution: pick the newest of (IndexedDB copy, server .sav)
   Uses the server response's Last-Modified header as the file's timestamp;
   if that header is missing (some static hosts omit it) the server copy is
   only used when no local copy exists yet.
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

  if (local && (!serverBytes || local.savedAt >= serverTime)) {
    return { bytes: local.bytes, source: "browser" };
  }
  if (serverBytes) {
    return { bytes: serverBytes, source: "server" };
  }
  return null;
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

async function launchGame(game) {
  currentGame = game;
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
        setTimeout(() => {
          applySaveBytes(resolved.bytes);
          toast(`Loaded save from ${resolved.source}`);
        }, 50);
      }
    } catch (e) {
      console.error("Save preload failed", e);
    }
    $("#save-controls").classList.remove("hidden");
    renderSlots(game);
  };

  window.EJS_onSaveUpdate = async (e) => {
    // e: { hash, save, screenshot, format } - fired only when the SRAM
    // content actually changed since the last check.
    await idbPut("saves", { gameId: game.id, bytes: e.save, savedAt: Date.now(), hash: e.hash });
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
  toast("Save downloaded - upload it to games/savefiles/ to sync other devices");

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

function onImportSaveFile(fileList) {
  const file = fileList[0];
  if (!file || !currentGame) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const bytes = new Uint8Array(reader.result);
    applySaveBytes(bytes);
    await idbPut("saves", { gameId: currentGame.id, bytes, savedAt: Date.now() });
    toast(`Imported ${file.name}`);
  };
  reader.readAsArrayBuffer(file);
}

/* =========================================================================
   Save states: 3 slots in IndexedDB
   ========================================================================= */
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
      </div>
    `;
    el.querySelector('[data-act="save"]').addEventListener("click", () => saveStateSlot(game, slot));
    el.querySelector('[data-act="load"]').addEventListener("click", () => loadStateSlot(game, slot));
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
  $("#import-save-input").addEventListener("change", (e) => onImportSaveFile(e.target.files));
});

/**
 * GBA Launcher cloud save endpoint - Google Apps Script Web App.
 *
 * Deploy this tied to your own Google account/Drive and it gives the launcher
 * a real, always-on save endpoint reachable from any device - no server to
 * rent, no login required by whoever plays. See README.md "Cloud saves via
 * Google Drive" for the step-by-step deploy instructions.
 *
 * Storage: one binary file per game, named "<gameId>.sav", inside a Drive
 * folder called "GBA Launcher Saves" (created automatically on first use).
 *
 * API (kept to "simple requests" on purpose - no custom headers - so the
 * browser never sends a CORS preflight OPTIONS, which Apps Script Web Apps
 * don't handle):
 *   GET  {url}?action=get&game=<id>&key=<SECRET_KEY>
 *        -> {"ok":true,"exists":true,"base64":"...","modifiedTime":168...}
 *        -> {"ok":true,"exists":false}                (no save yet)
 *   POST body (any Content-Type EmulatorJS/fetch defaults to, read as text):
 *        {"action":"save","game":"<id>","key":"<SECRET_KEY>","base64":"..."}
 *        -> {"ok":true,"modifiedTime":168...}
 */

const SECRET_KEY = "CHANGE-ME"; // must match CLOUD_SAVE_KEY in js/app.js
const FOLDER_NAME = "GBA Launcher Saves";

function doGet(e) {
  return handle(e.parameter);
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: "bad request body" });
  }
  return handle(body);
}

function handle(params) {
  if (!params || params.key !== SECRET_KEY) {
    return json({ ok: false, error: "bad key" });
  }
  const gameId = sanitizeId(params.game);
  if (!gameId) {
    return json({ ok: false, error: "bad game id" });
  }

  const action = params.action || (params.base64 ? "save" : "get");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (action === "save") {
      return json(saveFile(gameId, params.base64));
    }
    return json(getFile(gameId));
  } finally {
    lock.releaseLock();
  }
}

function sanitizeId(id) {
  return /^[a-z0-9-_]+$/i.test(id || "") ? id : null;
}

function getFolder() {
  const existing = DriveApp.getFoldersByName(FOLDER_NAME);
  if (existing.hasNext()) return existing.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

function findFile(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  return files.hasNext() ? files.next() : null;
}

function getFile(gameId) {
  const folder = getFolder();
  const file = findFile(folder, gameId + ".sav");
  if (!file) return { ok: true, exists: false };
  return {
    ok: true,
    exists: true,
    base64: Utilities.base64Encode(file.getBlob().getBytes()),
    modifiedTime: file.getLastUpdated().getTime(),
  };
}

function saveFile(gameId, base64) {
  if (!base64) return { ok: false, error: "missing save data" };
  const bytes = Utilities.base64Decode(base64);
  const folder = getFolder();
  const fileName = gameId + ".sav";
  const existing = findFile(folder, fileName);
  if (existing) existing.setTrashed(true); // old version recoverable from Drive trash
  const blob = Utilities.newBlob(bytes, "application/octet-stream", fileName);
  const file = folder.createFile(blob);
  return { ok: true, modifiedTime: file.getLastUpdated().getTime() };
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Optional local save-upload endpoint.
 *
 * Not used by GitHub Pages (static hosting can't run this) - only useful if
 * you self-host the launcher on something that can run Node (a home server,
 * a VPS, localhost while testing). Writes uploaded .sav bytes straight into
 * games/savefiles/, replacing the file the launcher will fetch on next load.
 *
 * Run:   node server/save-server.js
 * Then set UPLOAD_ENDPOINT + UPLOAD_SECRET at the top of js/app.js to point
 * at this server's URL and match SAVE_UPLOAD_SECRET below.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8787;
const SAVE_UPLOAD_SECRET = process.env.SAVE_UPLOAD_SECRET || "change-me";
const SAVES_DIR = path.join(__dirname, "..", "games", "savefiles");
const MAX_BYTES = 2 * 1024 * 1024; // generous cap for a GBA .sav (largest is 128KB)

function safeGameId(id) {
  // gameId becomes part of a filename - keep it to simple slug characters
  return /^[a-z0-9-_]+$/i.test(id || "") ? id : null;
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "X-Save-Key, X-Game-Id, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method !== "POST" || req.url !== "/save") {
    res.writeHead(404); res.end("Not found"); return;
  }

  if (req.headers["x-save-key"] !== SAVE_UPLOAD_SECRET) {
    res.writeHead(401); res.end("Bad secret key"); return;
  }

  const gameId = safeGameId(req.headers["x-game-id"]);
  if (!gameId) { res.writeHead(400); res.end("Bad game id"); return; }

  const chunks = [];
  let total = 0;
  req.on("data", (chunk) => {
    total += chunk.length;
    if (total > MAX_BYTES) { req.destroy(); return; }
    chunks.push(chunk);
  });

  req.on("end", () => {
    if (total > MAX_BYTES) { res.writeHead(413); res.end("Too large"); return; }
    fs.mkdirSync(SAVES_DIR, { recursive: true });
    fs.writeFileSync(path.join(SAVES_DIR, `${gameId}.sav`), Buffer.concat(chunks));
    res.writeHead(200); res.end("OK");
  });
});

server.listen(PORT, () => {
  console.log(`Save upload server listening on http://localhost:${PORT}/save`);
  console.log(`Writing into ${SAVES_DIR}`);
  if (SAVE_UPLOAD_SECRET === "change-me") {
    console.warn("WARNING: using the default secret key - set SAVE_UPLOAD_SECRET before exposing this beyond localhost.");
  }
});

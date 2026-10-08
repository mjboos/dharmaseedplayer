const APP = "dharmaseed-player";
const VERSION = 1;
const NOT_A_BACKUP = "This file isn't a DharmaSeed Player playlist export.";

/**
 * Builds the export file contents: all playlists plus saved playback positions.
 * Pure — no DOM or storage dependencies.
 */
export function createBackup(playlists, positions, now = new Date()) {
  return JSON.stringify({ app: APP, version: VERSION, exportedAt: now.toISOString(), playlists, positions }, null, 2);
}

export function backupFilename(now = new Date()) {
  return `dharmaseed-playlists-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Parses an export file. Returns { playlists, positions } with malformed entries dropped,
 * or throws an Error with a message fit to show the user.
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  if (!data || data.app !== APP || !Array.isArray(data.playlists)) {
    throw new Error(NOT_A_BACKUP);
  }
  if (data.version > VERSION) {
    throw new Error("This file was exported by a newer version of the app. Reload the app and try again.");
  }

  const playlists = data.playlists
    .filter((pl) => pl && typeof pl.name === "string" && Array.isArray(pl.talks))
    .map((pl) => ({
      id: typeof pl.id === "string" && pl.id ? pl.id : null,
      name: pl.name,
      talks: pl.talks.filter(isTalk),
    }));

  const positions = {};
  if (data.positions && typeof data.positions === "object") {
    for (const [talkId, time] of Object.entries(data.positions)) {
      if (Number.isFinite(time) && time > 0) positions[talkId] = time;
    }
  }

  return { playlists, positions };
}

function isTalk(t) {
  return t && Number.isInteger(t.id) && typeof t.title === "string" && typeof t.audioUrl === "string";
}

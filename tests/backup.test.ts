import test from "node:test";
import assert from "node:assert/strict";
import { createBackup, backupFilename, parseBackup } from "../public/backup.js";

const talk1 = { id: 1, title: "Talk 1", teacher: "Teacher A", durationMinutes: 30, date: "2024-01-01", audioUrl: "/a/1" };
const talk2 = { id: 2, title: "Talk 2", teacher: "Teacher B", durationMinutes: 45, date: "2024-01-02", audioUrl: "/a/2" };

const playlists = [
  { id: "queue", name: "Queue", talks: [talk1] },
  { id: "abc", name: "Metta", talks: [talk1, talk2] },
];

test("export round-trips playlists and positions", () => {
  const text = createBackup(playlists, { 1: 120.5, 2: 30 });
  assert.deepEqual(parseBackup(text), { playlists, positions: { 1: 120.5, 2: 30 } });
});

test("export file is labelled and dated", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const data = JSON.parse(createBackup(playlists, {}, now));
  assert.equal(data.app, "dharmaseed-player");
  assert.equal(data.version, 1);
  assert.equal(data.exportedAt, "2026-10-08T12:00:00.000Z");
  assert.equal(backupFilename(now), "dharmaseed-playlists-2026-10-08.json");
});

test("rejects files that aren't playlist exports", () => {
  for (const text of ["not json", "null", "[]", '{"playlists": []}', '{"app": "other", "playlists": []}', '{"app": "dharmaseed-player"}']) {
    assert.throws(() => parseBackup(text), /isn't a DharmaSeed Player playlist export/, text);
  }
});

test("rejects exports from a newer format version", () => {
  const text = JSON.stringify({ app: "dharmaseed-player", version: 2, playlists: [] });
  assert.throws(() => parseBackup(text), /newer version/);
});

test("drops malformed playlists, talks and positions", () => {
  const text = JSON.stringify({
    app: "dharmaseed-player",
    version: 1,
    playlists: [
      { id: "abc", name: "Metta", talks: [talk1, { id: "x", title: "bad id", audioUrl: "/a" }, { id: 3, title: "no audio" }, null] },
      { id: "def", talks: [talk2] },
      { name: "No id", talks: [talk2] },
      "junk",
    ],
    positions: { 1: 60, 2: -5, 3: "10", 4: null },
  });
  assert.deepEqual(parseBackup(text), {
    playlists: [
      { id: "abc", name: "Metta", talks: [talk1] },
      { id: null, name: "No id", talks: [talk2] },
    ],
    positions: { 1: 60 },
  });
});

test("missing positions are fine", () => {
  const text = JSON.stringify({ app: "dharmaseed-player", version: 1, playlists });
  assert.deepEqual(parseBackup(text).positions, {});
});

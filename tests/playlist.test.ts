import test from "node:test";
import assert from "node:assert/strict";
import { createPlaylistStore } from "../public/playlist.js";

/** Minimal in-memory storage that mimics localStorage */
function mockStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
  };
}

const talk1 = { id: 1, title: "Talk 1", teacher: "Teacher A", durationMinutes: 30, date: "2024-01-01", audioUrl: "/a/1" };
const talk2 = { id: 2, title: "Talk 2", teacher: "Teacher B", durationMinutes: 45, date: "2024-01-02", audioUrl: "/a/2" };
const talk3 = { id: 3, title: "Talk 3", teacher: "Teacher A", durationMinutes: 60, date: "2024-01-03", audioUrl: "/a/3" };

// --- Default playlist (Queue) ---

test("new store has a default Queue playlist", () => {
  const store = createPlaylistStore(mockStorage());
  const playlists = store.getPlaylists();
  assert.equal(playlists.length, 1);
  assert.equal(playlists[0].id, "queue");
  assert.equal(playlists[0].name, "Queue");
  assert.deepEqual(playlists[0].talks, []);
});

test("active playlist defaults to Queue", () => {
  const store = createPlaylistStore(mockStorage());
  assert.equal(store.getActivePlaylistId(), "queue");
});

// --- Adding talks ---

test("add talk to default playlist", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("queue", talk1);
  const pl = store.getPlaylist("queue");
  assert.equal(pl!.talks.length, 1);
  assert.equal(pl!.talks[0].id, 1);
});

test("adding duplicate talk is ignored", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("queue", talk1);
  store.addTalk("queue", talk1);
  assert.equal(store.getPlaylist("queue")!.talks.length, 1);
});

test("add multiple talks", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("queue", talk1);
  store.addTalk("queue", talk2);
  assert.equal(store.getPlaylist("queue")!.talks.length, 2);
});

// --- Adding a batch of talks (e.g. a whole retreat) ---

const talk4 = { id: 4, title: "Talk 4", teacher: "Teacher A", durationMinutes: 30, date: "2024-01-04", audioUrl: "/a/4" };
const talk5 = { id: 5, title: "Talk 5", teacher: "Teacher A", durationMinutes: 30, date: "2024-01-05", audioUrl: "/a/5" };

function ids(store: ReturnType<typeof createPlaylistStore>) {
  return store.getAll("queue").map((t) => t.id);
}

test("addTalks appends talks in the given order", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("queue", talk5);
  store.addTalks("queue", [talk1, talk2, talk3]);
  assert.deepEqual(ids(store), [5, 1, 2, 3]);
});

test("addTalks keeps the given order when some talks are already in the playlist", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("queue", talk3);
  store.addTalks("queue", [talk1, talk2, talk3, talk4]);
  assert.deepEqual(ids(store), [1, 2, 3, 4]);
});

test("addTalks places the batch where its earliest existing talk was", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("queue", talk5);
  store.addTalk("queue", talk3);
  store.addTalk("queue", { ...talk1, id: 99 });
  store.addTalks("queue", [talk1, talk2, talk3, talk4]);
  assert.deepEqual(ids(store), [5, 1, 2, 3, 4, 99]);
});

test("addTalks reorders talks already in the playlist", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("queue", talk3);
  store.addTalk("queue", talk2);
  store.addTalk("queue", talk1);
  store.addTalks("queue", [talk1, talk2, talk3]);
  assert.deepEqual(ids(store), [1, 2, 3]);
});

test("addTalks ignores duplicates within the batch", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalks("queue", [talk1, talk2, talk1]);
  assert.deepEqual(ids(store), [1, 2]);
});

test("addTalks to non-existent playlist is no-op", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalks("nope", [talk1]);
  assert.equal(store.getPlaylists().length, 1);
  assert.deepEqual(ids(store), []);
});

// --- Removing talks ---

test("remove talk from playlist", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("queue", talk1);
  store.addTalk("queue", talk2);
  store.removeTalk("queue", 1);
  const pl = store.getPlaylist("queue")!;
  assert.equal(pl.talks.length, 1);
  assert.equal(pl.talks[0].id, 2);
});

test("remove non-existent talk is no-op", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("queue", talk1);
  store.removeTalk("queue", 999);
  assert.equal(store.getPlaylist("queue")!.talks.length, 1);
});

// --- getNext() ---

test("getNext() returns the talk after the given one and keeps the playlist intact", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalks("queue", [talk1, talk2, talk3]);
  assert.deepEqual(store.getNext("queue", 2), talk3);
  assert.deepEqual(ids(store), [1, 2, 3]);
});

test("getNext() returns null after the last talk", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalks("queue", [talk1, talk2]);
  assert.equal(store.getNext("queue", 2), null);
});

test("getNext() returns null for a talk not in the playlist", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalks("queue", [talk1, talk2]);
  assert.equal(store.getNext("queue", 999), null);
  assert.equal(store.getNext("nope", 1), null);
});

// --- Creating playlists ---

test("create a new playlist", () => {
  const store = createPlaylistStore(mockStorage());
  const id = store.createPlaylist("Favorites");
  assert.ok(id);
  assert.equal(store.getPlaylists().length, 2);
  assert.equal(store.getPlaylist(id)!.name, "Favorites");
  assert.deepEqual(store.getPlaylist(id)!.talks, []);
});

test("add talk to a custom playlist", () => {
  const store = createPlaylistStore(mockStorage());
  const id = store.createPlaylist("Metta");
  store.addTalk(id, talk1);
  store.addTalk(id, talk2);
  assert.equal(store.getPlaylist(id)!.talks.length, 2);
  // Queue should be unaffected
  assert.equal(store.getPlaylist("queue")!.talks.length, 0);
});

// --- Renaming playlists ---

test("rename a custom playlist", () => {
  const store = createPlaylistStore(mockStorage());
  const id = store.createPlaylist("Old Name");
  store.renamePlaylist(id, "New Name");
  assert.equal(store.getPlaylist(id)!.name, "New Name");
});

test("cannot rename the default Queue playlist", () => {
  const store = createPlaylistStore(mockStorage());
  store.renamePlaylist("queue", "My Queue");
  assert.equal(store.getPlaylist("queue")!.name, "Queue");
});

// --- Deleting playlists ---

test("delete a custom playlist", () => {
  const store = createPlaylistStore(mockStorage());
  const id = store.createPlaylist("Temp");
  store.addTalk(id, talk1);
  store.deletePlaylist(id);
  assert.equal(store.getPlaylists().length, 1);
  assert.equal(store.getPlaylist(id), null);
});

test("cannot delete the default Queue playlist", () => {
  const store = createPlaylistStore(mockStorage());
  store.deletePlaylist("queue");
  assert.equal(store.getPlaylists().length, 1);
  assert.equal(store.getPlaylist("queue")!.name, "Queue");
});

test("deleting active playlist resets active to queue", () => {
  const store = createPlaylistStore(mockStorage());
  const id = store.createPlaylist("Custom");
  store.setActivePlaylist(id);
  assert.equal(store.getActivePlaylistId(), id);
  store.deletePlaylist(id);
  assert.equal(store.getActivePlaylistId(), "queue");
});

// --- Active playlist ---

test("set active playlist", () => {
  const store = createPlaylistStore(mockStorage());
  const id = store.createPlaylist("Custom");
  store.setActivePlaylist(id);
  assert.equal(store.getActivePlaylistId(), id);
});

test("getNext() only looks in the given playlist", () => {
  const store = createPlaylistStore(mockStorage());
  const id = store.createPlaylist("Custom");
  store.addTalks(id, [talk1, talk3]);
  store.addTalks("queue", [talk1, talk2]);
  assert.deepEqual(store.getNext(id, 1), talk3);
  assert.deepEqual(store.getNext("queue", 1), talk2);
});

// --- Persistence ---

test("state persists across store instances", () => {
  const storage = mockStorage();
  const store1 = createPlaylistStore(storage);
  store1.addTalk("queue", talk1);
  store1.addTalk("queue", talk2);
  const id = store1.createPlaylist("Saved");
  store1.addTalk(id, talk3);
  store1.setActivePlaylist(id);

  // New store instance reading from same storage
  const store2 = createPlaylistStore(storage);
  assert.equal(store2.getPlaylist("queue")!.talks.length, 2);
  assert.equal(store2.getPlaylists().length, 2);
  assert.equal(store2.getPlaylist(id)!.talks.length, 1);
  assert.equal(store2.getActivePlaylistId(), id);
});

// --- Migration from old talk_queue ---

test("migrates old talk_queue data into default Queue playlist", () => {
  const storage = mockStorage();
  // Simulate old format: just an array of talks under "talk_queue"
  storage.setItem("talk_queue", JSON.stringify([talk1, talk2]));

  const store = createPlaylistStore(storage);
  const queue = store.getPlaylist("queue")!;
  assert.equal(queue.talks.length, 2);
  assert.equal(queue.talks[0].id, 1);
  assert.equal(queue.talks[1].id, 2);
  // Old key should be cleaned up
  assert.equal(storage.getItem("talk_queue"), null);
});

test("migration does not happen if playlists already exist", () => {
  const storage = mockStorage();
  // Set up existing playlists
  const existing = [{ id: "queue", name: "Queue", talks: [talk3] }];
  storage.setItem("playlists", JSON.stringify(existing));
  // Old key also present (shouldn't happen, but be safe)
  storage.setItem("talk_queue", JSON.stringify([talk1, talk2]));

  const store = createPlaylistStore(storage);
  // Should use the playlists data, not migrate
  assert.equal(store.getPlaylist("queue")!.talks.length, 1);
  assert.equal(store.getPlaylist("queue")!.talks[0].id, 3);
});

// --- findById ---

test("findById searches within a playlist", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("queue", talk1);
  store.addTalk("queue", talk2);
  assert.deepEqual(store.findById("queue", 2), talk2);
  assert.equal(store.findById("queue", 999), null);
});

// --- getAll convenience ---

test("getAll returns talks from a playlist", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("queue", talk1);
  store.addTalk("queue", talk2);
  const all = store.getAll("queue");
  assert.equal(all.length, 2);
  // Should be a copy
  all.push(talk3);
  assert.equal(store.getAll("queue").length, 2);
});

// --- Edge cases ---

test("adding to non-existent playlist is no-op", () => {
  const store = createPlaylistStore(mockStorage());
  store.addTalk("nonexistent", talk1);
  assert.equal(store.getPlaylists().length, 1);
});

test("setting active to non-existent playlist is no-op", () => {
  const store = createPlaylistStore(mockStorage());
  store.setActivePlaylist("nonexistent");
  assert.equal(store.getActivePlaylistId(), "queue");
});

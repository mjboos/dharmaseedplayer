const PLAYLISTS_KEY = "playlists";
const ACTIVE_KEY = "active_playlist_id";
const OLD_QUEUE_KEY = "talk_queue";
const DEFAULT_ID = "queue";

/**
 * Creates a playlist store backed by the given storage (localStorage or mock).
 * Pure data layer — no DOM dependencies.
 */
export function createPlaylistStore(storage) {
  let playlists = load();
  let activeId = storage.getItem(ACTIVE_KEY) || DEFAULT_ID;

  // Validate active points to existing playlist
  if (!playlists.some((p) => p.id === activeId)) {
    activeId = DEFAULT_ID;
  }

  function load() {
    const raw = storage.getItem(PLAYLISTS_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        // fall through to migration / default
      }
    }

    // Attempt migration from old talk_queue format
    const oldRaw = storage.getItem(OLD_QUEUE_KEY);
    if (oldRaw) {
      try {
        const oldTalks = JSON.parse(oldRaw);
        if (Array.isArray(oldTalks)) {
          const migrated = [{ id: DEFAULT_ID, name: "Queue", talks: oldTalks }];
          storage.setItem(PLAYLISTS_KEY, JSON.stringify(migrated));
          storage.removeItem(OLD_QUEUE_KEY);
          return migrated;
        }
      } catch {
        // ignore bad data
      }
    }

    // Fresh start
    const fresh = [{ id: DEFAULT_ID, name: "Queue", talks: [] }];
    storage.setItem(PLAYLISTS_KEY, JSON.stringify(fresh));
    return fresh;
  }

  function save() {
    storage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
    storage.setItem(ACTIVE_KEY, activeId);
  }

  function findPlaylist(id) {
    return playlists.find((p) => p.id === id) || null;
  }

  return {
    getPlaylists() {
      return [...playlists];
    },

    getPlaylist(id) {
      const pl = findPlaylist(id);
      return pl ? { ...pl, talks: [...pl.talks] } : null;
    },

    getActivePlaylistId() {
      return activeId;
    },

    setActivePlaylist(id) {
      if (!findPlaylist(id)) return;
      activeId = id;
      save();
    },

    addTalk(playlistId, talk) {
      const pl = findPlaylist(playlistId);
      if (!pl) return;
      if (pl.talks.some((t) => t.id === talk.id)) return;
      pl.talks.push(talk);
      save();
    },

    removeTalk(playlistId, talkId) {
      const pl = findPlaylist(playlistId);
      if (!pl) return;
      pl.talks = pl.talks.filter((t) => t.id !== talkId);
      save();
    },

    next() {
      const pl = findPlaylist(activeId);
      if (!pl || pl.talks.length === 0) return null;
      const talk = pl.talks.shift();
      save();
      return talk;
    },

    getAll(playlistId) {
      const pl = findPlaylist(playlistId);
      return pl ? [...pl.talks] : [];
    },

    findById(playlistId, talkId) {
      const pl = findPlaylist(playlistId);
      if (!pl) return null;
      return pl.talks.find((t) => t.id === talkId) || null;
    },

    createPlaylist(name) {
      const id = crypto.randomUUID();
      playlists.push({ id, name, talks: [] });
      save();
      return id;
    },

    renamePlaylist(id, name) {
      if (id === DEFAULT_ID) return;
      const pl = findPlaylist(id);
      if (!pl) return;
      pl.name = name;
      save();
    },

    deletePlaylist(id) {
      if (id === DEFAULT_ID) return;
      playlists = playlists.filter((p) => p.id !== id);
      if (activeId === id) activeId = DEFAULT_ID;
      save();
    },
  };
}

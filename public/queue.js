import { createPlaylistStore } from "./playlist.js";

const store = createPlaylistStore(localStorage);

const listEl = document.getElementById("queue-list");
const countEl = document.getElementById("queue-count");
const panel = document.getElementById("queue-panel");
const toggleBtn = document.getElementById("queue-btn");
const closeBtn = document.getElementById("queue-close");
const switchBtn = document.getElementById("playlist-switch-btn");
const activeNameEl = document.getElementById("playlist-active-name");
const picker = document.getElementById("playlist-picker");
const pickerList = document.getElementById("playlist-picker-list");
const newPlaylistBtn = document.getElementById("new-playlist-btn");

let onPlayCallback = null;

toggleBtn.addEventListener("click", () => {
  panel.classList.toggle("hidden");
  // Always start on the talk list view, not the picker
  picker.classList.add("hidden");
  listEl.classList.remove("hidden");
});
closeBtn.addEventListener("click", () => panel.classList.add("hidden"));

// Toggle between picker and talk list
switchBtn.addEventListener("click", () => {
  const showingPicker = !picker.classList.contains("hidden");
  if (showingPicker) {
    picker.classList.add("hidden");
    listEl.classList.remove("hidden");
  } else {
    renderPicker();
    picker.classList.remove("hidden");
    listEl.classList.add("hidden");
  }
});

newPlaylistBtn.addEventListener("click", () => {
  const name = prompt("Playlist name:");
  if (!name || !name.trim()) return;
  const id = store.createPlaylist(name.trim());
  store.setActivePlaylist(id);
  picker.classList.add("hidden");
  listEl.classList.remove("hidden");
  updateHeader();
  render();
});

export function initQueue({ onPlay }) {
  onPlayCallback = onPlay;
  updateHeader();
  render();
}

export function add(talk) {
  store.addTalk(store.getActivePlaylistId(), talk);
  render();
}

export function addToPlaylist(playlistId, talk) {
  store.addTalk(playlistId, talk);
  if (playlistId === store.getActivePlaylistId()) render();
}

export function remove(id) {
  store.removeTalk(store.getActivePlaylistId(), id);
  render();
}

export function next() {
  const talk = store.next();
  render();
  return talk;
}

export function getAll() {
  return store.getAll(store.getActivePlaylistId());
}

export function findById(id) {
  return store.findById(store.getActivePlaylistId(), id);
}

export function getPlaylists() {
  return store.getPlaylists();
}

function updateHeader() {
  const pl = store.getPlaylist(store.getActivePlaylistId());
  activeNameEl.textContent = pl ? pl.name : "Queue";
  updateToggleCount();
}

function updateToggleCount() {
  const total = store.getPlaylists().reduce((sum, pl) => sum + pl.talks.length, 0);
  countEl.textContent = String(total);
}

function renderPicker() {
  const playlists = store.getPlaylists();
  const activeId = store.getActivePlaylistId();
  pickerList.innerHTML = "";

  for (const pl of playlists) {
    const el = document.createElement("div");
    el.className = "playlist-picker-item" + (pl.id === activeId ? " active" : "");

    const btn = document.createElement("button");
    btn.className = "playlist-picker-btn";
    btn.innerHTML = `
      <span class="playlist-picker-name">${esc(pl.name)}</span>
      <span class="playlist-picker-count">${pl.talks.length} talk${pl.talks.length !== 1 ? "s" : ""}</span>
    `;
    btn.addEventListener("click", () => {
      store.setActivePlaylist(pl.id);
      picker.classList.add("hidden");
      listEl.classList.remove("hidden");
      updateHeader();
      render();
    });
    el.appendChild(btn);

    // Actions for custom playlists (not queue)
    if (pl.id !== "queue") {
      const actions = document.createElement("div");
      actions.className = "playlist-picker-actions";

      const renameBtn = document.createElement("button");
      renameBtn.className = "playlist-action-btn";
      renameBtn.textContent = "Rename";
      renameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const name = prompt("New name:", pl.name);
        if (!name || !name.trim()) return;
        store.renamePlaylist(pl.id, name.trim());
        updateHeader();
        renderPicker();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "playlist-action-btn delete";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm(`Delete "${pl.name}"?`)) return;
        store.deletePlaylist(pl.id);
        updateHeader();
        renderPicker();
        render();
      });

      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);
      el.appendChild(actions);
    }

    pickerList.appendChild(el);
  }
}

function render() {
  const activeId = store.getActivePlaylistId();
  const talks = store.getAll(activeId);
  updateToggleCount();
  updateHeader();

  if (talks.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Playlist is empty</div>';
    return;
  }

  listEl.innerHTML = "";
  talks.forEach((talk) => {
    const el = document.createElement("div");
    el.className = "queue-item";
    el.innerHTML = `
      <div class="queue-item-info">
        <div class="queue-item-title">${esc(talk.title)}</div>
        <div class="queue-item-teacher">${esc(talk.teacher)}</div>
      </div>
      <button class="queue-play" title="Play">&#9654;</button>
      <button class="queue-remove" title="Remove">&times;</button>
    `;
    el.querySelector(".queue-play").addEventListener("click", () => {
      if (onPlayCallback) onPlayCallback(talk);
    });
    el.querySelector(".queue-remove").addEventListener("click", () => {
      remove(talk.id);
    });
    listEl.appendChild(el);
  });
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

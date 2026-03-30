import { createPlaylistStore } from "./playlist.js";

const store = createPlaylistStore(localStorage);

const listEl = document.getElementById("queue-list");
const countEl = document.getElementById("queue-count");
const panel = document.getElementById("queue-panel");
const toggleBtn = document.getElementById("queue-btn");
const closeBtn = document.getElementById("queue-close");
const playlistSelect = document.getElementById("playlist-select");
const newPlaylistBtn = document.getElementById("new-playlist-btn");
const deletePlaylistBtn = document.getElementById("delete-playlist-btn");
const renamePlaylistBtn = document.getElementById("rename-playlist-btn");

let onPlayCallback = null;

toggleBtn.addEventListener("click", () => panel.classList.toggle("hidden"));
closeBtn.addEventListener("click", () => panel.classList.add("hidden"));

newPlaylistBtn.addEventListener("click", () => {
  const name = prompt("Playlist name:");
  if (!name || !name.trim()) return;
  const id = store.createPlaylist(name.trim());
  store.setActivePlaylist(id);
  renderPlaylistSelector();
  render();
});

deletePlaylistBtn.addEventListener("click", () => {
  const id = store.getActivePlaylistId();
  if (id === "queue") return;
  const pl = store.getPlaylist(id);
  if (!confirm(`Delete "${pl.name}"?`)) return;
  store.deletePlaylist(id);
  renderPlaylistSelector();
  render();
});

renamePlaylistBtn.addEventListener("click", () => {
  const id = store.getActivePlaylistId();
  if (id === "queue") return;
  const pl = store.getPlaylist(id);
  const name = prompt("New name:", pl.name);
  if (!name || !name.trim()) return;
  store.renamePlaylist(id, name.trim());
  renderPlaylistSelector();
});

playlistSelect.addEventListener("change", () => {
  store.setActivePlaylist(playlistSelect.value);
  updatePlaylistActions();
  render();
});

export function initQueue({ onPlay }) {
  onPlayCallback = onPlay;
  renderPlaylistSelector();
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

function renderPlaylistSelector() {
  const playlists = store.getPlaylists();
  const activeId = store.getActivePlaylistId();
  playlistSelect.innerHTML = "";
  for (const pl of playlists) {
    const opt = document.createElement("option");
    opt.value = pl.id;
    opt.textContent = pl.name + (pl.talks.length > 0 ? ` (${pl.talks.length})` : "");
    opt.selected = pl.id === activeId;
    playlistSelect.appendChild(opt);
  }
  updatePlaylistActions();
  updateToggleCount();
}

function updatePlaylistActions() {
  const isDefault = store.getActivePlaylistId() === "queue";
  deletePlaylistBtn.hidden = isDefault;
  renamePlaylistBtn.hidden = isDefault;
}

function updateToggleCount() {
  const total = store.getPlaylists().reduce((sum, pl) => sum + pl.talks.length, 0);
  countEl.textContent = String(total);
}

function render() {
  const activeId = store.getActivePlaylistId();
  const talks = store.getAll(activeId);
  updateToggleCount();
  renderPlaylistSelector();

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

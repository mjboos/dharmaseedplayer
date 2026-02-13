const STORAGE_KEY = "talk_queue";
let talks = loadQueue();

const listEl = document.getElementById("queue-list");
const countEl = document.getElementById("queue-count");
const panel = document.getElementById("queue-panel");
const toggleBtn = document.getElementById("queue-btn");
const closeBtn = document.getElementById("queue-close");

let onPlayCallback = null;

toggleBtn.addEventListener("click", () => panel.classList.toggle("hidden"));
closeBtn.addEventListener("click", () => panel.classList.add("hidden"));

export function initQueue({ onPlay }) {
  onPlayCallback = onPlay;
  render();
}

export function add(talk) {
  if (talks.some((t) => t.id === talk.id)) return;
  talks.push(talk);
  save();
  render();
}

export function remove(id) {
  talks = talks.filter((t) => t.id !== id);
  save();
  render();
}

export function next() {
  if (talks.length === 0) return null;
  const talk = talks.shift();
  save();
  render();
  return talk;
}

export function getAll() {
  return [...talks];
}

export function findById(id) {
  return talks.find((t) => t.id === id) || null;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(talks));
}

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function render() {
  countEl.textContent = String(talks.length);

  if (talks.length === 0) {
    listEl.innerHTML = '<div class="empty-state">Queue is empty</div>';
    return;
  }

  listEl.innerHTML = "";
  talks.forEach((talk, i) => {
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

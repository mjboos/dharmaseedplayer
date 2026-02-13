const POSITIONS_KEY = "player_positions";

const audio = new Audio();
let currentTalk = null;
let onEndedCallback = null;
let onSwitchCallback = null;

const bar = document.getElementById("player-bar");
const titleEl = document.getElementById("player-title");
const teacherEl = document.getElementById("player-teacher");
const playPauseBtn = document.getElementById("player-play-pause");
const rewindBtn = document.getElementById("player-rewind");
const forwardBtn = document.getElementById("player-forward");
const progressEl = document.getElementById("player-progress");
const progressWrap = document.getElementById("player-progress-wrap");
const currentTimeEl = document.getElementById("player-current");
const durationEl = document.getElementById("player-duration");

// --- Per-talk position storage ---

function loadPositions() {
  try {
    return JSON.parse(localStorage.getItem(POSITIONS_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePosition(talkId, time) {
  const positions = loadPositions();
  positions[talkId] = time;
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
}

function clearPosition(talkId) {
  const positions = loadPositions();
  delete positions[talkId];
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
}

export function getPositionForTalk(talkId) {
  return loadPositions()[talkId] || 0;
}

// --- Throttled position save ---

let saveTimer = null;

function saveCurrentPosition() {
  if (currentTalk && audio.currentTime > 0) {
    savePosition(currentTalk.id, audio.currentTime);
  }
}

audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  progressEl.style.width = pct + "%";
  currentTimeEl.textContent = formatTime(audio.currentTime);

  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveCurrentPosition();
    }, 5000);
  }
});

audio.addEventListener("loadedmetadata", () => {
  durationEl.textContent = formatTime(audio.duration);
});

audio.addEventListener("ended", () => {
  playPauseBtn.innerHTML = "&#9654;";
  if (currentTalk) {
    clearPosition(currentTalk.id);
  }
  if (onEndedCallback) onEndedCallback();
});

audio.addEventListener("play", () => {
  playPauseBtn.innerHTML = "&#9646;&#9646;";
});

audio.addEventListener("pause", () => {
  playPauseBtn.innerHTML = "&#9654;";
  saveCurrentPosition();
});

playPauseBtn.addEventListener("click", () => {
  if (audio.paused) audio.play();
  else audio.pause();
});

rewindBtn.addEventListener("click", () => {
  audio.currentTime = Math.max(0, audio.currentTime - 15);
});

forwardBtn.addEventListener("click", () => {
  audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 30);
});

progressWrap.addEventListener("click", (e) => {
  if (!audio.duration) return;
  const rect = progressWrap.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  audio.currentTime = pct * audio.duration;
});

export function play(talk, startTime) {
  // Save position of the talk we're leaving
  saveCurrentPosition();

  currentTalk = talk;

  // Notify listeners so UI can update resume buttons
  if (onSwitchCallback) onSwitchCallback();
  bar.classList.remove("hidden");
  titleEl.textContent = talk.title;
  teacherEl.textContent = talk.teacher;

  audio.src = talk.audioUrl;
  audio.load();

  // If explicit startTime given use that, otherwise check for saved position
  const resumeTime = startTime != null ? startTime : getPositionForTalk(talk.id);

  if (resumeTime > 0) {
    audio.addEventListener("loadedmetadata", function seekOnce() {
      audio.currentTime = resumeTime;
      audio.removeEventListener("loadedmetadata", seekOnce);
    });
  }

  audio.play();
}

export function onEnded(cb) {
  onEndedCallback = cb;
}

export function onSwitch(cb) {
  onSwitchCallback = cb;
}

export function getCurrentTalk() {
  return currentTalk;
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

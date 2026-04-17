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
const progressThumbEl = document.getElementById("player-progress-thumb");
const progressWrap = document.getElementById("player-progress-wrap");
const currentTimeEl = document.getElementById("player-current");
const durationEl = document.getElementById("player-duration");

let isDraggingProgress = false;
let dragProgressTime = 0;

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateProgressUiForTime(time) {
  const hasDuration = Number.isFinite(audio.duration) && audio.duration > 0;
  const safeTime = hasDuration ? clamp(time || 0, 0, audio.duration) : 0;
  const pct = hasDuration ? (safeTime / audio.duration) * 100 : 0;
  progressEl.style.width = pct + "%";
  progressThumbEl.style.left = pct + "%";
  currentTimeEl.textContent = formatTime(safeTime);
  durationEl.textContent = hasDuration ? formatTime(audio.duration) : "0:00";
}

function updateProgressUi() {
  updateProgressUiForTime(audio.currentTime || 0);
}

function getSeekTimeFromClientX(clientX) {
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return 0;
  const rect = progressWrap.getBoundingClientRect();
  const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
  return pct * audio.duration;
}

function beginProgressDrag(e) {
  if (!audio.duration) return;
  isDraggingProgress = true;
  dragProgressTime = getSeekTimeFromClientX(e.clientX);
  progressWrap.classList.add("dragging");
  progressWrap.setPointerCapture(e.pointerId);
  updateProgressUiForTime(dragProgressTime);
}

function moveProgressDrag(e) {
  if (!isDraggingProgress || !audio.duration) return;
  dragProgressTime = getSeekTimeFromClientX(e.clientX);
  updateProgressUiForTime(dragProgressTime);
}

function endProgressDrag(e) {
  if (!isDraggingProgress) return;
  if (audio.duration) {
    dragProgressTime = getSeekTimeFromClientX(e.clientX);
    audio.currentTime = dragProgressTime;
    updateProgressUi();
    saveCurrentPosition();
  }
  isDraggingProgress = false;
  progressWrap.classList.remove("dragging");
}

audio.addEventListener("timeupdate", () => {
  if (!audio.duration || isDraggingProgress) return;
  updateProgressUi();

  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveCurrentPosition();
    }, 5000);
  }
});

audio.addEventListener("loadedmetadata", () => {
  updateProgressUi();
});

audio.addEventListener("ended", () => {
  playPauseBtn.innerHTML = "&#9654;";
  updateProgressUi();
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

progressWrap.addEventListener("pointerdown", beginProgressDrag);
progressWrap.addEventListener("pointermove", moveProgressDrag);
progressWrap.addEventListener("pointerup", endProgressDrag);
progressWrap.addEventListener("pointercancel", endProgressDrag);

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
  progressEl.style.width = "0%";
  progressThumbEl.style.left = "0%";
  currentTimeEl.textContent = "0:00";
  durationEl.textContent = "0:00";

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

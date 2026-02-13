import { searchTalks, searchTeachers, getTeacherTalks, getRetreatTalks } from "./api.js";
import { getPositionForTalk, formatTime } from "./player.js";

let currentQuery = "";
let currentPage = 1;
let activeTeacherId = null;
let activeTeacherName = "";
let activeRetreatId = null;
let activeRetreatName = "";
let teacherQuery = "";
let loading = false;
let playHandler = null;
let queueHandler = null;
let queueAddAllHandler = null;

const resultsEl = document.getElementById("search-results");
const loadMoreBtn = document.getElementById("load-more");

export function initSearch({ onPlay, onQueue, onQueueAll }) {
  playHandler = onPlay;
  queueHandler = onQueue;
  queueAddAllHandler = onQueueAll;
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    currentQuery = q;
    currentPage = 1;
    activeTeacherId = null;
    activeRetreatId = null;
    resultsEl.innerHTML = "";
    loadMoreBtn.hidden = true;
    doSearch();
  });

  loadMoreBtn.addEventListener("click", () => {
    currentPage++;
    if (activeRetreatId) {
      loadRetreatTalks(activeRetreatId, false);
    } else if (activeTeacherId) {
      loadTeacherTalks(activeTeacherId, false);
    } else {
      doSearch(false);
    }
  });
}

// Called by player when switching talks so visible results update
export function refreshResumeButtons() {
  for (const el of resultsEl.querySelectorAll(".talk-item")) {
    const talkId = el.dataset.talkId;
    if (!talkId) continue;
    const actions = el.querySelector(".talk-actions");
    const existing = el.querySelector(".resume-btn");
    const savedPos = getPositionForTalk(Number(talkId));

    if (savedPos > 0 && !existing) {
      const btn = document.createElement("button");
      btn.className = "resume-btn";
      btn.textContent = `Resume ${formatTime(savedPos)}`;
      const talkData = JSON.parse(el.dataset.talk);
      btn.addEventListener("click", () => playHandler(talkData));
      const playBtn = actions.querySelector(".play-btn");
      playBtn.after(btn);
    } else if (savedPos > 0 && existing) {
      existing.textContent = `Resume ${formatTime(savedPos)}`;
    } else if (savedPos === 0 && existing) {
      existing.remove();
    }
  }
}

async function doSearch(clear = true) {
  if (loading) return;
  loading = true;

  if (clear) {
    resultsEl.innerHTML = '<div class="loading">Searching...</div>';
  } else {
    resultsEl.insertAdjacentHTML("beforeend", '<div class="loading">Loading...</div>');
  }

  try {
    // Search talks and teachers in parallel (only on first page)
    const promises = [searchTalks(currentQuery, currentPage)];
    if (currentPage === 1) {
      promises.push(searchTeachers(currentQuery));
    }

    const [talkResult, teacherResult] = await Promise.all(promises);

    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());

    // Show matching teachers above talk results (first page only)
    if (teacherResult && teacherResult.teachers.length > 0) {
      const teacherSection = document.createElement("div");
      teacherSection.className = "teacher-results";
      teacherSection.innerHTML = `<div class="teacher-results-label">Teachers</div>`;
      for (const teacher of teacherResult.teachers) {
        const chip = document.createElement("button");
        chip.className = "teacher-chip";
        chip.textContent = teacher.name;
        chip.addEventListener("click", () => {
          activeTeacherId = teacher.id;
          activeTeacherName = teacher.name;
          activeRetreatId = null;
          teacherQuery = "";
          currentPage = 1;
          resultsEl.innerHTML = "";
          loadMoreBtn.hidden = true;
          loadTeacherTalks(teacher.id, true);
        });
        teacherSection.appendChild(chip);
      }
      resultsEl.appendChild(teacherSection);
    }

    if (talkResult.talks.length === 0 && currentPage === 1 && (!teacherResult || teacherResult.teachers.length === 0)) {
      resultsEl.innerHTML = '<div class="empty-state">No talks found</div>';
      loadMoreBtn.hidden = true;
      return;
    }

    for (const talk of talkResult.talks) {
      resultsEl.appendChild(renderTalk(talk));
    }

    loadMoreBtn.hidden = !talkResult.hasMore;
  } catch (err) {
    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());
    resultsEl.insertAdjacentHTML("beforeend", '<div class="empty-state">Search failed. Try again.</div>');
  } finally {
    loading = false;
  }
}

function renderTeacherHeader(teacherName) {
  const header = document.createElement("div");
  header.className = "teacher-page-header";
  header.innerHTML = `
    <div class="teacher-page-name">${esc(teacherName)}</div>
    <form class="teacher-filter-form">
      <input type="search" class="teacher-filter-input" placeholder="Search this teacher's talks..." autocomplete="off" />
      <button type="submit">Filter</button>
    </form>
  `;
  const filterForm = header.querySelector(".teacher-filter-form");
  filterForm.addEventListener("submit", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const input = filterForm.querySelector(".teacher-filter-input");
    teacherQuery = input.value.trim();
    currentPage = 1;
    for (const child of [...resultsEl.children]) {
      if (!child.classList.contains("teacher-page-header")) child.remove();
    }
    loadMoreBtn.hidden = true;
    loadTeacherTalks(activeTeacherId, false);
  });
  return header;
}

async function loadTeacherTalks(teacherId, clear) {
  if (loading) return;
  loading = true;

  if (clear) {
    resultsEl.innerHTML = "";
    resultsEl.appendChild(renderTeacherHeader(activeTeacherName));
  }
  resultsEl.insertAdjacentHTML("beforeend", '<div class="loading">Loading...</div>');

  try {
    const result = await getTeacherTalks(teacherId, currentPage, teacherQuery);
    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());

    if (result.talks.length === 0 && currentPage === 1) {
      resultsEl.insertAdjacentHTML("beforeend", '<div class="empty-state">No talks found</div>');
      loadMoreBtn.hidden = true;
      return;
    }

    for (const talk of result.talks) {
      resultsEl.appendChild(renderTalk(talk));
    }

    loadMoreBtn.hidden = !result.hasMore;
  } catch (err) {
    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());
    resultsEl.insertAdjacentHTML("beforeend", '<div class="empty-state">Failed to load teacher talks.</div>');
  } finally {
    loading = false;
  }
}

// --- Retreat page ---

function renderRetreatHeader(retreatName) {
  const header = document.createElement("div");
  header.className = "retreat-page-header";
  header.innerHTML = `
    <div class="retreat-page-name">${esc(retreatName)}</div>
    <button class="queue-all-btn">Add all to queue</button>
  `;
  header.querySelector(".queue-all-btn").addEventListener("click", () => {
    const talkEls = resultsEl.querySelectorAll(".talk-item");
    const talks = [...talkEls].map((el) => JSON.parse(el.dataset.talk));
    if (queueAddAllHandler) queueAddAllHandler(talks);
  });
  return header;
}

export function openRetreat(retreatId, retreatName) {
  activeRetreatId = retreatId;
  activeRetreatName = retreatName || "Retreat";
  activeTeacherId = null;
  currentPage = 1;
  resultsEl.innerHTML = "";
  loadMoreBtn.hidden = true;
  loadRetreatTalks(retreatId, true);
}

async function loadRetreatTalks(retreatId, clear) {
  if (loading) return;
  loading = true;

  if (clear) {
    resultsEl.innerHTML = "";
    resultsEl.appendChild(renderRetreatHeader(activeRetreatName));
  }
  resultsEl.insertAdjacentHTML("beforeend", '<div class="loading">Loading...</div>');

  try {
    const result = await getRetreatTalks(retreatId, currentPage);
    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());

    // Update header with server-provided retreat title if we only had a stub
    if (result.retreatTitle && activeRetreatName === "Retreat") {
      activeRetreatName = result.retreatTitle;
      const nameEl = resultsEl.querySelector(".retreat-page-name");
      if (nameEl) nameEl.textContent = result.retreatTitle;
    }

    if (result.talks.length === 0 && currentPage === 1) {
      resultsEl.insertAdjacentHTML("beforeend", '<div class="empty-state">No talks found</div>');
      loadMoreBtn.hidden = true;
      return;
    }

    for (const talk of result.talks) {
      resultsEl.appendChild(renderTalk(talk));
    }

    loadMoreBtn.hidden = !result.hasMore;
  } catch (err) {
    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());
    resultsEl.insertAdjacentHTML("beforeend", '<div class="empty-state">Failed to load retreat talks.</div>');
  } finally {
    loading = false;
  }
}

// --- Talk rendering ---

function renderTalk(talk) {
  const el = document.createElement("div");
  el.className = "talk-item";
  el.dataset.talkId = String(talk.id);
  el.dataset.talk = JSON.stringify(talk);

  const savedPos = getPositionForTalk(talk.id);

  el.innerHTML = `
    <div class="talk-item-header">
      <span class="talk-title">${esc(talk.title)}</span>
    </div>
    <div class="talk-meta">
      <span>${esc(talk.teacher)}</span>
      <span>${esc(talk.date)}</span>
      <span>${talk.durationMinutes} min</span>
    </div>
    ${talk.retreatTitle && !activeRetreatId ? `<div class="talk-retreat"><button class="retreat-link" data-retreat-id="${talk.retreatId}">${esc(talk.retreatTitle)}</button></div>` : ""}
    <div class="talk-actions">
      <button class="play-btn">Play</button>
      ${savedPos > 0 ? `<button class="resume-btn">Resume ${formatTime(savedPos)}</button>` : ""}
      <button class="queue-btn">+ Queue</button>
    </div>
  `;
  el.querySelector(".play-btn").addEventListener("click", () => playHandler(talk, 0));
  const resumeBtn = el.querySelector(".resume-btn");
  if (resumeBtn) {
    resumeBtn.addEventListener("click", () => playHandler(talk));
  }
  el.querySelector(".queue-btn").addEventListener("click", () => queueHandler(talk));
  const retreatLink = el.querySelector(".retreat-link");
  if (retreatLink) {
    retreatLink.addEventListener("click", () => {
      openRetreat(talk.retreatId, talk.retreatTitle);
    });
  }
  return el;
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

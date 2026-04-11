import { searchTalks, searchTeachers, getTeacherTalks, getTeacherRetreats, getRetreatTalks } from "./api.js";
import { getPositionForTalk, formatTime } from "./player.js";

let currentQuery = "";
let currentPage = 1;
let activeTeacherId = null;
let activeTeacherName = "";
let activeRetreatId = null;
let activeRetreatName = "";
let teacherQuery = "";
let loading = false;
let viewVersion = 0;
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
    viewVersion++;
    loading = false;
    resultsEl.innerHTML = "";
    loadMoreBtn.hidden = true;
    if (window.location.hash) history.pushState(null, "", window.location.pathname + window.location.search);
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

  window.addEventListener("popstate", () => {
    const match = window.location.hash.match(/^#retreat\/(\d+)$/);
    if (match) {
      const id = parseInt(match[1], 10);
      if (activeRetreatId !== id) showRetreat(id, "Retreat");
    } else if (activeRetreatId) {
      activeRetreatId = null;
      activeTeacherId = null;
      viewVersion++;
      loading = false;
      resultsEl.innerHTML = "";
      loadMoreBtn.hidden = true;
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
  const myVersion = viewVersion;
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

    if (myVersion !== viewVersion) return;

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
          viewVersion++;
          loading = false;
          resultsEl.innerHTML = "";
          loadMoreBtn.hidden = true;
          if (window.location.hash) history.pushState(null, "", window.location.pathname + window.location.search);
          resultsEl.appendChild(renderTeacherHeader(activeTeacherName));
          loadTeacherRetreats(teacher.id);
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
    if (myVersion !== viewVersion) return;
    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());
    resultsEl.insertAdjacentHTML("beforeend", '<div class="empty-state">Search failed. Try again.</div>');
  } finally {
    if (myVersion === viewVersion) loading = false;
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
    viewVersion++;
    loading = false;
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
  const myVersion = viewVersion;
  loading = true;

  if (clear) {
    resultsEl.innerHTML = "";
    resultsEl.appendChild(renderTeacherHeader(activeTeacherName));
  }
  resultsEl.insertAdjacentHTML("beforeend", '<div class="loading">Loading...</div>');

  try {
    const result = await getTeacherTalks(teacherId, currentPage, teacherQuery);

    if (myVersion !== viewVersion) return;

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
    if (myVersion !== viewVersion) return;
    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());
    resultsEl.insertAdjacentHTML("beforeend", '<div class="empty-state">Failed to load teacher talks.</div>');
  } finally {
    if (myVersion === viewVersion) loading = false;
  }
}

async function loadTeacherRetreats(teacherId) {
  if (loading) return;
  const myVersion = viewVersion;
  loading = true;

  resultsEl.insertAdjacentHTML("beforeend", '<div class="loading">Loading...</div>');

  try {
    const result = await getTeacherRetreats(teacherId);

    if (myVersion !== viewVersion) return;

    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());

    // Fall back to showing talks if teacher has no retreats
    if (!result.retreats || result.retreats.length === 0) {
      loading = false;
      loadTeacherTalks(teacherId, false);
      return;
    }

    const header = resultsEl.querySelector(".teacher-page-header");
    if (!header) return;

    const section = document.createElement("div");
    section.className = "teacher-retreats expanded";
    section.innerHTML = `<div class="teacher-retreats-label">Retreats (${result.retreats.length})</div>`;

    const list = document.createElement("div");
    list.className = "teacher-retreats-list";

    for (const retreat of result.retreats) {
      const btn = document.createElement("button");
      btn.className = "retreat-chip";
      btn.innerHTML = `<span class="retreat-chip-date">${esc(retreat.date)}</span> ${esc(retreat.name)}`;
      btn.addEventListener("click", () => {
        openRetreat(retreat.id, retreat.name);
      });
      list.appendChild(btn);
    }

    section.querySelector(".teacher-retreats-label").addEventListener("click", () => {
      list.hidden = !list.hidden;
      section.classList.toggle("expanded");
    });

    section.appendChild(list);
    header.after(section);
  } catch (err) {
    if (myVersion !== viewVersion) return;
    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());
    resultsEl.insertAdjacentHTML("beforeend", '<div class="empty-state">Failed to load retreats.</div>');
  } finally {
    if (myVersion === viewVersion) loading = false;
  }
}

// --- Retreat page ---

function renderRetreatHeader(retreatName) {
  const header = document.createElement("div");
  header.className = "retreat-page-header";
  header.innerHTML = `
    <div class="retreat-page-name">${esc(retreatName)}</div>
    <div class="retreat-header-actions">
      <button class="share-btn" title="Copy link to retreat">Share</button>
      <button class="queue-all-btn">Add all to "${esc(document.getElementById("playlist-active-name")?.textContent || "Queue")}"</button>
    </div>
  `;
  header.querySelector(".share-btn").addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      e.target.textContent = "Copied!";
      setTimeout(() => { e.target.textContent = "Share"; }, 2000);
    } catch {
      prompt("Copy this link:", window.location.href);
    }
  });
  header.querySelector(".queue-all-btn").addEventListener("click", () => {
    const talkEls = resultsEl.querySelectorAll(".talk-item");
    const talks = [...talkEls].map((el) => JSON.parse(el.dataset.talk));
    if (queueAddAllHandler) queueAddAllHandler(talks);
  });
  return header;
}

function showRetreat(retreatId, retreatName) {
  activeRetreatId = retreatId;
  activeRetreatName = retreatName || "Retreat";
  activeTeacherId = null;
  currentPage = 1;
  viewVersion++;
  loading = false;
  resultsEl.innerHTML = "";
  loadMoreBtn.hidden = true;
  loadRetreatTalks(retreatId, true);
}

export function openRetreat(retreatId, retreatName) {
  history.pushState(null, "", `#retreat/${retreatId}`);
  showRetreat(retreatId, retreatName);
}

export function checkInitialHash() {
  const match = window.location.hash.match(/^#retreat\/(\d+)$/);
  if (match) {
    showRetreat(parseInt(match[1], 10), "Retreat");
  }
}

async function loadRetreatTalks(retreatId, clear) {
  if (loading) return;
  const myVersion = viewVersion;
  loading = true;

  if (clear) {
    resultsEl.innerHTML = "";
    resultsEl.appendChild(renderRetreatHeader(activeRetreatName));
  }
  resultsEl.insertAdjacentHTML("beforeend", '<div class="loading">Loading...</div>');

  try {
    const result = await getRetreatTalks(retreatId, currentPage);

    if (myVersion !== viewVersion) return;

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
    if (myVersion !== viewVersion) return;
    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());
    resultsEl.insertAdjacentHTML("beforeend", '<div class="empty-state">Failed to load retreat talks.</div>');
  } finally {
    if (myVersion === viewVersion) loading = false;
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
      <button class="queue-btn">+ ${esc(document.getElementById("playlist-active-name")?.textContent || "Queue")}</button>
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

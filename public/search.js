import { searchTalks, matchTeachers, getTeacherRetreats, getRetreatTalks, getTalkDetail } from "./api.js";
import { getPositionForTalk, formatTime } from "./player.js";
import { linkTo, copyLink } from "./share.js";

let currentQuery = "";
let currentPage = 1;
let activeTeacherId = null;
let activeTeacherName = "";
let activeRetreatId = null;
let activeRetreatName = "";
let activeTalkId = null;
let teacherQuery = "";
let scopeTeacher = null; // { id, name } shown as a chip in the search box
let loading = false;
let viewVersion = 0;
let playHandler = null;
let queueHandler = null;
let queueAddAllHandler = null;

let suggestTimer = null;
let suggestVersion = 0;
let suggestions = [];
let activeSuggestion = -1;

const resultsEl = document.getElementById("search-results");
const loadMoreBtn = document.getElementById("load-more");
const inputEl = document.getElementById("search-input");
const scopeEl = document.getElementById("search-scope");
const scopeNameEl = document.getElementById("search-scope-name");
const suggestionsEl = document.getElementById("search-suggestions");
const defaultPlaceholder = inputEl.placeholder;

export function initSearch({ onPlay, onQueue, onQueueAll }) {
  playHandler = onPlay;
  queueHandler = onQueue;
  queueAddAllHandler = onQueueAll;
  const form = document.getElementById("search-form");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    closeSuggestions();
    runSearch();
  });

  document.getElementById("search-scope-clear").addEventListener("click", () => {
    clearScope();
    inputEl.focus();
  });

  initSuggestions();

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
    const route = parseHash();
    if (route?.type === "retreat") {
      if (activeRetreatId !== route.id) showRetreat(route.id, "Retreat");
    } else if (route?.type === "talk") {
      if (activeTalkId !== route.id) showTalk(route.id);
    } else if (activeRetreatId || activeTalkId) {
      activeRetreatId = null;
      activeTalkId = null;
      activeTeacherId = null;
      viewVersion++;
      loading = false;
      resultsEl.innerHTML = "";
      loadMoreBtn.hidden = true;
    }
  });
}

function resetResults() {
  currentPage = 1;
  viewVersion++;
  loading = false;
  resultsEl.innerHTML = "";
  loadMoreBtn.hidden = true;
  if (window.location.hash) history.pushState(null, "", window.location.pathname + window.location.search);
}

function runSearch() {
  const q = inputEl.value.trim();
  if (!q && !scopeTeacher) return;
  resetResults();
  activeRetreatId = null;
  activeTalkId = null;
  if (scopeTeacher) {
    showTeacher(scopeTeacher, q);
  } else {
    activeTeacherId = null;
    currentQuery = q;
    doSearch();
  }
}

function openTeacher(teacher) {
  closeSuggestions();
  setScope(teacher, "");
  runSearch();
  window.scrollTo(0, 0);
}

function showTeacher(teacher, q) {
  activeTeacherId = teacher.id;
  activeTeacherName = teacher.name;
  teacherQuery = q;
  resultsEl.appendChild(renderTeacherHeader(teacher.name));
  if (q) {
    loadTeacherTalks(teacher.id, false);
  } else {
    loadTeacherRetreats(teacher.id);
  }
}

// --- Teacher chip in the search box ---

function setScope(teacher, text) {
  scopeTeacher = { id: teacher.id, name: teacher.name };
  scopeNameEl.textContent = teacher.name;
  scopeEl.hidden = false;
  inputEl.value = text;
  inputEl.placeholder = "Search their talks...";
}

function clearScope() {
  scopeTeacher = null;
  scopeEl.hidden = true;
  inputEl.placeholder = defaultPlaceholder;
}

// --- Teacher suggestions while typing ---

function initSuggestions() {
  inputEl.addEventListener("input", () => {
    clearTimeout(suggestTimer);
    const q = inputEl.value;
    if (scopeTeacher || q.trim().length < 2) {
      closeSuggestions();
      return;
    }
    suggestTimer = setTimeout(() => fetchSuggestions(q), 200);
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && scopeTeacher && inputEl.value === "") {
      clearScope();
      return;
    }
    if (suggestionsEl.hidden) return;
    const n = suggestions.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      activeSuggestion = e.key === "ArrowDown"
        ? (activeSuggestion + 1) % n
        : (activeSuggestion - 1 + n) % n;
      highlightSuggestion();
    } else if (e.key === "Enter" && activeSuggestion >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeSuggestion]);
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  });

  inputEl.addEventListener("blur", () => closeSuggestions());
  // Keep focus in the input so tapping a suggestion doesn't close the list first
  suggestionsEl.addEventListener("mousedown", (e) => e.preventDefault());
}

async function fetchSuggestions(q) {
  const myVersion = ++suggestVersion;
  let result;
  try {
    result = await matchTeachers(q, { partial: true });
  } catch {
    return;
  }
  if (myVersion !== suggestVersion || scopeTeacher || document.activeElement !== inputEl) return;
  renderSuggestions(result.matches);
}

function renderSuggestions(matches) {
  if (matches.length === 0) {
    closeSuggestions();
    return;
  }
  suggestions = matches;
  activeSuggestion = -1;
  suggestionsEl.innerHTML = "";
  matches.forEach((match, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestion";
    btn.id = `search-suggestion-${i}`;
    btn.tabIndex = -1;
    btn.setAttribute("role", "option");
    btn.innerHTML = `
      <span class="suggestion-name">${esc(match.name)}</span>
      <span class="suggestion-rest">${match.rest ? `Talks matching “${esc(match.rest)}”` : "Teacher"}</span>
    `;
    btn.addEventListener("click", () => selectSuggestion(match));
    suggestionsEl.appendChild(btn);
  });
  suggestionsEl.hidden = false;
  inputEl.setAttribute("aria-expanded", "true");
}

function highlightSuggestion() {
  [...suggestionsEl.children].forEach((el, i) => el.classList.toggle("active", i === activeSuggestion));
  inputEl.setAttribute("aria-activedescendant", `search-suggestion-${activeSuggestion}`);
}

function selectSuggestion(match) {
  closeSuggestions();
  setScope(match, match.rest);
  runSearch();
}

function closeSuggestions() {
  clearTimeout(suggestTimer);
  suggestVersion++;
  suggestions = [];
  activeSuggestion = -1;
  suggestionsEl.hidden = true;
  suggestionsEl.innerHTML = "";
  inputEl.setAttribute("aria-expanded", "false");
  inputEl.removeAttribute("aria-activedescendant");
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
    // Search talks and look for teacher names in the query in parallel (only on first page)
    const promises = [searchTalks(currentQuery, currentPage)];
    if (currentPage === 1) {
      promises.push(matchTeachers(currentQuery));
    }

    const [talkResult, teacherResult] = await Promise.all(promises);

    if (myVersion !== viewVersion) return;

    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());

    // Offer matching teachers above talk results; picking one scopes the search to them
    const matches = teacherResult ? teacherResult.matches : [];
    if (matches.length > 0) {
      const teacherSection = document.createElement("div");
      teacherSection.className = "teacher-results";
      const label = matches.some((m) => m.rest) ? "Search within a teacher" : "Teachers";
      teacherSection.innerHTML = `<div class="teacher-results-label">${label}</div>`;
      for (const match of matches) {
        const chip = document.createElement("button");
        chip.className = "teacher-chip";
        chip.innerHTML = match.rest
          ? `${esc(match.name)} <span class="teacher-chip-rest">· ${esc(match.rest)}</span>`
          : esc(match.name);
        chip.addEventListener("click", () => {
          setScope(match, match.rest);
          runSearch();
        });
        teacherSection.appendChild(chip);
      }
      resultsEl.appendChild(teacherSection);
    }

    if (talkResult.talks.length === 0 && currentPage === 1 && matches.length === 0) {
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
  header.innerHTML = `<div class="teacher-page-name">${esc(teacherName)}</div>`;
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
    const result = await searchTalks(teacherQuery, currentPage, teacherId);

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

    const allTalksBtn = document.createElement("button");
    allTalksBtn.className = "all-talks-btn";
    allTalksBtn.textContent = "Show all talks";
    allTalksBtn.addEventListener("click", () => {
      allTalksBtn.remove();
      list.hidden = true;
      section.classList.remove("expanded");
      loadTeacherTalks(teacherId, false);
    });

    section.appendChild(list);
    header.after(allTalksBtn, section);
  } catch (err) {
    if (myVersion !== viewVersion) return;
    resultsEl.querySelectorAll(".loading").forEach((el) => el.remove());
    resultsEl.insertAdjacentHTML("beforeend", '<div class="empty-state">Failed to load retreats.</div>');
  } finally {
    if (myVersion === viewVersion) loading = false;
  }
}

// --- Retreat page ---

function renderRetreatHeader(retreatId, retreatName) {
  const header = document.createElement("div");
  header.className = "retreat-page-header";
  header.innerHTML = `
    <div class="retreat-page-name">${esc(retreatName)}</div>
    <div class="retreat-header-actions">
      <button class="share-btn" title="Copy link to retreat">Share</button>
      <button class="queue-all-btn">Add all to "${esc(document.getElementById("playlist-active-name")?.textContent || "Queue")}"</button>
    </div>
  `;
  const shareBtn = header.querySelector(".share-btn");
  shareBtn.addEventListener("click", () => copyLink(linkTo(`retreat/${retreatId}`), shareBtn));
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
  activeTalkId = null;
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

// Shareable pages: #retreat/<id> or #talk/<id>
function parseHash() {
  const match = window.location.hash.match(/^#(retreat|talk)\/(\d+)$/);
  return match ? { type: match[1], id: parseInt(match[2], 10) } : null;
}

export function checkInitialHash() {
  const route = parseHash();
  if (route?.type === "retreat") showRetreat(route.id, "Retreat");
  else if (route?.type === "talk") showTalk(route.id);
}

async function loadRetreatTalks(retreatId, clear) {
  if (loading) return;
  const myVersion = viewVersion;
  loading = true;

  if (clear) {
    resultsEl.innerHTML = "";
    resultsEl.appendChild(renderRetreatHeader(retreatId, activeRetreatName));
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

// --- Talk page (opened from a shared #talk/<id> link) ---

async function showTalk(talkId) {
  activeTalkId = talkId;
  activeRetreatId = null;
  activeTeacherId = null;
  currentPage = 1;
  viewVersion++;
  const myVersion = viewVersion;
  loading = false;
  resultsEl.innerHTML = '<div class="loading">Loading...</div>';
  loadMoreBtn.hidden = true;

  try {
    // Keep the description out of the talk so it isn't stored in playlists
    const { description, ...talk } = await getTalkDetail(talkId);
    if (myVersion !== viewVersion) return;
    const el = renderTalk(talk);
    if (description) {
      el.querySelector(".talk-meta").insertAdjacentHTML("afterend", `<p class="talk-description">${esc(description)}</p>`);
    }
    resultsEl.innerHTML = "";
    resultsEl.appendChild(el);
  } catch {
    if (myVersion !== viewVersion) return;
    resultsEl.innerHTML = '<div class="empty-state">Failed to load talk.</div>';
  }
}

// --- Talk rendering ---

function renderTalk(talk) {
  const el = document.createElement("div");
  el.className = "talk-item";
  el.dataset.talkId = String(talk.id);
  el.dataset.talk = JSON.stringify(talk);

  const savedPos = getPositionForTalk(talk.id);
  const linkTeacher = talk.teacherId && talk.teacher && talk.teacherId !== activeTeacherId;

  el.innerHTML = `
    <div class="talk-item-header">
      <span class="talk-title">${esc(talk.title)}</span>
    </div>
    <div class="talk-meta">
      ${linkTeacher
        ? `<button type="button" class="teacher-link">${esc(talk.teacher)}</button>`
        : `<span>${esc(talk.teacher)}</span>`}
      <span>${esc(talk.date)}</span>
      <span>${talk.durationMinutes} min</span>
    </div>
    ${talk.retreatId && !activeRetreatId ? `<div class="talk-retreat"><button class="retreat-link" data-retreat-id="${talk.retreatId}">${esc(talk.retreatTitle || "Retreat")}</button></div>` : ""}
    <div class="talk-actions">
      <button class="play-btn">Play</button>
      ${savedPos > 0 ? `<button class="resume-btn">Resume ${formatTime(savedPos)}</button>` : ""}
      <button class="queue-btn">+ ${esc(document.getElementById("playlist-active-name")?.textContent || "Queue")}</button>
      <button class="share-talk-btn" title="Copy link to talk">Share</button>
    </div>
  `;
  el.querySelector(".play-btn").addEventListener("click", () => playHandler(talk, 0));
  const resumeBtn = el.querySelector(".resume-btn");
  if (resumeBtn) {
    resumeBtn.addEventListener("click", () => playHandler(talk));
  }
  el.querySelector(".queue-btn").addEventListener("click", () => queueHandler(talk));
  const shareBtn = el.querySelector(".share-talk-btn");
  shareBtn.addEventListener("click", () => copyLink(linkTo(`talk/${talk.id}`), shareBtn));
  const teacherLink = el.querySelector(".teacher-link");
  if (teacherLink) {
    teacherLink.addEventListener("click", () => {
      openTeacher({ id: talk.teacherId, name: talk.teacher });
    });
  }
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

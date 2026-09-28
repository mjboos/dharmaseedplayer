import type { Talk, TalkDetail, SearchResponse, Teacher, TeacherSearchResponse, TeacherMatch, TeacherMatchResponse, Retreat, TeacherRetreatsResponse } from "../shared/types.js";

const BASE = "https://www.dharmaseed.org";

// Simple in-memory cache with TTL
const cache = new Map<string, { value: string; expires: number }>();

function cacheGet(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key: string, value: string, ttlMs = 24 * 60 * 60 * 1000) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

export async function searchTalks(
  query: string,
  page: number
): Promise<SearchResponse> {
  const url = `${BASE}/talks/?search=${encodeURIComponent(query)}&sort=-rec_date&page=${page}&page_items=25`;
  const res = await fetch(url, {
    headers: { "User-Agent": "DharmaSeedPlayer/1.0" },
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const html = await res.text();
  return parseTalkList(html, page);
}

function parseTalkList(html: string, page: number): SearchResponse {
  const talks: Talk[] = [];

  // Split the full HTML by talk table blocks and extract from each.
  // Works for both /talks/?search= pages and /teacher/ID/ pages.
  const tableBlocks = html.split(/<table width='100%'>/);

  for (const block of tableBlocks) {

    // Extract talk ID and title
    const titleMatch = block.match(
      /<a\s+class="talkteacher"\s+href="\/talks\/(\d+)"\s*>\s*([\s\S]*?)\s*<\/a>/
    );
    if (!titleMatch) continue;

    const id = parseInt(titleMatch[1], 10);
    const title = decodeEntities(titleMatch[2].trim());

    // Extract date (YYYY-MM-DD)
    const dateMatch = block.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : "";

    // Extract duration (H:MM:SS or MM:SS)
    const durationMatch = block.match(/<i>(\d+:\d{2}(?::\d{2})?)<\/i>/);
    const durationMinutes = durationMatch
      ? parseDuration(durationMatch[1])
      : 0;

    // Extract teacher name
    const teacherMatch = block.match(
      /<a\s+class='talkteacher'\s+href="\/teacher\/(\d+)">([\s\S]*?)<\/a>/
    );
    const teacherId = teacherMatch ? parseInt(teacherMatch[1], 10) : undefined;
    const teacher = teacherMatch
      ? decodeEntities(teacherMatch[2].trim())
      : "";

    // Extract audio URL
    const audioMatch = block.match(/href="(\/talks\/\d+\/[^"]*\.mp3)"/);
    const audioUrl = audioMatch ? `${BASE}${audioMatch[1]}` : "";

    // Extract retreat info
    const retreatMatch = block.match(
      /href="\/retreats\/(\d+)\/">\s*<i>([\s\S]*?)<\/i>/
    );
    const retreatId = retreatMatch ? parseInt(retreatMatch[1], 10) : undefined;
    const retreatTitle = retreatMatch
      ? decodeEntities(retreatMatch[2].trim())
      : undefined;

    talks.push({ id, title, teacher, teacherId, durationMinutes, date, audioUrl, retreatId, retreatTitle });
  }

  // Check if there's a next page
  const hasMore = /class="next">next/.test(html);

  return { talks, page, hasMore };
}

function parseDuration(str: string): number {
  const parts = str.split(":").map(Number);
  if (parts.length === 3) {
    return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
  }
  return Math.round(parts[0] + parts[1] / 60);
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export interface TeacherRecord extends Teacher {
  isPublic: boolean;
}

// Cached list of all teachers (loaded once from JSON API)
let allTeachers: TeacherRecord[] | null = null;
let teacherListLoading: Promise<TeacherRecord[]> | null = null;

async function loadAllTeachers(): Promise<TeacherRecord[]> {
  if (allTeachers) return allTeachers;
  if (teacherListLoading) return teacherListLoading;

  teacherListLoading = (async () => {
    try {
      // Step 1: Get all teacher IDs
      const idsBody = new URLSearchParams({ detail: "0" });
      const idsRes = await fetch(`${BASE}/api/1/teachers/`, {
        method: "POST",
        body: idsBody,
        headers: { "User-Agent": "DharmaSeedPlayer/1.0" },
      });
      if (!idsRes.ok) throw new Error(`Teacher list failed: ${idsRes.status}`);
      const idsJson = (await idsRes.json()) as { items?: number[] };
      const ids = idsJson.items || [];

      // Step 2: Batch fetch teacher details (500 at a time)
      const teachers: TeacherRecord[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        const body = new URLSearchParams({
          detail: "1",
          items: batch.join(","),
        });
        const res = await fetch(`${BASE}/api/1/teachers/`, {
          method: "POST",
          body,
          headers: { "User-Agent": "DharmaSeedPlayer/1.0" },
        });
        if (!res.ok) {
          throw new Error(`Teacher detail batch failed: ${res.status}`);
        }
        const json = (await res.json()) as {
          items?: Record<string, { name?: string; public?: boolean }>;
        };
        if (json.items) {
          for (const [idStr, data] of Object.entries(json.items)) {
            if (data.name) {
              teachers.push({
                id: parseInt(idStr, 10),
                name: data.name,
                isPublic: data.public === true,
              });
            }
          }
        }
      }

      allTeachers = teachers;
      return teachers;
    } finally {
      teacherListLoading = null;
    }
  })();

  return teacherListLoading;
}

export async function searchTeachers(
  query: string
): Promise<TeacherSearchResponse> {
  const teachers = await loadAllTeachers();
  const q = query.toLowerCase();
  const matches = teachers.filter((t) => t.name.toLowerCase().includes(q));
  // Sort: prefer names that start with the query
  matches.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
    return aStarts - bStarts || a.name.localeCompare(b.name);
  });
  return { teachers: matches.slice(0, 20).map(({ id, name }) => ({ id, name })) };
}

// Titles and filler words shared by many teacher names: they can extend a name match
// but never make one on their own.
const HONORIFICS = new Set([
  "ajahn", "ajaan", "achaan", "ayya", "bhante", "bhikkhu", "bhikkhuni", "venerable", "ven",
  "sister", "brother", "lama", "roshi", "sensei", "rinpoche", "sayadaw", "dr", "and", "the",
]);

function normalizeWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function nameTokens(name: string): string[] {
  const tokens = new Set<string>();
  for (const word of name.split(/\s+/)) {
    const whole = normalizeWord(word);
    if (whole) tokens.add(whole);
    // "Beckman-Brindey" is matched by "beckman", "brindey" or "beckman-brindey"
    for (const part of word.split(/[^\p{L}\p{N}\p{M}]+/u)) {
      const p = normalizeWord(part);
      if (p) tokens.add(p);
    }
  }
  return [...tokens];
}

interface ScoredMatch extends TeacherMatch {
  score: number;
  prefixMatches: number;
  matchesCompleteWord: boolean;
  firstPosition: number;
}

function scoreTeachers(
  words: string[],
  teachers: TeacherRecord[],
  prefixIndex: number
): ScoredMatch[] {
  const normalized = words.map(normalizeWord);
  const candidates: ScoredMatch[] = [];

  for (const teacher of teachers) {
    const available = new Set(nameTokens(teacher.name));
    const matched = new Set<number>();
    let prefixMatches = 0;
    let hasDistinctiveMatch = false;

    normalized.forEach((word, i) => {
      if (word.length < 2) return;
      let token: string | undefined;
      if (available.has(word)) {
        token = word;
      } else if (i === prefixIndex) {
        token = [...available].find((t) => t.startsWith(word));
        if (token) prefixMatches++;
      }
      if (!token) return;
      available.delete(token);
      matched.add(i);
      if (!HONORIFICS.has(token)) hasDistinctiveMatch = true;
    });

    if (!hasDistinctiveMatch) continue;
    candidates.push({
      id: teacher.id,
      name: teacher.name,
      rest: words.filter((_, i) => !matched.has(i)).join(" "),
      score: matched.size,
      prefixMatches,
      matchesCompleteWord: [...matched].some((i) => i !== prefixIndex),
      firstPosition: Math.min(...matched),
    });
  }
  return candidates;
}

/**
 * Finds teachers named in a free-text query and splits the query into the teacher and the
 * remaining words, e.g. "goldstein metta" → Joseph Goldstein + "metta".
 * With `partial`, the last word may be an unfinished prefix (for search-as-you-type).
 */
export function matchTeacherNames(
  query: string,
  teachers: TeacherRecord[],
  { partial = false, limit = 5 } = {}
): TeacherMatch[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lastIndex = words.length - 1;
  const typingLastWord = partial && !/\s$/.test(query);
  // Non-public teachers have no teacher page on Dharma Seed, so searching within them fails
  const searchable = teachers.filter((t) => t.isPublic);

  let candidates = scoreTeachers(words, searchable, typingLastWord ? lastIndex : -1);
  if (candidates.length === 0 && !typingLastWord) {
    // A submitted query may still end in a shortened name, e.g. "golds"
    candidates = scoreTeachers(words, searchable, lastIndex);
  }

  if (candidates.length === 0) {
    // Only honorifics matched (e.g. "ajahn"): list teachers with a name word starting with the query
    const q = normalizeWord(query);
    if (q.length < 2) return [];
    return searchable
      .filter((t) => nameTokens(t.name).some((token) => token.startsWith(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit)
      .map(({ id, name }) => ({ id, name, rest: "" }));
  }

  const best = Math.max(...candidates.map((c) => c.score));
  let top = candidates.filter((c) => c.score === best);
  // A finished word is stronger evidence than the start of the word being typed:
  // in "goldstein me", suggest Goldstein, not every teacher whose name starts with "me"
  if (top.some((c) => c.matchesCompleteWord)) {
    top = top.filter((c) => c.matchesCompleteWord);
  }
  top.sort(
    (a, b) =>
      a.prefixMatches - b.prefixMatches ||
      a.firstPosition - b.firstPosition ||
      a.name.localeCompare(b.name)
  );
  return top.slice(0, limit).map(({ id, name, rest }) => ({ id, name, rest }));
}

export async function matchTeachers(
  query: string,
  partial = false
): Promise<TeacherMatchResponse> {
  const teachers = await loadAllTeachers();
  return { matches: matchTeacherNames(query, teachers, { partial }) };
}

export async function fetchTeacherTalks(
  teacherId: number,
  page: number,
  query?: string
): Promise<SearchResponse> {
  const searchParam = query ? `&search=${encodeURIComponent(query)}` : "";
  const url = `${BASE}/teacher/${teacherId}/?sort=-rec_date&page=${page}&page_items=25${searchParam}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "DharmaSeedPlayer/1.0" },
  });
  if (!res.ok) throw new Error(`Teacher talks failed: ${res.status}`);
  const html = await res.text();
  const result = parseTalkList(html, page);

  // Teacher pages don't include the teacher name per-talk, so resolve and fill it in
  const teacherName = await resolveTeacher(teacherId);
  if (teacherName) {
    for (const talk of result.talks) {
      if (!talk.teacher) {
        talk.teacher = teacherName;
        talk.teacherId = teacherId;
      }
    }
  }

  return result;
}

export async function fetchTeacherRetreats(
  teacherId: number
): Promise<TeacherRetreatsResponse> {
  const url = `${BASE}/teacher/${teacherId}/`;
  const res = await fetch(url, {
    headers: { "User-Agent": "DharmaSeedPlayer/1.0" },
  });
  if (!res.ok) throw new Error(`Teacher page failed: ${res.status}`);
  const html = await res.text();
  return { retreats: parseTeacherRetreats(html) };
}

export function parseTeacherRetreats(html: string): Retreat[] {
  const retreats: Retreat[] = [];
  const optionRe = /<option\s+value="\/retreats\/(\d+)\/?">([\s\S]*?)<\/option>/g;
  let match;
  while ((match = optionRe.exec(html)) !== null) {
    const id = parseInt(match[1], 10);
    const text = match[2].replace(/\s+/g, " ").trim();
    // Text format: "YYYY-MM-DD Retreat Name"
    const dateMatch = text.match(/^(\d{4}-\d{2}-\d{2})\s+(.*)/);
    if (dateMatch) {
      retreats.push({ id, date: dateMatch[1], name: decodeEntities(dateMatch[2]) });
    } else {
      retreats.push({ id, date: "", name: decodeEntities(text) });
    }
  }
  retreats.reverse();
  return retreats;
}

export async function fetchRetreatTalks(
  retreatId: number,
  page: number
): Promise<SearchResponse & { retreatTitle?: string }> {
  const url = `${BASE}/retreats/${retreatId}/?sort=rec_date&page=${page}&page_items=25`;
  const res = await fetch(url, {
    headers: { "User-Agent": "DharmaSeedPlayer/1.0" },
  });
  if (!res.ok) throw new Error(`Retreat page failed: ${res.status}`);
  const html = await res.text();
  const result = parseTalkList(html, page);

  // Extract retreat title from <h2> on the page
  const h2Match = html.match(/<h2>([^<]+)<\/h2>/);
  const retreatTitle = h2Match ? decodeEntities(h2Match[1].trim()) : undefined;

  // Tag each talk with retreat info
  for (const talk of result.talks) {
    talk.retreatId = retreatId;
    if (retreatTitle) talk.retreatTitle = retreatTitle;
  }

  return { ...result, retreatTitle };
}

export async function fetchTalkDetail(
  id: number
): Promise<TalkDetail | null> {
  const cacheKey = `talk:${id}`;
  const cached = cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const body = new URLSearchParams({ detail: "1", items: String(id) });
  const res = await fetch(`${BASE}/api/1/talks/`, {
    method: "POST",
    body,
    headers: { "User-Agent": "DharmaSeedPlayer/1.0" },
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    items?: Record<string, DharmaseedTalk>;
  };
  const raw = json.items?.[String(id)];
  if (!raw) return null;

  const teacherName = await resolveTeacher(raw.teacher_id);

  const detail: TalkDetail = {
    id,
    title: raw.title || "",
    teacher: teacherName,
    teacherId: raw.teacher_id || undefined,
    description: raw.description || "",
    audioUrl: raw.audio_url
      ? raw.audio_url.startsWith("http")
        ? raw.audio_url
        : `${BASE}${raw.audio_url}`
      : "",
    durationMinutes: raw.duration_in_minutes
      ? Math.round(raw.duration_in_minutes)
      : 0,
    date: raw.rec_date || "",
    retreatTitle: raw.retreat_title,
  };

  cacheSet(cacheKey, JSON.stringify(detail));
  return detail;
}

async function resolveTeacher(teacherId: number): Promise<string> {
  if (!teacherId) return "";

  const cacheKey = `teacher:${teacherId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const body = new URLSearchParams({
    detail: "1",
    items: String(teacherId),
  });
  const res = await fetch(`${BASE}/api/1/teachers/`, {
    method: "POST",
    body,
    headers: { "User-Agent": "DharmaSeedPlayer/1.0" },
  });
  if (!res.ok) return "";

  const json = (await res.json()) as {
    items?: Record<string, { name?: string }>;
  };
  const teacher = json.items?.[String(teacherId)];
  const name = teacher?.name || "";

  cacheSet(cacheKey, name);
  return name;
}

interface DharmaseedTalk {
  title?: string;
  teacher_id: number;
  description?: string;
  audio_url?: string;
  duration_in_minutes?: number;
  rec_date?: string;
  retreat_title?: string;
}

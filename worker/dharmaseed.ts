import type { Talk, TalkDetail, SearchResponse, Teacher, TeacherSearchResponse } from "../shared/types.js";

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
      /<a\s+class='talkteacher'\s+href="\/teacher\/\d+">([\s\S]*?)<\/a>/
    );
    const teacher = teacherMatch
      ? decodeEntities(teacherMatch[1].trim())
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

    talks.push({ id, title, teacher, durationMinutes, date, audioUrl, retreatId, retreatTitle });
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

export async function searchTeachers(
  query: string
): Promise<TeacherSearchResponse> {
  const url = `${BASE}/teachers/?search=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "DharmaSeedPlayer/1.0" },
    redirect: "manual",
  });

  // If single match, dharmaseed redirects to the teacher's page
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location") || "";
    const match = location.match(/\/teacher\/(\d+)/);
    if (match) {
      const id = parseInt(match[1], 10);
      const name = await resolveTeacher(id);
      return { teachers: [{ id, name: name || `Teacher ${id}` }] };
    }
    return { teachers: [] };
  }

  if (!res.ok) return { teachers: [] };
  const html = await res.text();
  return parseTeacherList(html);
}

function parseTeacherList(html: string): TeacherSearchResponse {
  const teachers: Teacher[] = [];
  // Pattern: <a class="talkteacher" href="/teacher/ID"><b style='font-size:16'>Name</b></a>
  const re = /<a\s+class="talkteacher"\s+href="\/teacher\/(\d+)">\s*<b[^>]*>([\s\S]*?)<\/b>\s*<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    teachers.push({
      id: parseInt(m[1], 10),
      name: decodeEntities(m[2].trim()),
    });
  }
  return { teachers };
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
      if (!talk.teacher) talk.teacher = teacherName;
    }
  }

  return result;
}

export async function fetchRetreatTalks(
  retreatId: number,
  page: number
): Promise<SearchResponse & { retreatTitle?: string }> {
  const url = `${BASE}/retreats/${retreatId}/?sort=rec_date&page=${page}&page_items=100`;
  const res = await fetch(url, {
    headers: { "User-Agent": "DharmaSeedPlayer/1.0" },
  });
  if (!res.ok) throw new Error(`Retreat talks failed: ${res.status}`);
  const html = await res.text();
  const result = parseTalkList(html, page);

  // Extract retreat title from the page
  const titleMatch = html.match(/<h2>([\s\S]*?)<\/h2>/);
  const retreatTitle = titleMatch ? decodeEntities(titleMatch[1].trim()) : undefined;

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

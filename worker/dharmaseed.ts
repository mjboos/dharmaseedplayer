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

// Cached list of all teachers (loaded once from JSON API)
let allTeachers: Teacher[] | null = null;
let teacherListLoading: Promise<Teacher[]> | null = null;

async function loadAllTeachers(): Promise<Teacher[]> {
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
      const teachers: Teacher[] = [];
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
          items?: Record<string, { name?: string }>;
        };
        if (json.items) {
          for (const [idStr, data] of Object.entries(json.items)) {
            if (data.name) {
              teachers.push({ id: parseInt(idStr, 10), name: data.name });
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
  return { teachers: matches.slice(0, 20) };
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
  _page: number
): Promise<SearchResponse & { retreatTitle?: string }> {
  const url = `https://dharmaseed.org/feeds/retreat/${retreatId}/`;
  const res = await fetch(url, {
    headers: { "User-Agent": "DharmaSeedPlayer/1.0" },
  });
  if (!res.ok) throw new Error(`Retreat RSS failed: ${res.status}`);
  const xml = await res.text();
  return parseRetreatRSS(xml, retreatId);
}

function parseRetreatRSS(
  xml: string,
  retreatId: number
): SearchResponse & { retreatTitle?: string } {
  // Extract retreat title from channel <title>, strip "(Dharma Seed: Retreat talks)" suffix
  const channelTitleMatch = xml.match(/<channel>[\s\S]*?<title>([^<]+)<\/title>/);
  let retreatTitle = channelTitleMatch ? channelTitleMatch[1].trim() : undefined;
  if (retreatTitle) {
    retreatTitle = retreatTitle.replace(/\s*\(Dharma Seed:.*?\)\s*$/, "").trim();
  }

  const items = xml.split(/<item>/);
  items.shift(); // discard everything before first <item>

  const seen = new Set<number>();
  const talks: Talk[] = [];

  for (const item of items) {
    const link = rssText(item, "link");
    const idMatch = link.match(/\/talks\/(\d+)/);
    if (!idMatch) continue;
    const id = parseInt(idMatch[1], 10);

    if (seen.has(id)) continue;
    seen.add(id);

    const teacher = rssText(item, "itunes:author");

    let title = rssText(item, "title");
    const colonIdx = title.indexOf(": ");
    if (colonIdx > 0 && teacher && title.slice(0, colonIdx).includes(teacher)) {
      title = title.slice(colonIdx + 2);
    }

    const durationStr = rssText(item, "itunes:duration");
    const durationMinutes = durationStr ? parseDuration(durationStr) : 0;

    const pubDate = rssText(item, "pubDate");
    const date = parseRSSDate(pubDate);

    let audioUrl = rssAttr(item, "enclosure", "url");
    audioUrl = audioUrl.replace("//talks/", "/talks/").replace(/\?rss=$/, "");

    talks.push({ id, title, teacher, durationMinutes, date, audioUrl, retreatId, retreatTitle });
  }

  return { talks, page: 1, hasMore: false, retreatTitle };
}

function rssText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function rssAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

function parseRSSDate(rfc2822: string): string {
  const d = new Date(rfc2822);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
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

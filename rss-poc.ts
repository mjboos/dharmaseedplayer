/**
 * Proof-of-concept: Parse a Dharma Seed retreat RSS feed
 * and extract the same fields as the current HTML scraping.
 *
 * Uses sample XML from actual dharmaseed.org feeds, verified via WebFetch.
 * Run: npx tsx rss-poc.ts
 */

interface Talk {
  id: number;
  title: string;
  teacher: string;
  durationMinutes: number;
  date: string;
  audioUrl: string;
  retreatId?: number;
  retreatTitle?: string;
}

// --- RSS Parsing Functions (these would go into dharmaseed.ts) ---

function parseDuration(str: string): number {
  const parts = str.split(":").map(Number);
  if (parts.length === 3) {
    return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
  }
  return Math.round(parts[0] + parts[1] / 60);
}

function parseRSSDate(rfc2822: string): string {
  const d = new Date(rfc2822);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function extractBetween(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

function parseRetreatRSS(xml: string, retreatId: number): { talks: Talk[]; retreatTitle?: string } {
  // Extract channel title for retreat name
  const channelTitleMatch = xml.match(/<channel>[\s\S]*?<title>([^<]+)<\/title>/);
  let retreatTitle = channelTitleMatch ? channelTitleMatch[1].trim() : undefined;
  // Strip " (Dharma Seed: Retreat talks)" suffix
  if (retreatTitle) {
    retreatTitle = retreatTitle.replace(/\s*\(Dharma Seed:.*?\)\s*$/, "").trim();
  }

  // Split into items
  const items = xml.split(/<item>/);
  items.shift(); // discard everything before first <item>

  const seen = new Set<number>();
  const talks: Talk[] = [];

  for (const item of items) {
    // Talk ID from <link>
    const link = extractBetween(item, "link");
    const idMatch = link.match(/\/talks\/(\d+)/);
    if (!idMatch) continue;
    const id = parseInt(idMatch[1], 10);

    // Deduplicate (RSS feed has some duplicates)
    if (seen.has(id)) continue;
    seen.add(id);

    // Teacher name from <itunes:author>
    const teacher = extractBetween(item, "itunes:author");

    // Title from <title> — strip "Teacher Name: " or "Teacher1, Teacher2: " prefix
    let title = extractBetween(item, "title");
    const colonIdx = title.indexOf(": ");
    if (colonIdx > 0 && teacher && title.slice(0, colonIdx).includes(teacher)) {
      title = title.slice(colonIdx + 2);
    }

    // Duration from <itunes:duration>
    const durationStr = extractBetween(item, "itunes:duration");
    const durationMinutes = durationStr ? parseDuration(durationStr) : 0;

    // Date from <pubDate>
    const pubDate = extractBetween(item, "pubDate");
    const date = parseRSSDate(pubDate);

    // Audio URL from <enclosure url="">
    let audioUrl = extractAttr(item, "enclosure", "url");
    // Fix double-slash and remove ?rss= param
    audioUrl = audioUrl.replace("//talks/", "/talks/").replace(/\?rss=$/, "");

    talks.push({ id, title, teacher, durationMinutes, date, audioUrl, retreatId, retreatTitle });
  }

  return { talks, retreatTitle };
}

// --- Test with real XML from dharmaseed.org/feeds/retreat/4938/ ---

const SAMPLE_XML = `<?xml version="1.0"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
<channel>
<title>The Alchemy of Awareness (Dharma Seed: Retreat talks)</title>
<link>https://dharmaseed.org/feeds/retreat/4938/</link>
<description>Dharma Seed retreat talks</description>
<language>en</language>
<lastBuildDate>Thu, 27 Feb 2026 04:00:00 +0000</lastBuildDate>
<item>
  <title>Kittisaro: Patiently Arriving : The Alchemy of Awareness--Retreat at Spirit Rock (Day 1)</title>
  <link>https://dharmaseed.org/talks/68163/</link>
  <description>(Spirit Rock Meditation Center) First Day. Overview of Path.</description>
  <pubDate>Sat, 20 Nov 2021 09:03:18 +0000</pubDate>
  <guid isPermaLink="false">20211120-Kittisaro-SR-patiently_arriving-68163.mp3</guid>
  <enclosure length="28345678" type="audio/mpeg" url="https://dharmaseed.org//talks/68163/20211120-Kittisaro-SR-patiently_arriving_the_alchemy_of_awareness_retreat_at_spirit_rock_day_1-68163.mp3?rss="></enclosure>
  <itunes:explicit>no</itunes:explicit>
  <itunes:author>Kittisaro</itunes:author>
  <itunes:summary>(Spirit Rock Meditation Center) First Day. Overview of Path.</itunes:summary>
  <itunes:duration>59:05</itunes:duration>
</item>
<item>
  <title>Dawn Mauricio: The Wise Body</title>
  <link>https://dharmaseed.org/talks/68162/</link>
  <description>(Spirit Rock Meditation Center) This talk addresses the first foundation of mindfulness.</description>
  <pubDate>Sat, 20 Nov 2021 19:38:23 +0000</pubDate>
  <guid isPermaLink="false">20211120-Dawn_Mauricio-SR-the_wise_body-68162.mp3</guid>
  <enclosure length="23456789" type="audio/mpeg" url="https://dharmaseed.org//talks/68162/20211120-Dawn_Mauricio-SR-the_wise_body-68162.mp3?rss="></enclosure>
  <itunes:explicit>no</itunes:explicit>
  <itunes:author>Dawn Mauricio</itunes:author>
  <itunes:summary>(Spirit Rock Meditation Center) This talk addresses the first foundation of mindfulness.</itunes:summary>
  <itunes:duration>48:43</itunes:duration>
</item>
<item>
  <title>Dawn Mauricio: Morning Sit with Instruction</title>
  <link>https://dharmaseed.org/talks/68166/</link>
  <description>(Spirit Rock Meditation Center) </description>
  <pubDate>Sun, 21 Nov 2021 09:01:44 +0000</pubDate>
  <guid isPermaLink="false">20211121-Dawn_Mauricio-SR-morning_sit_with_instruction-68166.mp3</guid>
  <enclosure length="16234567" type="audio/mpeg" url="https://dharmaseed.org//talks/68166/20211121-Dawn_Mauricio-SR-morning_sit_with_instruction-68166.mp3?rss="></enclosure>
  <itunes:explicit>no</itunes:explicit>
  <itunes:author>Dawn Mauricio</itunes:author>
  <itunes:summary>(Spirit Rock Meditation Center) </itunes:summary>
  <itunes:duration>33:39</itunes:duration>
</item>
<item>
  <title>Gullu Singh: The Hindrances Becoming Awakening</title>
  <link>https://dharmaseed.org/talks/68164/</link>
  <description>(Spirit Rock Meditation Center) A talk on the 5 Hindrances.</description>
  <pubDate>Sun, 21 Nov 2021 19:42:29 +0000</pubDate>
  <guid isPermaLink="false">20211121-Gullu_Singh-SR-the_hindrances_becoming_awakening-68164.mp3</guid>
  <enclosure length="22876543" type="audio/mpeg" url="https://dharmaseed.org//talks/68164/20211121-Gullu_Singh-SR-the_hindrances_becoming_awakening-68164.mp3?rss="></enclosure>
  <itunes:explicit>no</itunes:explicit>
  <itunes:author>Gullu Singh</itunes:author>
  <itunes:summary>(Spirit Rock Meditation Center) A talk on the 5 Hindrances.</itunes:summary>
  <itunes:duration>47:37</itunes:duration>
</item>
<item>
  <title>Kittisaro, Thanissara: Kuan Yin Compassion Ceremony (Retreat at Spirit Rock)</title>
  <link>https://dharmaseed.org/talks/68290/</link>
  <description>(Spirit Rock Meditation Center) </description>
  <pubDate>Sat, 27 Nov 2021 16:01:42 +0000</pubDate>
  <guid isPermaLink="false">20211127-Kittisaro_Thanissara-SR-kuan_yin_compassion_ceremony-68290.mp3</guid>
  <enclosure length="43210987" type="audio/mpeg" url="https://dharmaseed.org//talks/68290/20211127-Kittisaro_Thanissara-SR-kuan_yin_compassion_ceremony_retreat_at_spirit_rock-68290.mp3?rss="></enclosure>
  <itunes:explicit>no</itunes:explicit>
  <itunes:author>Kittisaro</itunes:author>
  <itunes:summary>(Spirit Rock Meditation Center) </itunes:summary>
  <itunes:duration>1:30:02</itunes:duration>
</item>
</channel>
</rss>`;

// --- Known correct values from JSON API (fetched via WebFetch) ---

const API_DATA: Record<number, { title: string; teacher_id: number; duration: number; date: string; audio_url: string }> = {
  68163: {
    title: "Patiently Arriving : The Alchemy of Awareness--Retreat at Spirit Rock (Day 1)",
    teacher_id: 101,
    duration: 59,  // 59.09 rounded
    date: "2021-11-20",
    audio_url: "/talks/68163/20211120-Kittisaro-SR-patiently_arriving_the_alchemy_of_awareness_retreat_at_spirit_rock_day_1-68163.mp3",
  },
  68162: {
    title: "The Wise Body",
    teacher_id: 1018,
    duration: 49,  // 48.72 rounded
    date: "2021-11-20",
    audio_url: "/talks/68162/20211120-Dawn_Mauricio-SR-the_wise_body-68162.mp3",
  },
  68166: {
    title: "Morning Sit with Instruction",
    teacher_id: 1018,
    duration: 34,  // 33.67 rounded
    date: "2021-11-21",
    audio_url: "/talks/68166/20211121-Dawn_Mauricio-SR-morning_sit_with_instruction-68166.mp3",
  },
  68164: {
    title: "The Hindrances Becoming Awakening",
    teacher_id: 983,
    duration: 48,  // 47.63 rounded
    date: "2021-11-21",
    audio_url: "/talks/68164/20211121-Gullu_Singh-SR-the_hindrances_becoming_awakening-68164.mp3",
  },
};

// --- Run the test ---

function main() {
  console.log("=== RSS Feed Parsing Proof-of-Concept ===\n");

  const result = parseRetreatRSS(SAMPLE_XML, 4938);

  console.log(`Retreat title: "${result.retreatTitle}"`);
  console.log(`Talks parsed: ${result.talks.length}\n`);

  console.log("--- All parsed talks ---\n");
  for (const talk of result.talks) {
    console.log(`  [${talk.id}] ${talk.date} | ${talk.teacher}: ${talk.title} (${talk.durationMinutes} min)`);
    console.log(`    Audio: ${talk.audioUrl}`);
  }

  console.log("\n--- Cross-check against JSON API ---\n");

  let allMatch = true;
  for (const talk of result.talks) {
    const api = API_DATA[talk.id];
    if (!api) {
      console.log(`  [${talk.id}] — No API data to compare (skipping)`);
      continue;
    }

    const titleMatch = talk.title === api.title;
    const durationMatch = talk.durationMinutes === api.duration;
    const dateMatch = talk.date === api.date;
    const audioMatch = talk.audioUrl.endsWith(api.audio_url);

    const status = titleMatch && durationMatch && dateMatch && audioMatch ? "PASS" : "FAIL";
    if (status === "FAIL") allMatch = false;

    console.log(`  [${talk.id}] ${status}`);
    if (!titleMatch) console.log(`    title:    RSS="${talk.title}" vs API="${api.title}"`);
    if (!durationMatch) console.log(`    duration: RSS=${talk.durationMinutes} vs API=${api.duration}`);
    if (!dateMatch) console.log(`    date:     RSS="${talk.date}" vs API="${api.date}"`);
    if (!audioMatch) console.log(`    audio:    RSS ends with "${talk.audioUrl.split("/").pop()}" vs API="${api.audio_url.split("/").pop()}"`);
    if (status === "PASS") console.log(`    title="${talk.title}", duration=${talk.durationMinutes}min, date=${talk.date}`);
  }

  console.log(`\n=== Result: ${allMatch ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"} ===`);
}

main();

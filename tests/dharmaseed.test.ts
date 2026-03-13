import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchRetreatTalks,
  fetchTalkDetail,
  searchTalks,
  parseTeacherRetreats,
} from "../worker/dharmaseed.js";

type FetchImpl = typeof fetch;

function mockFetch(fn: FetchImpl): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fn;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function loadSearchTeachersFresh() {
  const mod = await import(`../worker/dharmaseed.js?fresh=${Date.now()}-${Math.random()}`);
  return mod.searchTeachers as (query: string) => Promise<{ teachers: Array<{ id: number; name: string }> }>;
}

test("searchTalks parses talk list HTML", async () => {
  const html = `
    <table width='100%'>
      <a class="talkteacher" href="/talks/123">Sam &amp; Lee</a>
      2024-03-01
      <i>1:30:00</i>
      <a class='talkteacher' href="/teacher/9">Teacher &quot;A&quot;</a>
      <a href="/talks/123/audio.mp3">audio</a>
      <a href="/retreats/42/"><i>Spring Retreat</i></a>
    </table>
    <a class="next">next</a>
  `;

  let requestedUrl = "";
  const restore = mockFetch(async (input) => {
    requestedUrl = String(input);
    return new Response(html, { status: 200 });
  });

  try {
    const result = await searchTalks("metta practice", 2);
    assert.equal(requestedUrl.includes("search=metta%20practice"), true);
    assert.equal(result.page, 2);
    assert.equal(result.hasMore, true);
    assert.equal(result.talks.length, 1);
    assert.deepEqual(result.talks[0], {
      id: 123,
      title: "Sam & Lee",
      teacher: 'Teacher "A"',
      durationMinutes: 90,
      date: "2024-03-01",
      audioUrl: "https://www.dharmaseed.org/talks/123/audio.mp3",
      retreatId: 42,
      retreatTitle: "Spring Retreat",
    });
  } finally {
    restore();
  }
});

test("fetchRetreatTalks parses RSS and removes duplicate talks", async () => {
  const xml = `
    <rss>
      <channel>
        <title>Weekend Retreat (Dharma Seed: Retreat talks)</title>
        <item>
          <link>https://dharmaseed.org/talks/900/</link>
          <title>Jane Doe: First Talk</title>
          <itunes:author>Jane Doe</itunes:author>
          <itunes:duration>0:45:00</itunes:duration>
          <pubDate>Tue, 14 Jan 2025 12:00:00 GMT</pubDate>
          <enclosure url="https://dharmaseed.org//talks/900/file.mp3?rss=" />
        </item>
        <item>
          <link>https://dharmaseed.org/talks/900/</link>
          <title>Jane Doe: Duplicate Talk</title>
          <itunes:author>Jane Doe</itunes:author>
          <itunes:duration>0:45:00</itunes:duration>
          <pubDate>Tue, 14 Jan 2025 12:00:00 GMT</pubDate>
          <enclosure url="https://dharmaseed.org//talks/900/file.mp3?rss=" />
        </item>
      </channel>
    </rss>
  `;

  const restore = mockFetch(async () => new Response(xml, { status: 200 }));

  try {
    const result = await fetchRetreatTalks(77, 1);
    assert.equal(result.retreatTitle, "Weekend Retreat");
    assert.equal(result.talks.length, 1);
    assert.equal(result.talks[0].title, "First Talk");
    assert.equal(result.talks[0].durationMinutes, 45);
    assert.equal(result.talks[0].date, "2025-01-14");
    assert.equal(
      result.talks[0].audioUrl,
      "https://dharmaseed.org/talks/900/file.mp3"
    );
  } finally {
    restore();
  }
});

test("fetchTalkDetail returns cached talk after first request", async () => {
  let callCount = 0;
  const restore = mockFetch(async (input, init) => {
    callCount += 1;
    const url = String(input);

    if (url.endsWith("/api/1/talks/")) {
      const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
      assert.equal(body.get("items"), "99991");
      return Response.json({
        items: {
          "99991": {
            title: "A Talk",
            teacher_id: 314,
            description: "Desc",
            audio_url: "/talks/99991/file.mp3",
            duration_in_minutes: 12.6,
            rec_date: "2025-03-01",
            retreat_title: "Retreat X",
          },
        },
      });
    }

    if (url.endsWith("/api/1/teachers/")) {
      return Response.json({
        items: {
          "314": {
            name: "Teacher 314",
          },
        },
      });
    }

    return new Response(null, { status: 404 });
  });

  try {
    const first = await fetchTalkDetail(99991);
    const second = await fetchTalkDetail(99991);

    assert.ok(first);
    assert.ok(second);
    assert.deepEqual(first, second);
    assert.equal(first?.teacher, "Teacher 314");
    assert.equal(first?.audioUrl, "https://www.dharmaseed.org/talks/99991/file.mp3");
    assert.equal(first?.durationMinutes, 13);
    assert.equal(callCount, 2);
  } finally {
    restore();
  }
});

test("searchTeachers retries after an initial bootstrap failure", async () => {
  const searchTeachers = await loadSearchTeachersFresh();
  let listCalls = 0;
  const restore = mockFetch(async (input, init) => {
    const url = String(input);
    if (!url.endsWith("/api/1/teachers/")) {
      return new Response(null, { status: 404 });
    }

    const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
    const detail = body.get("detail");
    if (detail === "0") {
      listCalls += 1;
      if (listCalls === 1) {
        throw new Error("transient error");
      }
      return Response.json({ items: [123] });
    }

    if (detail === "1") {
      return Response.json({
        items: {
          "123": { name: "Ada Lovelace" },
        },
      });
    }

    return new Response(null, { status: 400 });
  });

  try {
    await assert.rejects(() => searchTeachers("ada"));
    const result = await searchTeachers("ada");
    assert.equal(listCalls, 2);
    assert.deepEqual(result, {
      teachers: [{ id: 123, name: "Ada Lovelace" }],
    });
  } finally {
    restore();
  }
});

test("parseTeacherRetreats extracts retreats from teacher page HTML", () => {
  const html = `
    <html>
    <select id='teacher_retreat_selector' class="select2" style='width: 300px;'>
    <option value="#">-- Select one of Teacher's 3 retreats --</option>
    <option value="/retreats/42/">2024-01-15
        Spring Retreat</option>
    <option value="/retreats/99/">2023-06-01
        Summer &amp; Fall Intensive</option>
    <option value="/retreats/7/">1900-01-01
        Monday Talks</option>
    </select>
    </html>
  `;

  const retreats = parseTeacherRetreats(html);
  assert.equal(retreats.length, 3);
  assert.deepEqual(retreats[0], { id: 42, date: "2024-01-15", name: "Spring Retreat" });
  assert.deepEqual(retreats[1], { id: 99, date: "2023-06-01", name: "Summer & Fall Intensive" });
  assert.deepEqual(retreats[2], { id: 7, date: "1900-01-01", name: "Monday Talks" });
});

test("parseTeacherRetreats returns empty array when no select found", () => {
  const retreats = parseTeacherRetreats("<html><body>No retreats here</body></html>");
  assert.deepEqual(retreats, []);
});

test("searchTeachers does not cache partial teachers when a batch fails", async () => {
  const searchTeachers = await loadSearchTeachersFresh();
  const teacherIds = Array.from({ length: 501 }, (_, idx) => idx + 1);
  let batch2Attempts = 0;

  const restore = mockFetch(async (input, init) => {
    const url = String(input);
    if (!url.endsWith("/api/1/teachers/")) {
      return new Response(null, { status: 404 });
    }

    const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
    const detail = body.get("detail");

    if (detail === "0") {
      return Response.json({ items: teacherIds });
    }

    if (detail === "1") {
      const items = (body.get("items") || "").split(",").map((v) => parseInt(v, 10));
      const isBatch2 = items.length === 1 && items[0] === 501;
      if (isBatch2) {
        batch2Attempts += 1;
        if (batch2Attempts === 1) {
          return new Response("fail", { status: 500 });
        }
      }

      const payload: Record<string, { name: string }> = {};
      for (const id of items) {
        payload[String(id)] = { name: `Teacher ${id}` };
      }
      return Response.json({ items: payload });
    }

    return new Response(null, { status: 400 });
  });

  try {
    await assert.rejects(() => searchTeachers("teacher 501"));
    const result = await searchTeachers("teacher 501");
    assert.equal(batch2Attempts, 2);
    assert.deepEqual(result, {
      teachers: [{ id: 501, name: "Teacher 501" }],
    });
  } finally {
    restore();
  }
});

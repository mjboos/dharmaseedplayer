import test from "node:test";
import assert from "node:assert/strict";
import { fetchRetreatTalks, fetchTalkDetail, searchTalks } from "../worker/dharmaseed.js";

type FetchImpl = typeof fetch;

function mockFetch(fn: FetchImpl): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fn;
  return () => {
    globalThis.fetch = originalFetch;
  };
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

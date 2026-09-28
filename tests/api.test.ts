import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../worker/index.js";

type FetchImpl = typeof fetch;

function mockFetch(fn: FetchImpl): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fn;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("GET /api/talks without query returns empty payload", async () => {
  let called = false;
  const restore = mockFetch(async () => {
    called = true;
    return new Response(null, { status: 500 });
  });

  try {
    const res = await app.request("/api/talks");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { talks: [], page: 1, hasMore: false });
    assert.equal(called, false);
  } finally {
    restore();
  }
});

test("GET /api/talks returns 500 on upstream error", async () => {
  const restore = mockFetch(async () => new Response("fail", { status: 500 }));

  try {
    const res = await app.request("/api/talks?q=metta");
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "Search failed" });
  } finally {
    restore();
  }
});

test("GET /api/talks with a teacher searches that teacher's talks", async () => {
  const requested: string[] = [];
  const restore = mockFetch(async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith("/api/1/teachers/")) {
      return Response.json({ items: { "96": { name: "Joseph Goldstein" } } });
    }
    return new Response(
      `<table width='100%'><a class="talkteacher" href="/talks/5">Metta</a></table>
       <table width='100%'><a class="talkteacher" href="/talks/6">Co-taught Metta</a>
         <a class='talkteacher' href="/teacher/42">Sylvia Boorstein</a></table>`,
      { status: 200 }
    );
  });

  try {
    const res = await app.request("/api/talks?q=metta&teacher=96");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.talks[0].title, "Metta");
    assert.equal(body.talks[0].teacher, "Joseph Goldstein");
    assert.equal(body.talks[0].teacherId, 96);
    assert.equal(body.talks[1].teacher, "Sylvia Boorstein");
    assert.equal(body.talks[1].teacherId, 42);
    assert.ok(requested[0].includes("/teacher/96/?"));
    assert.ok(requested[0].includes("search=metta"));
  } finally {
    restore();
  }
});

test("GET /api/talks validates the teacher id", async () => {
  const res = await app.request("/api/talks?q=metta&teacher=abc");
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Invalid teacher ID" });
});

test("GET /api/teachers/match without query returns no matches", async () => {
  const res = await app.request("/api/teachers/match?q=%20");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { matches: [] });
});

test("GET /api/teachers/:id/talks validates numeric id", async () => {
  const res = await app.request("/api/teachers/not-a-number/talks");
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Invalid teacher ID" });
});

test("GET /api/teachers/:id/retreats validates numeric id", async () => {
  const res = await app.request("/api/teachers/abc/retreats");
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Invalid teacher ID" });
});

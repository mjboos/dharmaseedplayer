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

test("GET /api/teachers/:id/talks validates numeric id", async () => {
  const res = await app.request("/api/teachers/not-a-number/talks");
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Invalid teacher ID" });
});

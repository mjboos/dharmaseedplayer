import { Hono } from "hono";
import { searchTalks, fetchTalkDetail, searchTeachers, fetchTeacherTalks, fetchRetreatTalks } from "./dharmaseed.js";

export const app = new Hono();

app.get("/api/talks", async (c) => {
  const query = c.req.query("q") || "";
  const page = parseInt(c.req.query("page") || "1", 10);

  if (!query) {
    return c.json({ talks: [], page: 1, hasMore: false });
  }

  try {
    const result = await searchTalks(query, page);
    return c.json(result);
  } catch (e) {
    console.error("Search failed:", e);
    return c.json({ error: "Search failed" }, 500);
  }
});

app.get("/api/teachers", async (c) => {
  const query = c.req.query("q") || "";
  if (!query) {
    return c.json({ teachers: [] });
  }
  try {
    const result = await searchTeachers(query);
    return c.json(result);
  } catch (e) {
    console.error("Teacher search failed:", e);
    return c.json({ teachers: [] });
  }
});

app.get("/api/teachers/:id/talks", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const page = parseInt(c.req.query("page") || "1", 10);
  const query = c.req.query("q") || "";
  if (isNaN(id)) {
    return c.json({ error: "Invalid teacher ID" }, 400);
  }
  try {
    const result = await fetchTeacherTalks(id, page, query || undefined);
    return c.json(result);
  } catch (e) {
    console.error("Teacher talks failed:", e);
    return c.json({ error: "Failed to fetch teacher talks" }, 500);
  }
});

app.get("/api/retreats/:id/talks", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const page = parseInt(c.req.query("page") || "1", 10);
  if (isNaN(id)) {
    return c.json({ error: "Invalid retreat ID" }, 400);
  }
  try {
    const result = await fetchRetreatTalks(id, page);
    return c.json(result);
  } catch (e) {
    console.error("Retreat talks failed:", e);
    return c.json({ error: "Failed to fetch retreat talks" }, 500);
  }
});

app.get("/api/talks/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) {
    return c.json({ error: "Invalid talk ID" }, 400);
  }

  try {
    const detail = await fetchTalkDetail(id);
    if (!detail) {
      return c.json({ error: "Talk not found" }, 404);
    }
    return c.json(detail);
  } catch (e) {
    console.error("Talk detail failed:", e);
    return c.json({ error: "Failed to fetch talk detail" }, 500);
  }
});

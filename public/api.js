export async function searchTalks(query, page = 1, teacherId = null) {
  const teacherParam = teacherId ? `&teacher=${teacherId}` : "";
  const res = await fetch(`/api/talks?q=${encodeURIComponent(query)}&page=${page}${teacherParam}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function matchTeachers(query, { partial = false } = {}) {
  const partialParam = partial ? "&partial=1" : "";
  const res = await fetch(`/api/teachers/match?q=${encodeURIComponent(query)}${partialParam}`);
  if (!res.ok) return { matches: [] };
  return res.json();
}

export async function getTalkDetail(id) {
  const res = await fetch(`/api/talks/${id}`);
  if (!res.ok) throw new Error("Failed to fetch talk");
  return res.json();
}

export async function getTeacherRetreats(teacherId) {
  const res = await fetch(`/api/teachers/${teacherId}/retreats`);
  if (!res.ok) throw new Error("Failed to fetch teacher retreats");
  return res.json();
}

export async function getRetreatTalks(retreatId, page = 1) {
  const res = await fetch(`/api/retreats/${retreatId}/talks?page=${page}`);
  if (!res.ok) throw new Error("Failed to fetch retreat talks");
  return res.json();
}

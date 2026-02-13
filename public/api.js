export async function searchTalks(query, page = 1) {
  const res = await fetch(`/api/talks?q=${encodeURIComponent(query)}&page=${page}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function getTalkDetail(id) {
  const res = await fetch(`/api/talks/${id}`);
  if (!res.ok) throw new Error("Failed to fetch talk");
  return res.json();
}

export async function searchTeachers(query) {
  const res = await fetch(`/api/teachers?q=${encodeURIComponent(query)}`);
  if (!res.ok) return { teachers: [] };
  return res.json();
}

export async function getTeacherTalks(teacherId, page = 1, query = "") {
  const qParam = query ? `&q=${encodeURIComponent(query)}` : "";
  const res = await fetch(`/api/teachers/${teacherId}/talks?page=${page}${qParam}`);
  if (!res.ok) throw new Error("Failed to fetch teacher talks");
  return res.json();
}

export async function getRetreatTalks(retreatId, page = 1) {
  const res = await fetch(`/api/retreats/${retreatId}/talks?page=${page}`);
  if (!res.ok) throw new Error("Failed to fetch retreat talks");
  return res.json();
}

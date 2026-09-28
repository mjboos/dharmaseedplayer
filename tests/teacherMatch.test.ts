import test from "node:test";
import assert from "node:assert/strict";
import { matchTeacherNames, type TeacherRecord } from "../worker/dharmaseed.js";

const teachers: TeacherRecord[] = [
  { id: 1, name: "Joseph Bobrow", isPublic: false },
  { id: 96, name: "Joseph Goldstein", isPublic: true },
  { id: 2, name: "Ajahn Metta", isPublic: true },
  { id: 3, name: "Ajahn Amaro", isPublic: true },
  { id: 4, name: "Ajahn Achalo", isPublic: true },
  { id: 5, name: "Rob Burbea", isPublic: true },
  { id: 6, name: "Nina Gold", isPublic: true },
  { id: 7, name: "Sharon Beckman-Brindey", isPublic: true },
  { id: 8, name: "Ṭhānissaro Bhikkhu", isPublic: true },
  { id: 9, name: "Erin Selover", isPublic: true },
  { id: 10, name: "Melissa Myozen Blacker", isPublic: true },
];

function names(query: string, opts?: { partial?: boolean }) {
  return matchTeacherNames(query, teachers, opts).map((m) => `${m.name}|${m.rest}`);
}

test("splits a teacher name from the topic in either order", () => {
  assert.deepEqual(names("burbea soulmaking"), ["Rob Burbea|soulmaking"]);
  assert.deepEqual(names("soulmaking Burbea"), ["Rob Burbea|soulmaking"]);
  assert.deepEqual(names("rob burbea emptiness of self"), ["Rob Burbea|emptiness of self"]);
});

test("a full name beats a partial name match", () => {
  assert.deepEqual(names("joseph goldstein metta"), ["Joseph Goldstein|metta"]);
});

test("offers every plausible teacher when the query is ambiguous, in the order typed", () => {
  assert.deepEqual(names("goldstein metta"), ["Joseph Goldstein|metta", "Ajahn Metta|goldstein"]);
  assert.deepEqual(names("metta goldstein"), ["Ajahn Metta|goldstein", "Joseph Goldstein|metta"]);
});

test("skips non-public teachers, who have no teacher page to search", () => {
  assert.deepEqual(names("joseph"), ["Joseph Goldstein|"]);
  assert.deepEqual(names("bobrow"), []);
});

test("honorifics alone do not make a match but still list those teachers", () => {
  assert.deepEqual(names("ajahn amaro"), ["Ajahn Amaro|"]);
  assert.deepEqual(names("ajahn"), ["Ajahn Achalo|", "Ajahn Amaro|", "Ajahn Metta|"]);
  assert.deepEqual(names("ajahn anatta"), []);
});

test("matches hyphenated names and ignores accents", () => {
  assert.deepEqual(names("beckman"), ["Sharon Beckman-Brindey|"]);
  assert.deepEqual(names("thanissaro refuge"), ["Ṭhānissaro Bhikkhu|refuge"]);
});

test("does not match inside words", () => {
  assert.deepEqual(names("love"), []);
});

test("while typing, the last word can be the start of a name", () => {
  assert.deepEqual(names("golds", { partial: true }), ["Joseph Goldstein|"]);
  assert.deepEqual(names("gold", { partial: true }), ["Nina Gold|", "Joseph Goldstein|"]);
  assert.deepEqual(names("joseph gold", { partial: true }), ["Joseph Goldstein|"]);
});

test("while typing a topic, a finished teacher name wins over the half-typed word", () => {
  assert.deepEqual(names("goldstein me", { partial: true }), ["Joseph Goldstein|me"]);
});

test("a submitted query can end in a shortened name", () => {
  assert.deepEqual(names("golds"), ["Joseph Goldstein|"]);
});

test("returns nothing for empty or very short queries", () => {
  assert.deepEqual(names(""), []);
  assert.deepEqual(names("   "), []);
  assert.deepEqual(names("j", { partial: true }), []);
});

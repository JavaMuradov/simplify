/**
 * Scores a run against the three things that would sink the on-device thesis:
 * the model translating instead of simplifying, facts going missing, and the
 * CEFR sentence-length ceiling being ignored.
 *
 * Substring matching flags legitimate reformatting as a miss, so every failing
 * block is printed in full. Treat the counts as a screen, not a verdict.
 */
import { readFileSync } from "node:fs";

// Ceilings come from LEVEL_BRIEF in src/background.js. B2 states no hard cap.
const CEILING = { A1: 8, A2: 12, B1: 15, B2: null };

const level = process.argv[2] || "B1";
const report = JSON.parse(readFileSync(`build/results-${level}.json`, "utf8"));
const ceiling = CEILING[level];

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ");
const has = (hay, needle) => norm(hay).includes(norm(needle));

// Splits on sentence-ending punctuation shared by Latin and Cyrillic scripts.
const sentences = (t) => t.split(/[.!?…]+/).map((s) => s.trim()).filter(Boolean);
const longest = (t) => Math.max(0, ...sentences(t).map((s) => s.split(/\s+/).length));

let pass = 0;
const problems = [];

for (const r of report.results) {
  const issues = [];

  // A refusal is a capability limit, not a quality result. Report it alone --
  // the fact and level checks below would be noise on an empty output.
  if (r.refused) {
    problems.push({ r, issues: [`REFUSED by framework - ${r.refused}`], worst: 0 });
    continue;
  }

  if (!r.simplified.trim()) issues.push("EMPTY - model returned nothing for this block");

  // An empty detection means "not confident", which is not the same as drift.
  if (r.detectedIn && r.detectedOut && r.detectedIn !== r.detectedOut) {
    issues.push(`TRANSLATED - ${r.detectedIn} became ${r.detectedOut}`);
  }

  const lostFacts = r.facts.filter((f) => !has(r.simplified, f));
  if (lostFacts.length) issues.push(`FACTS possibly lost: ${lostFacts.join(", ")}`);

  const lostNeg = r.negations.filter((n) => !has(r.simplified, n));
  if (lostNeg.length) issues.push(`NEGATION possibly lost: ${lostNeg.join(", ")}`);

  const lostQual = r.qualifiers.filter((q) => !has(r.simplified, q));
  if (lostQual.length) issues.push(`QUALIFIER possibly lost: ${lostQual.join(", ")}`);

  const worst = longest(r.simplified);
  if (ceiling && worst > ceiling) issues.push(`LEVEL - longest sentence ${worst} words, ceiling ~${ceiling}`);

  if (issues.length === 0) pass++;
  else problems.push({ r, issues, worst });
}

console.log(`\nLevel ${level} · on-device · ${report.secondsElapsed.toFixed(1)}s`);
console.log(`Clean: ${pass}/${report.results.length}\n`);

for (const { r, issues, worst } of problems) {
  console.log(`── ${r.id} (${r.declaredLang}, longest sentence ${worst}w)`);
  for (const i of issues) console.log(`   ! ${i}`);
  console.log(`   in : ${r.original}`);
  console.log(`   out: ${r.simplified || "(empty)"}\n`);
}

/**
 * Pulls the live system prompt out of src/background.js so this evaluation
 * tests the prompt Simplify actually ships, not a copy that silently drifts.
 *
 * background.js is a service worker and exports nothing, so the two relevant
 * declarations are sliced out by source and re-evaluated here.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "../../src/background.js"), "utf8");

const start = source.indexOf("const LEVEL_BRIEF");
const endMarker = '].join("\\n");\n}';
const end = source.indexOf(endMarker);

if (start === -1 || end === -1) {
  throw new Error(
    "Could not find LEVEL_BRIEF / buildSystemPrompt in background.js. " +
    "If that file was refactored, update this extractor."
  );
}

const slice = source.slice(start, end + endMarker.length);
const build = new Function("level", "lang", `${slice}\nreturn buildSystemPrompt(level, lang);`);

mkdirSync(join(here, "build"), { recursive: true });

// A real page declares one language, so the extension always builds the prompt
// with a concrete lang. Emitting a prompt per (level, lang) keeps the eval
// faithful to that; the "" variant is kept to measure what the weaker abstract
// rule costs, since that is what pages with no <html lang> actually get.
const LANGS = ["", "nl", "ru", "en"];

for (const level of ["A1", "A2", "B1", "B2"]) {
  for (const lang of LANGS) {
    const name = lang ? `prompt-${level}-${lang}.txt` : `prompt-${level}-none.txt`;
    writeFileSync(join(here, "build", name), build(level, lang), "utf8");
  }
}

console.log(`wrote ${4 * LANGS.length} prompts to build/`);

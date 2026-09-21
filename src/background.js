/**
 * All network traffic lives here.
 *
 * Two reasons the API call is not made from the content script:
 *  1. Page CSP would block it on many sites.
 *  2. The API key never enters the page context, so a hostile page cannot read it.
 */

const ENDPOINTS = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions"
};

const LEVEL_BRIEF = {
  A1: "very short sentences (max ~8 words), only the most common everyday words, one idea per sentence",
  A2: "short sentences (max ~12 words), common everyday vocabulary, simple past and present tenses only",
  B1: "clear sentences (max ~15 words), everyday vocabulary, no jargon; explain any unavoidable technical term in a short clause",
  B2: "moderately complex sentences allowed, but no rare vocabulary, no nested clauses, no bureaucratic phrasing"
};

/**
 * `lang` is whatever the page declared in <html lang>. Naming a language by way
 * of example here is a trap: it becomes the only concrete language in the
 * prompt and batches drift toward it. Ground the rule in the page's own value
 * or leave it abstract.
 */
function buildSystemPrompt(level, lang) {
  const langRule = lang
    ? `1. Write every block in the language of the input, which this page declares as "${lang}". Never translate into any other language.`
    : "1. Write every block in THE SAME LANGUAGE as that block's input. Never translate into any other language.";

  return [
    "You simplify text for readers who find the original hard to follow.",
    "",
    "Absolute rules:",
    langRule,
    "   If your output for a block is not in the same language as that block's input, you have made an error. Check before answering.",
    "2. Preserve every fact: names, numbers, dates, amounts, negations, conditions, and qualifiers such as 'may', 'only', 'not'.",
    "3. Do not add information, opinions, or explanations that were not in the original.",
    "4. Do not summarise. Each block keeps its full meaning. Roughly similar length is fine; shorter is fine; do not drop content.",
    "5. Keep the original register of proper nouns and quoted material.",
    "6. Where a word is harder than the target level, replace it with the most common word in the same language that means the same thing.",
    "   Substitute only when the meaning survives exactly. Never swap a proper noun, a quoted phrase, or a term whose precision matters (legal, medical, technical).",
    "   If no simpler word carries the same meaning, keep the original word rather than approximating it.",
    "",
    `Target reading level: CEFR ${level}. That means: ${LEVEL_BRIEF[level] || LEVEL_BRIEF.B1}.`,
    "",
    "Input is a JSON array of objects: [{\"i\": 0, \"t\": \"...\"}, ...].",
    "Output ONLY a JSON array of the same length, same order: [{\"i\": 0, \"t\": \"simplified text\"}, ...].",
    "No markdown fences, no commentary, no preamble."
  ].join("\n");
}

/**
 * Read straight from storage rather than accepting the key in the message.
 * The popup talks to the content script, so a key passed that way would sit in
 * the reader's tab; this keeps it inside the extension's own contexts.
 */
async function keyFor(provider) {
  const s = await chrome.storage.local.get([`key_${provider}`, "apiKey"]);
  // s.apiKey is the pre-provider storage shape, kept so an existing key survives.
  const key = s[`key_${provider}`] || (provider === "anthropic" ? s.apiKey : "");
  if (!key) throw new Error("No API key saved for this provider.");
  return key;
}

async function simplifyBatch({ blocks, level, model, provider = "anthropic", lang }) {
  const apiKey = await keyFor(provider);
  const call = provider === "openai" ? callOpenAI : callAnthropic;
  const { text, usage } = await call({
    system: buildSystemPrompt(level, lang),
    input: JSON.stringify(blocks),
    apiKey,
    model
  });

  return { results: await dropTranslated(blocks, parseJsonArray(text)), usage };
}

/**
 * The prompt asks for the input's language; it cannot guarantee it. Whole
 * batches occasionally come back translated, so every block is verified and a
 * mismatched one is discarded — content.js leaves those paragraphs untouched,
 * which is always better than silently replacing them with another language.
 */
async function detect(text) {
  if (!text || text.length < 40) return "";
  return HAS_NATIVE_DETECT ? detectNative(text) : detectByShape(text);
}

// Safari implements no i18n.detectLanguage. Without a fallback the throw
// propagates through dropTranslated and every batch on the page reports as
// failed, so this is checked once rather than per call.
const HAS_NATIVE_DETECT = typeof chrome.i18n?.detectLanguage === "function";

async function detectNative(text) {
  const r = await chrome.i18n.detectLanguage(text);
  const top = (r.languages || [])[0];
  if (!r.isReliable || !top || top.percentage < 70) return "";
  return top.language.split("-")[0];
}

/**
 * A deliberately narrow stand-in, not a language identifier. dropTranslated
 * asks one question — are these two texts in different languages — and the
 * case it guards against is a block coming back translated, nearly always
 * into English. Script settles that outright for Cyrillic, Greek, Arabic,
 * Hebrew, CJK, Thai and Devanagari; Latin scripts are told apart by their
 * most frequent function words, which are short, ubiquitous and rarely
 * borrowed between languages.
 *
 * Its codes are not interchangeable with the Chrome path's — a Russian block
 * is "cyrl" here and "ru" there. That is fine because both sides of every
 * comparison come from the same detector.
 */
const SCRIPTS = [
  ["cyrl", /[\u0400-\u04FF]/g],
  ["grek", /[\u0370-\u03FF]/g],
  ["arab", /[\u0600-\u06FF]/g],
  ["hebr", /[\u0590-\u05FF]/g],
  ["hang", /[\uAC00-\uD7AF]/g],
  ["kana", /[\u3040-\u30FF]/g],
  ["han", /[\u4E00-\u9FFF]/g],
  ["thai", /[\u0E00-\u0E7F]/g],
  ["deva", /[\u0900-\u097F]/g],
  ["latn", /[A-Za-z\u00C0-\u024F]/g]
];

const MARKERS = {
  en: ["the", "and", "of", "to", "is", "in", "that", "it", "for", "was", "with", "not", "are", "this"],
  nl: ["de", "het", "een", "en", "van", "is", "dat", "niet", "zijn", "voor", "met", "op", "aan", "worden"],
  de: ["der", "die", "das", "und", "ist", "nicht", "den", "von", "zu", "mit", "für", "auf", "werden", "dem"],
  fr: ["le", "la", "les", "et", "est", "des", "que", "ne", "pas", "pour", "dans", "avec", "une", "sur"],
  es: ["el", "los", "las", "y", "es", "de", "que", "no", "para", "con", "por", "una", "del", "se"],
  it: ["il", "le", "è", "di", "che", "non", "per", "con", "una", "dei", "sono", "del", "nel", "alla"],
  pt: ["os", "as", "é", "de", "que", "não", "para", "com", "uma", "dos", "por", "se", "mais", "como"],
  da: ["og", "af", "til", "er", "det", "som", "ikke", "har", "med", "for", "den", "kan", "skal", "være"],
  sv: ["och", "att", "det", "som", "är", "för", "inte", "med", "har", "den", "till", "kan", "ska", "vara"],
  pl: ["nie", "się", "jest", "że", "na", "do", "od", "przez", "oraz", "lub", "być", "który", "tego", "jak"],
  tr: ["ve", "bir", "bu", "için", "ile", "olarak", "daha", "değil", "olan", "gibi", "kadar", "sonra", "veya", "ancak"]
};

function scriptOf(text) {
  let best = "";
  let bestCount = 0;

  for (const [name, re] of SCRIPTS) {
    const n = (text.match(re) || []).length;
    if (n > bestCount) {
      bestCount = n;
      best = name;
    }
  }

  // Punctuation and digits are script-neutral, so a block is only called for a
  // script once a clear share of its characters belong to one.
  return bestCount >= text.length * 0.15 ? best : "";
}

function detectByShape(text) {
  const script = scriptOf(text);
  if (script !== "latn") return script;

  const words = new Set(text.toLowerCase().match(/[a-z\u00DF-\u024F]+/g) || []);
  if (words.size < 8) return "";

  let best = "";
  let bestScore = 0;
  let runnerUp = 0;

  for (const lang in MARKERS) {
    let score = 0;
    for (const marker of MARKERS[lang]) if (words.has(marker)) score++;

    if (score > bestScore) {
      runnerUp = bestScore;
      bestScore = score;
      best = lang;
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  // Standing in for the isReliable / 70% bar the Chrome path applies: report
  // an ambiguous block as unknown so dropTranslated keeps it rather than
  // discarding text that was never actually translated.
  return bestScore >= 3 && bestScore >= runnerUp + 2 ? best : "";
}

async function dropTranslated(inputs, results) {
  const source = new Map(inputs.map((b) => [b.i, b.t]));
  const kept = [];

  for (const r of results) {
    const original = source.get(r.i);
    if (!original || typeof r.t !== "string") continue;

    const [was, now] = await Promise.all([detect(original), detect(r.t)]);
    if (was && now && was !== now) {
      console.warn(`[Simplify] dropped block ${r.i}: ${was} became ${now}`);
      continue;
    }
    kept.push(r);
  }

  return kept;
}

async function callAnthropic({ system, input, apiKey, model }) {
  const data = await postJson(ENDPOINTS.anthropic, {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    // Required for direct browser-origin calls.
    "anthropic-dangerous-direct-browser-access": "true"
  }, {
    model,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: input }]
  });

  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return { text, usage: normaliseUsage(data.usage) };
}

async function callOpenAI({ system, input, apiKey, model }) {
  const data = await postJson(ENDPOINTS.openai, {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`
  }, {
    model,
    max_tokens: 4000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: input }
    ]
  });

  const text = (data.choices?.[0]?.message?.content || "").trim();

  return { text, usage: normaliseUsage(data.usage) };
}

async function postJson(url, headers, body) {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`API ${res.status}. ${shorten(detail)}`);
  }

  return res.json();
}

/** The two providers name their token counts differently; content.js sees one shape. */
function normaliseUsage(u) {
  if (!u) return null;
  return {
    input_tokens: u.input_tokens ?? u.prompt_tokens ?? 0,
    output_tokens: u.output_tokens ?? u.completion_tokens ?? 0
  };
}

function parseJsonArray(raw) {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {
    // Model occasionally wraps the array in prose. Take the outermost array.
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (_) {
        /* fall through */
      }
    }
  }
  throw new Error("Could not read the model's response as JSON.");
}

function shorten(s) {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > 180 ? `${t.slice(0, 180)}…` : t;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "SIMPLIFY_BATCH") return false;

  simplifyBatch(msg.payload)
    .then((r) => sendResponse({ ok: true, ...r }))
    .catch((e) => sendResponse({ ok: false, error: e.message }));

  return true; // keep the message channel open for the async reply
});

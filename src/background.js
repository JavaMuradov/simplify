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
  const r = await chrome.i18n.detectLanguage(text);
  const top = (r.languages || [])[0];
  if (!r.isReliable || !top || top.percentage < 70) return "";
  return top.language.split("-")[0];
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

const LEVEL_HINTS = {
  A1: "Very short sentences. For beginners.",
  A2: "Short sentences, everyday words.",
  B1: "Plain language most adults read comfortably.",
  B2: "Lighter edit. Keeps more nuance."
};

const MODELS = {
  anthropic: [
    ["claude-haiku-4-5-20251001", "Haiku 4.5 — fast and cheap"],
    ["claude-sonnet-5", "Sonnet 5 — better level control"]
  ],
  openai: [
    ["gpt-4o-mini", "GPT-4o mini — fast and cheap"],
    ["gpt-4o", "GPT-4o — better level control"]
  ]
};

const KEY_HINT = { anthropic: "sk-ant-…", openai: "sk-…" };

const els = {
  levels: document.querySelectorAll(".lvl"),
  providers: document.querySelectorAll(".prov"),
  levelHint: document.getElementById("levelHint"),
  model: document.getElementById("model"),
  apiKey: document.getElementById("apiKey"),
  run: document.getElementById("run"),
  restore: document.getElementById("restore"),
  status: document.getElementById("status")
};

let level = "B1";
let provider = "anthropic";

// Each provider keeps its own key and model choice, so switching back and
// forth never makes you paste a key again.
const keys = { anthropic: "", openai: "" };
const models = { anthropic: MODELS.anthropic[0][0], openai: MODELS.openai[0][0] };

function setStatus(text, tone = "") {
  els.status.textContent = text;
  els.status.dataset.tone = tone;
}

function selectLevel(next) {
  level = next;
  els.levels.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.level === next)));
  els.levelHint.textContent = LEVEL_HINTS[next];
  chrome.storage.local.set({ level: next });
}

function selectProvider(next) {
  provider = next;
  els.providers.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.provider === next)));
  els.model.replaceChildren(...MODELS[next].map(([value, label]) => new Option(label, value)));
  els.model.value = models[next];
  els.apiKey.value = keys[next];
  els.apiKey.placeholder = KEY_HINT[next];
  chrome.storage.local.set({ provider: next });
}

els.levels.forEach((b) => b.addEventListener("click", () => selectLevel(b.dataset.level)));
els.providers.forEach((b) => b.addEventListener("click", () => selectProvider(b.dataset.provider)));

els.apiKey.addEventListener("change", () => {
  keys[provider] = els.apiKey.value.trim();
  chrome.storage.local.set({ [`key_${provider}`]: keys[provider] });
});

els.model.addEventListener("change", () => {
  models[provider] = els.model.value;
  chrome.storage.local.set({ [`model_${provider}`]: models[provider] });
});

chrome.storage.local
  .get(["provider", "level", "key_anthropic", "key_openai", "model_anthropic", "model_openai", "apiKey"])
  .then((s) => {
    // s.apiKey is the pre-provider storage shape, kept so an existing key survives.
    keys.anthropic = s.key_anthropic || s.apiKey || "";
    keys.openai = s.key_openai || "";
    models.anthropic = s.model_anthropic || MODELS.anthropic[0][0];
    models.openai = s.model_openai || MODELS.openai[0][0];
    selectLevel(s.level || "B1");
    selectProvider(s.provider || "anthropic");
  });

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * content.js is injected on demand rather than declared for every site, so the
 * extension reads only the tab you invoked it on. Injecting twice would
 * register a second message listener, so the ping decides.
 */
async function ensureInjected(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "GET_STATE" });
  } catch (_) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["src/content.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["src/content.js"] });
  }
}

async function send(message) {
  const tab = await activeTab();
  if (!tab?.id || !/^https?:/.test(tab.url || "")) {
    throw new Error("This page cannot be simplified.");
  }
  try {
    await ensureInjected(tab.id);
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (_) {
    throw new Error("This page cannot be simplified.");
  }
}

els.run.addEventListener("click", async () => {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    setStatus("Add your API key first.", "error");
    els.apiKey.focus();
    return;
  }

  els.run.disabled = true;
  setStatus("Working through the page…");

  try {
    const r = await send({
      type: "RUN_SIMPLIFY",
      settings: { level, apiKey, provider, model: els.model.value }
    });

    if (r?.ok) {
      const cost = estimateCost(els.model.value, r.inTokens, r.outTokens);
      setStatus(`${r.blocks} blocks rewritten · about ${cost}`);
    } else {
      setStatus(r?.error || "Something went wrong.", "error");
    }
  } catch (e) {
    setStatus(e.message, "error");
  } finally {
    els.run.disabled = false;
  }
});

els.restore.addEventListener("click", async () => {
  try {
    await send({ type: "RESTORE" });
    setStatus("Original text restored.");
  } catch (e) {
    setStatus(e.message, "error");
  }
});

/** Rough per-page cost, so the user is never surprised by their bill.
 *  USD per million tokens. List prices change — check before trusting these. */
const RATES = {
  "claude-haiku-4-5-20251001": { in: 1.0, out: 5.0 },
  "claude-sonnet-5": { in: 3.0, out: 15.0 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10.0 }
};

function estimateCost(model, inTok, outTok) {
  const r = RATES[model];
  if (!r) return "an unknown amount";
  const usd = ((inTok || 0) / 1e6) * r.in + ((outTok || 0) / 1e6) * r.out;
  return usd < 0.01 ? "under $0.01" : `$${usd.toFixed(3)}`;
}

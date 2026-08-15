/**
 * Walks the readable blocks of the page, sends them off in batches,
 * and swaps the text in place. Originals are kept in memory so the
 * user can flip back at any time.
 */

const BLOCK_SELECTOR = "p, li, dd, blockquote, h1, h2, h3, h4, h5, h6, td, figcaption";
const SKIP_INSIDE = "nav, header, footer, aside, code, pre, script, style, noscript, form, button, [contenteditable='true'], [role='navigation'], .simplify-status";

const MIN_CHARS = 60;      // below this, simplification adds nothing
const BATCH_SIZE = 8;      // blocks per API call
const MAX_BLOCKS = 120;    // hard ceiling, protects the user's bill
const CONCURRENCY = 3;     // parallel API calls

const state = {
  originals: new Map(),  // element -> original textContent
  running: false,
  simplified: false
};

/* ---------- collection ---------- */

function isVisible(el) {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function collectBlocks() {
  const root = document.querySelector("article, main, [role='main']") || document.body;
  const out = [];

  for (const el of root.querySelectorAll(BLOCK_SELECTOR)) {
    if (el.closest(SKIP_INSIDE)) continue;
    if (el.querySelector(BLOCK_SELECTOR)) continue; // only leaf blocks
    const text = el.textContent.replace(/\s+/g, " ").trim();
    if (text.length < MIN_CHARS) continue;
    if (!isVisible(el)) continue;
    out.push({ el, text });
    if (out.length >= MAX_BLOCKS) break;
  }
  return out;
}

/* ---------- replacement ---------- *
 * v0 replaces textContent, which flattens inline markup (links, bold)
 * inside a block. That is a deliberate trade-off: it is the only way to
 * guarantee we never corrupt the DOM. Preserving inline anchors means
 * sentence-to-span alignment, which is the next real piece of work.
 */

function applySimplified(el, newText) {
  if (!state.originals.has(el)) state.originals.set(el, el.textContent);
  el.textContent = newText;
  el.classList.add("simplify-block");
}

function restoreAll() {
  for (const [el, original] of state.originals) {
    el.textContent = original;
    el.classList.remove("simplify-block");
  }
  state.originals.clear();
  state.simplified = false;
}

/* ---------- status pill ---------- */

let pill;

function showStatus(text, tone = "working") {
  if (!pill) {
    pill = document.createElement("div");
    pill.className = "simplify-status";
    document.documentElement.appendChild(pill);
  }
  pill.dataset.tone = tone;
  pill.textContent = text;
  pill.hidden = false;
}

function hideStatus(afterMs = 2600) {
  if (!pill) return;
  setTimeout(() => { if (pill) pill.hidden = true; }, afterMs);
}

/* ---------- orchestration ---------- */

async function runBatch(batch, settings) {
  const payload = batch.map((b, i) => ({ i, t: b.text }));

  const reply = await chrome.runtime.sendMessage({
    type: "SIMPLIFY_BATCH",
    // The page's own declared language, so the prompt never has to guess.
    payload: { blocks: payload, lang: document.documentElement.lang || "", ...settings }
  });

  if (!reply?.ok) throw new Error(reply?.error || "No response from the extension.");

  for (const item of reply.results) {
    const target = batch[item.i];
    if (target && typeof item.t === "string" && item.t.trim()) {
      applySimplified(target.el, item.t.trim());
    }
  }
  return reply.usage;
}

async function simplifyPage(settings) {
  if (state.running) return { ok: false, error: "Already running." };

  const blocks = collectBlocks();
  if (!blocks.length) {
    showStatus("No readable text found on this page.", "idle");
    hideStatus();
    return { ok: false, error: "No readable text found on this page." };
  }

  state.running = true;
  const batches = [];
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    batches.push(blocks.slice(i, i + BATCH_SIZE));
  }

  let done = 0;
  let inTokens = 0;
  let outTokens = 0;
  let failed = 0;

  showStatus(`Simplifying… 0 / ${blocks.length}`);

  const queue = [...batches];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const batch = queue.shift();
      try {
        const usage = await runBatch(batch, settings);
        if (usage) {
          inTokens += usage.input_tokens || 0;
          outTokens += usage.output_tokens || 0;
        }
      } catch (e) {
        failed += batch.length;
        console.warn("[Simplify] batch failed:", e.message);
      }
      done += batch.length;
      showStatus(`Simplifying… ${done} / ${blocks.length}`);
    }
  });

  await Promise.all(workers);

  state.running = false;
  state.simplified = state.originals.size > 0;

  if (!state.simplified) {
    showStatus("Nothing was simplified. Check your API key.", "error");
    hideStatus(5000);
    return { ok: false, error: "Every batch failed. Check the API key and try again." };
  }

  const note = failed ? ` · ${failed} blocks skipped` : "";
  showStatus(`Done · ${state.originals.size} blocks${note}`, "done");
  hideStatus();

  return { ok: true, blocks: state.originals.size, failed, inTokens, outTokens };
}

/* ---------- messaging ---------- */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "RUN_SIMPLIFY") {
    simplifyPage(msg.settings).then(sendResponse);
    return true;
  }
  if (msg?.type === "RESTORE") {
    restoreAll();
    showStatus("Original text restored.", "idle");
    hideStatus();
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "GET_STATE") {
    sendResponse({ simplified: state.simplified, running: state.running });
    return false;
  }
  return false;
});

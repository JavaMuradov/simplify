# Simplify

A Chrome extension that rewrites the page you are reading into simpler language — **in the same language**. Dutch stays Dutch, Russian stays Russian. Nothing is translated.

From language learners, for language learners.

Bring your own API key, from **Anthropic or OpenAI**. There is no server, no account, and no backend.

---

## Install (development)

```bash
git clone https://github.com/JavaMuradov/simplify.git
cd simplify
```

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select this folder
4. Click the extension icon, pick a provider, paste that provider's API key, pick a level, hit **Simplify this page**

Get a key at <https://console.anthropic.com> or <https://platform.openai.com>.

---

## How it works

```
popup.js          settings + trigger; injects content.js into the invoked tab
    │  chrome.scripting.executeScript, then chrome.tabs.sendMessage
    ▼
content.js        finds leaf text blocks, batches them 8 at a time,
    │             3 batches in parallel, swaps text in place
    │  chrome.runtime.sendMessage
    ▼
background.js     the only place that talks to a provider's API
```

**Nothing is declared to run on every site.** The content script is injected on demand into the one tab you invoke the extension on, so the permission Chrome asks for is `activeTab`, not access to every page you visit.

**Keys live in `chrome.storage.local`**, one per provider, and are only ever read by the service worker — so a hostile page cannot reach them from the content script context. A key is sent to the provider it belongs to and nowhere else. See [PRIVACY.md](PRIVACY.md).

**Two providers, one prompt.** `background.js` builds the same system prompt either way and routes to `api.anthropic.com` or `api.openai.com`, normalising the two response and token-count shapes so `content.js` never learns there is more than one.

**Level control** is done with an explicit per-CEFR-level brief in the system prompt (sentence length ceiling, vocabulary constraint) rather than the bare label `"B1"`, which models interpret loosely.

**Vocabulary substitution** is a separate prompt rule: swap a hard word for the most common equivalent in the same language, but never a proper noun, a quoted phrase, or a term whose precision matters — and keep the original rather than approximate it.

**Fact preservation** is enforced by prompt rules covering numbers, dates, negations and qualifiers. This is the weakest part of the system and the thing to test hardest.

---

## Known limitations

These are deliberate trade-offs, not oversights.

| Limitation | Why | Fix |
|---|---|---|
| Inline links and bold inside a simplified paragraph are flattened | `textContent` replacement is the only way to guarantee the DOM is never corrupted | Sentence-to-span alignment, or ask the model to return the anchor text unchanged and re-wrap it |
| SPA re-renders wipe the simplified text | No MutationObserver yet | Add one, but debounce hard — naive observers loop forever |
| Capped at 120 blocks per page | Protects the user's bill | Lazy-simplify on scroll instead |
| No verification pass | Doubles cost | Second call that checks numbers and negations survived |
| Level calibration is unvalidated outside Dutch and English | No readability corpus for most languages | Few-shot anchor examples per language |

---

## Roadmap

- [ ] Preserve inline markup
- [ ] MutationObserver for SPA pages
- [ ] Lazy simplification on scroll
- [ ] On-device path via Chrome's Prompt API (free tier, English only for now)
- [ ] Safari/iOS port — the native container app calls Apple's Foundation Models framework, so no key and no network at all
- [ ] Fact-integrity check on numbers, dates and negations

---

## Cost

A long article runs roughly $0.005–0.02 on the cheaper model of either provider. The popup shows the real figure after each run, from the API's own token counts.

Rates are listed in `RATES` in `src/popup.js` and are list prices at the time of writing — they drift. A model with no entry there reports "an unknown amount" rather than guessing.

---

## Licence

[MIT](LICENSE)

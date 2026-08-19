# I built a Chrome extension that rewrites any web page at my reading level — without translating it

*Dutch stays Dutch. Russian stays Russian. Only the difficulty changes.*

---

## The problem

I learn languages by reading. Not with flashcards or graded readers, but with the actual internet — news sites, blog posts, government pages, the same things a native speaker would read on a Tuesday morning.

The trouble is the gap. Somewhere between "I finished the beginner course" and "I can read a newspaper", there is a long stretch where every real article is *almost* readable. You get the gist of a sentence, then hit a subordinate clause with two rare verbs and a bureaucratic noun, and the meaning slips away. So you do what everybody does: you highlight the paragraph and hit translate.

And translating is exactly the wrong move.

The moment the paragraph turns into English, you have stopped reading the target language. You have read *about* it. The sentence structure you were supposed to absorb is gone, the vocabulary you half-recognised is gone, and the small productive struggle that actually teaches you something is gone too. Translation solves comprehension by removing the thing you came for.

What I wanted was the opposite move: keep the language, lower the difficulty. Take that dense Dutch paragraph and rewrite it in *simpler Dutch* — shorter sentences, more common words, the same facts. That is the version I can actually read, and every word of it is still practice.

Nothing I could find did that. Reader modes strip layout. Translators strip the language. Summarisers strip the content. So I built **Simplify**.

**GitHub: [github.com/JavaMuradov/simplify](https://github.com/JavaMuradov/simplify)**

---

## What it does

Open an article. Click the extension icon. Pick a reading level. Click **Simplify this page**.

The paragraphs are rewritten in place, on the page, in the page's own language. Layout, images and headings stay where they are — only the text of each block changes. Click **Show original** and the page snaps back exactly as it was, because the original text never left memory.

The levels follow the CEFR scale used in language teaching:

- **A1** — very short sentences, only the most common everyday words
- **A2** — short sentences, everyday vocabulary, simple tenses
- **B1** — clear sentences, no jargon, plain language most adults read comfortably
- **B2** — a lighter edit that keeps more nuance

It is not a translator and not a summariser. Names, numbers, dates, amounts and negations are preserved deliberately. If a hard word has no common equivalent that means *exactly* the same thing, the hard word stays rather than being approximated — an approximation is worse than a word you have to look up, because you don't know it happened.

And it turns out this is not only a language-learner tool. Legal terms and conditions, medical letters, insurance policies and municipal correspondence are all written above the level most people read comfortably, in their own native language. Same extension, same button.

---

## Prerequisites

There is no account and no subscription, because there is no server. You bring your own API key.

**You need:**

1. **Google Chrome** (or any Chromium browser — Edge, Brave, Arc) with Manifest V3 support.
2. **An API key from Anthropic or OpenAI.** Either works; you pick the provider in the popup.
   - Anthropic: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
   - OpenAI: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
3. **A few dollars of credit on that key.** A long article costs roughly **half a cent to two cents** on the cheaper model of either provider. The popup shows you the real figure after each run, calculated from the API's own token counts — not a guess.

**To install it (developer mode, while it is pre-store):**

```bash
git clone https://github.com/JavaMuradov/simplify.git
cd simplify
```

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select the folder you just cloned
4. Click the extension icon, pick a provider, paste that provider's key, pick a level, and hit **Simplify this page**

Your key is stored in `chrome.storage.local`, on your machine. It is sent to the provider it belongs to and to nowhere else. It cannot reach me, because there is no "me" in the network path at all.

---

## How it works

Three files, three jobs, and a hard line between them.

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

### Finding the text

`content.js` looks inside `<article>`, `<main>` or `[role="main"]` if the page has one, and falls back to `<body>` if it doesn't. It collects **leaf blocks** only — a `<p>`, `<li>`, `<blockquote>`, heading or table cell that doesn't contain another block — so no paragraph is ever sent twice as part of its own container.

Navigation, headers, footers, sidebars, forms, buttons, `<code>` and `<pre>` are skipped. Blocks under 60 characters are skipped too; simplifying "Read more" achieves nothing but spends money. The page is capped at 120 blocks, which is a bill-protection measure, not a technical limit.

### Sending it off

Blocks are batched **8 at a time** with **3 batches in flight**, as a numbered JSON array: `[{"i": 0, "t": "..."}, ...]`. The model must return the same array, same length, same order. Indices, rather than matching on text, are what let a batch fail without corrupting the page — a failed batch just leaves those paragraphs in their original form.

### The prompt is the product

This is the part that took the most iteration, and it is where the interesting work actually lives.

**Level control** is not the label. Asking a model for "B1" gets you a loose interpretation of B1, and it drifts between batches. Each level is instead expanded into an explicit brief — a sentence-length ceiling and a vocabulary constraint. A1 becomes "very short sentences (max ~8 words), only the most common everyday words, one idea per sentence". That is a rule a model can follow consistently.

**Naming a language in the prompt is a trap.** An early version said something like "for example, if the text is Dutch, keep it Dutch" — and batches started drifting toward Dutch regardless of what came in, because it was the only concrete language in the prompt. The fix: ground the rule in the page's own `<html lang>` value, or leave it entirely abstract. Never give an example.

**Vocabulary substitution** is its own rule with its own escape hatch: swap a hard word for the most common equivalent *in the same language*, but never a proper noun, never a quoted phrase, and never a term whose precision matters — legal, medical, technical. If nothing carries the meaning exactly, keep the original.

**Fact preservation** is a rule covering numbers, dates, amounts, negations and qualifiers like *may*, *only*, *not*. It is also, honestly, the weakest part of the system, and the thing I test hardest. A verification pass would double the cost, so for now the rules do the work.

### Trusting the model, but verifying

The prompt asks for the input's language. It cannot *guarantee* it — occasionally a whole batch comes back translated anyway.

So every block is checked. `chrome.i18n.detectLanguage` runs on the original and on the rewrite, and if the language changed, **the block is discarded** and the original paragraph is left untouched. A paragraph you already couldn't read is a much better outcome than a paragraph silently swapped into another language you didn't ask for.

### Where the key lives

The API key is never passed in a message and never enters the page. The service worker reads it straight from `chrome.storage.local` when it needs it. The content script — the code running inside a page that may be hostile — never sees the key at all.

There is also **no content script declared for all sites**. `content.js` is injected on demand, into the one tab you invoked the extension on, at the moment you click. That is why the permission Chrome asks for is `activeTab` rather than access to every page you visit. The popup pings first and injects only if nothing answers, so a second invocation never registers a duplicate listener.

Two providers, one prompt: `background.js` builds the same system prompt either way, routes to `api.anthropic.com` or `api.openai.com`, and normalises the two different response and token-count shapes. `content.js` never learns that more than one provider exists.

---

## What it doesn't do (yet)

These are trade-offs I made on purpose, and I would rather list them than have you discover them:

- **Inline links and bold inside a rewritten paragraph are flattened.** Replacing `textContent` is the only way to guarantee the DOM is never corrupted. Preserving inline anchors means sentence-to-span alignment, which is the next real piece of work.
- **Single-page apps that re-render can wipe the simplified text.** There is no `MutationObserver` yet — a naive one loops forever, so it needs doing properly.
- **120 blocks per page maximum.** Lazy simplification on scroll is the better answer.
- **No verification pass on facts.** It would double the cost per page.
- **Level calibration is only really validated in Dutch and English.** There is no readability corpus for most languages; few-shot anchor examples per language are the likely fix.

On the roadmap: preserved inline markup, an SPA observer, lazy simplification, an on-device path via Chrome's built-in Prompt API (free, English only for now), and a Safari/iOS port where the native container app calls Apple's Foundation Models framework — no key, no network, nothing leaving the phone at all.

---

## Try it

The code is MIT-licensed and the whole thing is under 600 lines across three files. If you read in a second language, or you have ever had to read a policy document written by someone who did not want you to understand it, it is worth ten minutes of setup.

**[github.com/JavaMuradov/simplify](https://github.com/JavaMuradov/simplify)**

From language learners, for language learners.

---

## Before and after

*(Screenshots below.)*

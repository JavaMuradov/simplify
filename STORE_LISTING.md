# Chrome Web Store submission — copy to paste

Not shipped with the extension. Working notes for the Developer Dashboard forms.

## Single purpose

> Rewrites the text of the page the user is currently reading into simpler
> language at a reading level they choose, in the page's own language.

## Short description (132 char limit — this is 108)

Rewrites any page into simpler language, in the same language. Pick a reading level. Bring your own API key.

## Detailed description

The store does not render Markdown. Paste the block below as plain text.

---

Simplify rewrites the page you are reading into plainer language — in the same language it was written in. Dutch stays Dutch. Russian stays Russian. Nothing is translated.

It is made for people reading in a language they are still learning, and for anyone facing text pitched above the level they read comfortably.

HOW IT WORKS

Open an article, click Simplify, and the paragraphs are rewritten in place. Press "Show original" to put the page back exactly as it was.

CHOOSE YOUR LEVEL

A1 — very short sentences, only the most common everyday words
A2 — short sentences, everyday vocabulary, simple tenses
B1 — clear sentences, no jargon, plain language most adults read comfortably
B2 — a lighter edit that keeps more nuance

The levels follow the CEFR scale used in language teaching.

WHAT IT KEEPS

Names, numbers, dates, amounts and negations are preserved. Quoted material and proper nouns are left alone. A hard word is replaced only when a common word means exactly the same thing — otherwise the original stays rather than being approximated. Every rewritten paragraph is checked to confirm it is still in the language it started in.

BRING YOUR OWN KEY

Simplify uses your own API key from Anthropic or OpenAI. There is no account, no subscription and no server. A long article usually costs between half a cent and two cents, and the extension shows you the real figure after each run, taken from the API's own token counts.

PRIVACY

Your key is stored on your own device and is sent only to the provider you choose. It never reaches the developer, because there is no server to receive it. The extension reads only the tab you invoke it on. It does not run in the background, and it does not touch pages you have not asked it to.

WHAT IT DOES NOT DO

It does not translate. It does not summarise. Links and bold inside a rewritten paragraph lose their formatting. Pages that rebuild themselves as you scroll may revert to the original text.

From language learners, for language learners.

---

## Category

Accessibility.

Education is the reasonable alternative and reaches language learners in browse,
but the function is reading assistance and Accessibility is the less crowded
shelf. Only one may be chosen.

## Language

English. Pick United Kingdom over United States if the British spellings in the
listing and README are kept ("licence", "summarise"). This sets the language of
the listing text, not the languages the extension can simplify — it works in any
language the page is written in.

## Permission justifications

**storage**
> Stores the user's API key, chosen provider, model and reading level on their
> own device so they are not re-entered on every use. Nothing is transmitted to
> the developer; the extension has no server.

**activeTab**
> Grants access to the single tab the user invokes the extension on, at the
> moment they click. Used to read that page's paragraph text and to write the
> simplified text back in place.

**scripting**
> Injects the content script into the invoked tab on demand. The extension
> deliberately does not declare a content script for all sites, so it runs only
> where the user has explicitly asked it to.

**Host permission: api.anthropic.com and api.openai.com**
> The two API endpoints the extension calls to perform the rewrite. The user
> supplies their own key for whichever provider they select. These are the only
> network destinations the extension can reach.

**Remote code**
> None. All code and fonts are bundled in the package. Nothing is fetched or
> evaluated at runtime.

## Data disclosures (Privacy tab)

Declare **yes** to:

- *Website content* — visible paragraph text of the invoked page is sent to the
  user's chosen API provider to be rewritten.
- *Authentication information* — the user's own API key is stored locally and
  sent to that provider as the API's auth header.

Declare **no** to: personally identifiable information, health, financial,
personal communications, location, browsing history, user activity.

Tick all three certifications: data is not sold, not used for purposes unrelated
to the single purpose, and not used to determine creditworthiness.

Privacy policy URL: host `PRIVACY.md` and paste the public URL here. Enabling
GitHub Pages on the repository is enough.

## Before uploading

- [ ] Version bumped past the last published value (currently 1.0.0)
- [ ] One screenshot at 1280x800 or 640x400
- [ ] Privacy policy live at a public URL
- [ ] `zip -r ../simplify-1.0.0.zip . -x '.git/*' '.DS_Store' 'STORE_LISTING.md'`

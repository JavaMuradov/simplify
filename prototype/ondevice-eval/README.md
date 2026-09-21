# On-device evaluation harness

Answers one question before any money is spent on it: **can Apple's on-device
model do what Simplify promises — simplify text without translating it?**

Runs entirely on Command Line Tools. No Xcode, no Apple Developer account,
no container app. Requires macOS 26+ on Apple Intelligence hardware.

```bash
node extract-prompt.mjs          # pull the live prompt out of src/background.js
swiftc -O -parse-as-library -o build/eval Eval.swift
./build/eval --level B1 --dir .  # add --hardened, or --abstract
node score.mjs B1                # or: node score.mjs B1-hardened
```

`extract-prompt.mjs` slices `LEVEL_BRIEF` and `buildSystemPrompt` out of
[`src/background.js`](../../src/background.js) rather than copying them, so the
evaluation cannot drift from the prompt the extension actually ships. If that
file is refactored, the extractor fails loudly instead of testing a stale copy.

## Flags

| Flag | Effect |
|---|---|
| `--level A1\|A2\|B1\|B2` | which CEFR brief to test |
| `--abstract` | use the no-`<html lang>` prompt, to price what a missing lang declaration costs |
| `--hardened` | prepend an aggressive same-language directive naming the language in its own endonym |

## Reading the output

`score.mjs` is a screen, not a verdict. It matches facts as substrings, so a
model that legitimately rewrites `15 September 2022` as `September 15, 2022`
is flagged as a loss. Every failing block is printed in full for that reason —
judge the text, not the counter.

A `REFUSED` line is categorically different from a bad score: it means
`SystemLanguageModel.supportedLanguages` excludes that language and the
framework declined before generating. No prompt can fix it.

## Findings as of 2026-08-22

- 23 locales / 15 languages supported. **Russian, Polish, Ukrainian, Arabic and
  Hindi are absent** — Russian raises `unsupportedLanguageOrLocale`.
- With the shipping prompt, Dutch was translated into English in 2/2 blocks,
  even with `lang="nl"` stated explicitly. `--hardened` fixed that in 2/2.
- `--hardened` also pulled English within its B1 sentence ceiling (24w -> 12w),
  but started dropping dates — trading language drift for fact loss.
- ~4.5s for 5 blocks, offline, at no cost.

# Privacy Policy — Simplify

Last updated: 15 August 2026

Simplify is a Chrome extension that rewrites the text of a web page into simpler
language at a reading level you choose. It has no server, no account and no
analytics. This policy describes every piece of data the extension touches.

## Who operates this extension

Javid Muradov. Contact: muradovjavid@gmail.com

## What is stored on your device

The extension stores the following in `chrome.storage.local`, which lives only in
your own Chrome profile on your own computer:

- Your API key or keys, one per provider.
- Your chosen reading level (A1, A2, B1 or B2).
- Your chosen provider and model.

None of this is transmitted to the developer. There is no backend to transmit it
to. Uninstalling the extension deletes it.

## What leaves your device, and when

Nothing leaves your device until you click **Simplify this page**. When you do:

- The visible paragraph text of the page in that tab is sent, in batches, to the
  API provider you selected — either Anthropic (`api.anthropic.com`) or OpenAI
  (`api.openai.com`).
- Your API key for that provider is sent to that same provider, as the
  authentication header the API requires.

The text and the key go directly from your browser to that provider. They do not
pass through any server operated by the developer, because none exists.

Your API key is never sent to the developer, to any analytics service, or to any
party other than the provider you chose.

Once you have your result, how that provider handles the text is governed by
their policy, not this one:

- Anthropic: https://www.anthropic.com/legal/privacy
- OpenAI: https://openai.com/policies/privacy-policy

## What is never collected

- No browsing history, and no record of which pages you simplify.
- No analytics, telemetry, crash reporting or usage statistics.
- No personal information, contact details, location or device identifiers.
- No advertising, and no sale or transfer of data to third parties.

## Permissions and why each exists

- `storage` — saves your key, level, provider and model on your device.
- `activeTab` and `scripting` — lets the extension read and rewrite the text of
  the single tab you invoke it on, at the moment you click the button. The
  extension does not run on pages you have not explicitly asked it to act on.
- Host access to `api.anthropic.com` and `api.openai.com` — the two API
  endpoints. These are the only network destinations the extension can reach.

## Changes

Any change to this policy will be published at this address with an updated date.

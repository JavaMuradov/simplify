# Chrome Web Store submission — copy to paste

Not shipped with the extension. Working notes for the Developer Dashboard forms.

## Single purpose

> Rewrites the text of the page the user is currently reading into simpler
> language at a reading level they choose, in the page's own language.

## Short description (132 char limit)

> Rewrites any page into simpler language, in the same language. Choose a CEFR
> level. Bring your own API key.

## Detailed description

> Simplify rewrites the page you are reading into plainer language — in the same
> language it was written in. Dutch stays Dutch. Russian stays Russian. Nothing
> is translated.
>
> Choose a CEFR reading level from A1 to B2. A1 gives very short sentences and
> only the most common everyday words. B2 keeps more nuance and edits lightly.
> Hard words are swapped for the most common equivalent that means the same
> thing; names, numbers, dates and quoted material are left alone.
>
> Bring your own API key from Anthropic or OpenAI. There is no account, no
> server and no subscription. Your key is stored on your own device and is sent
> only to the provider you choose. The extension shows the actual cost of each
> run from the API's own token counts — a long article typically costs well
> under a cent.
>
> Press "Show original" at any time to put the page back.
>
> From language learners, for language learners.

## Category

Accessibility. (Productivity is the alternative; Accessibility better matches the
stated audience.)

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

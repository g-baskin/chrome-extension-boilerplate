# Social Finder

A local Chrome side-panel workspace for trustworthy research from currently rendered Meta Ad Library cards. Feed and Marketplace detection remain available.

## What it does

- Opens validated public Ad Library searches after an explicit click.
- Collects rendered cards while you manually browse, with visible limits.
- Shows each Ad Library ad's computed running days directly in its Social Finder card badge.
- Filters, sorts, saves, copies, shares, and exports visible evidence locally.
- Creates passphrase-encrypted saved-ad backups for manual transfer between Chrome profiles.
- Captures one memory-only visible-tab screenshot with drag and download alternatives.

It never auto-scrolls, auto-clicks, intercepts private APIs, uploads data, calls a model, or invents reach, spend, impression, or popularity facts.

## Develop and verify

```bash
npm run dev:social-finder
npm test --workspace @chrome-extensions/social-finder
npm run lint
npm run typecheck
npm run build:social-finder
```

## Load in Chrome

1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select `apps/social-finder/dist`.
3. Pin Social Finder and click its toolbar icon.

## Chrome smoke

1. Open a Nike Ad Library search and start collection.
2. Scroll manually; confirm visible collected counts grow without automatic movement.
3. Open Adidas; confirm Nike records do not mix into the new query.
4. Exercise filters, sorting, save, copy, export/import, clear confirmation, and screenshot actions.
5. Reopen the panel and extension; saved ads persist, screenshots do not.
6. Check unsupported, Feed, Marketplace, narrow-width, keyboard, forced-colors, and reduced-motion states.
7. Confirm `chrome://extensions` shows no new errors.

Saved ads and preferences use versioned `chrome.storage.local` keys. Transient collected cards, screenshots, cookies, and page HTML are never stored.

## Move saved ads between Chrome profiles

1. Open **Preferences and import**, then **Encrypted cross-profile backup**.
2. Enter a passphrase of at least 12 characters and export the backup.
3. In the other profile, choose that backup and enter the same passphrase.
4. Select **Decrypt and preview**, review duplicate/new counts, then confirm the merge.

Existing saved ads win duplicate-key conflicts. A failed decrypt, validation, or import does not change stored ads. Passphrases are never stored; losing one makes its backup unrecoverable.

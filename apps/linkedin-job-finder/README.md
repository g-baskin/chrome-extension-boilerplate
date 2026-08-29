# LinkedIn Job Finder

A local-first Chrome extension that compares the LinkedIn job currently open in your browser with keyword rules you control. It reports exact matched, missing, and excluded terms, then saves selected jobs and notes on your device.

## Develop

```bash
npm install
npm run dev:linkedin-job-finder
```

For a production build:

```bash
npm test --workspace @chrome-extensions/linkedin-job-finder
npm run lint --workspace @chrome-extensions/linkedin-job-finder
npm run typecheck --workspace @chrome-extensions/linkedin-job-finder
npm run build:linkedin-job-finder
```

Load the extension in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `apps/linkedin-job-finder/dist`.

## Logged-in smoke test

1. Open the extension popup and save required, preferred, and excluded phrases.
2. Open a LinkedIn job while signed in.
3. Confirm the panel reports exact keyword evidence.
4. Save the job, then navigate to another job without reloading LinkedIn.
5. Confirm the panel refreshes and saving the same job does not create a duplicate.
6. Open Saved jobs, edit notes, reopen a job, delete one record, and clear all.
7. Check keyboard operation and confirm data remains after restarting Chrome.

## MVP boundaries

- Reads only the job the user currently opens.
- Does not crawl search results, apply, authenticate, message, or use LinkedIn APIs.
- Makes no network requests and includes no analytics, telemetry, or remote code.
- LinkedIn selector changes may temporarily prevent extraction.
- Removing the extension removes its Chrome local storage.

See [PRIVACY.md](PRIVACY.md) for stored data and deletion behavior.

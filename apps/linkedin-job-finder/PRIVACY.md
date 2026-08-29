# Privacy

LinkedIn Job Finder processes the currently open LinkedIn job entirely inside Chrome. It does not send data to a server, use analytics, share data, read cookies, or access LinkedIn session credentials.

## Data stored on this device

Chrome local extension storage contains:

- required, preferred, and excluded keyword lists;
- saved job ID, title, company, location, canonical LinkedIn URL, and bounded description text;
- the match result and exact matched, missing, and excluded terms at save time;
- user notes plus saved and updated timestamps.

The extension keeps at most 250 saved jobs. Individual text fields and notes are bounded to protect Chrome's storage quota.

## Retention and deletion

Data remains until the user deletes one job, chooses **Clear all saved jobs**, or removes the extension. Keyword rules can be replaced from the popup. Chrome removes this extension's local storage when the extension is uninstalled.

## Permissions

- `storage` stores local keyword rules and saved jobs.
- Narrow LinkedIn Jobs host access lets the static content script read only an opened LinkedIn Jobs page.

The extension does not request browsing history, cookies, broad website access, or unlimited storage.

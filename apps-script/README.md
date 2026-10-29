# Lead and event logging (Google Apps Script)

The page sends one small JSON message per step to a Google Apps Script web app. The script writes it to a Google Sheet and e-mails BD when someone asks for a consultant.

```
Browser (index.html)  ──POST text/plain JSON──▶  Apps Script doPost  ──▶  Google Sheet
                                                       │                    ├─ Events     (one row per event)
                                                       │                    ├─ Responses  (one row per visitor, upserted)
                                                       └─▶ MailApp → BD     └─ KPI        (formulas, from setupKpiSheet)
```

## Set up (once, with an ADA Google account)

1. Create a new Google Sheet, for example **ADA Solution Finder – Leads**. Share it only with the project team and the ADA BD team.
2. In the Sheet open **Extensions → Apps Script**. Delete the sample code and paste the whole of [`Code.gs`](Code.gs).
3. At the top of the script set `BD_EMAIL` to the BD shared inbox (leave it empty to skip e-mail alerts). Save.
4. In the editor pick **setupKpiSheet** in the function list and click **Run**. Approve the permissions Google asks for (Sheets and sending e-mail as you). This creates the Events, Responses and KPI tabs.
5. Click **Deploy → New deployment** → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
7. In `index.html`, paste the URL into `CONFIG.ENDPOINT`:
   ```js
   const CONFIG={ENDPOINT:"https://script.google.com/macros/s/…/exec",LOG_MODE:"all"};
   ```
   Commit and push; GitHub Pages redeploys on its own.
8. Check it: open the `/exec` URL in a browser (you should see `"ok":true`), then go through the page once and look for new rows in Events and Responses.

## After changing the script

Apps Script keeps serving the old version until you redeploy: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The `/exec` URL stays the same.

## What gets stored

| Mode (`CONFIG.LOG_MODE`) | What is sent |
|---|---|
| `"all"` (pilot / acceptance) | Every step of every visit, with a random anonymous session ID |
| `"email_only"` (after acceptance) | Only the final consultant request (`lead`) |

- The e-mail address is stored only on the `lead` event, and only when the consent box is ticked (the consent time is stored too). The script drops the e-mail from every other event.
- Columns follow *Tech Implementation → D. Google Sheet structure*, plus `category_other`, `duration`, `one_off_m` and `consent_time`.
- Spam protection: a hidden honeypot field (`website`), server-side checks on event name, session ID, e-mail and field length, a per-session rate limit (CacheService) and a script lock so parallel writes never clash. Text that starts with `=`, `+`, `-` or `@` is stored as plain text, never as a formula.
- Sending never blocks the visitor: if the script is down, the page still works and the request is simply not logged.

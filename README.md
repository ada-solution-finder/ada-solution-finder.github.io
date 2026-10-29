# ADA Solution Finder – prototype

A single-page, no-build prototype of a guided questionnaire that recommends one of four ADA e-commerce service packages (P1 Starter → P4 Enterprise) with an estimated monthly fee.

## Flow

Intro → Pain points → Your brand → Your needs → Confirm answers → Package results (match % + fee range) → Optional consultant request → Done

## Run

Open `index.html` in a browser. No dependencies other than Google Fonts.

## Configuration

At the `CONFIG` constant in `index.html`:

- `ENDPOINT` – Google Apps Script `/exec` URL that receives answer logs. Empty = logging off.
- `LOG_MODE` – `"all"` logs every step; `"email_only"` logs only when a user leaves an email.

Packages, prices and scoring weights are prototype assumptions (`PK` and `compute()` in `index.html`), not confirmed pricing.

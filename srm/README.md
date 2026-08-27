# SRM Portal Scraper

This is a local, allowlisted Playwright flow for data you are authorized to access.

## Privacy behavior

- The official SRM portal handles login and CAPTCHA in a visible browser window.
- The script never fills, reads, stores, or prints credentials or CAPTCHA values.
- Each run uses a temporary browser context; cookies are discarded when it exits.
- Only URLs listed in `src/config.ts` are visited after login.
- Results are written to the local `output/` directory.

## Setup

Requires Node.js 20 or newer.

```bash
npm install
npx playwright install chromium
```

If you want the Python login bot, also install:

```bash
py -3 -m pip install -r python/requirements.txt
py -3 -m playwright install chromium
```

## Discover permitted tabs

```bash
npm run discover
```

The browser opens the official login page. Enter the credentials and solve the CAPTCHA directly in that page, then click **Login**. The script detects the successful navigation automatically. Candidate same-origin links are saved to `output/discovered-tabs.json`.

Review that file and copy only the pages you are authorized to collect into `src/config.ts` as `ALLOWED_TABS` entries.

## Scrape one page

To choose a page interactively from links visible after login:

```bash
npm run choose
```

To provide one exact portal path or URL:

```bash
npm start -- --page "/path/from-the-portal"
```

Only `https://sp.srmist.edu.in` URLs are accepted. The selected page is saved as one JSON file.

## Scrape the allowlist

```bash
npm start
```

The scraper visits each configured page and saves visible tables and page text as JSON. It stops if a configured URL leaves the SRM portal origin or if the session is no longer logged in.

## Python login bot

To log in with human-like typing and save a fresh session:

```bash
py -3 python/srm_attendance_bot.py login
```

To log in and immediately scrape attendance:

```bash
py -3 python/srm_attendance_bot.py attendance
```

Do not commit the `output/` directory if it contains personal student data.

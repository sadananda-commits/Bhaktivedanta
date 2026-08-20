# Vedanta Learning Portal

A Next.js-based student learning portal with Google Sheets as the content backend.

## Quick Start

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Setup

Copy `.env.example` to `.env.local` and fill in:

| Variable | Description |
|---|---|
| `GOOGLE_SPREADSHEET_ID` | Main data sheet ID (students, attendance, schedule) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account JSON (single line) |
| `SHEETDB_URL` | SheetDB endpoint for enrolment |
| `SHEETDB_CMS_URL` | SheetDB endpoint for CMS data |

## How Questions Load

Questions are loaded dynamically from Google Sheets via a two-level lookup:

```
Master Config Sheet (MASTER_SHEET_ID in portal-config.js)
  ├── "Assignment Subjects" tab  →  subject cards shown on portal
  └── "Subject Sheet Map" tab    →  Subject name  →  Sheet ID

Each Subject Sheet
  ├── "Learning Modules" tab     →  chapters / topics
  └── "Learning Steps" tab       →  questions
```

**If you see old/fallback data:** visit `/api/debug-sheets` in your browser to diagnose exactly which sheets are accessible and why questions may not be loading.

## Adding a New Subject

1. Create a new Google Sheet for the subject.
2. Add tabs named exactly **`Learning Modules`** and **`Learning Steps`**.
3. Share the sheet as **Anyone with the link → Viewer**.
4. Open the Master Config Sheet and add a row to **`Subject Sheet Map`** with the subject name and Sheet ID.
5. Add a row to **`Assignment Subjects`** with display details.
6. Refresh the portal — the subject appears immediately.

## Git Setup

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-org/vedanta-learning-portal.git
git push -u origin main
```

`node_modules/` and `.next/` are in `.gitignore` and will **not** be committed.
After cloning, run `npm install` to restore dependencies.

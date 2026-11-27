# Bhaktivedanta Quiz — Project README (for humans and AI assistants)

Live site: https://bhaktivedanta.vercel.app/ · Stack: **Next.js (pages router) on Vercel + Firebase Firestore (firebase-admin, server-side only)**. No participant login: people join with a quiz code and a typed name.

This file summarises the whole quiz development so a new maintainer (or AI) can continue safely. Items marked *(not reviewed)* were never shared, so do not assume their contents.

---

## 1. What the app does

- **Online quizzes** identified by a code in the URL: `/quiz/DAY20`, `/quiz/PHRASE3`, etc. (the page upper-cases the code).
- Two play modes:
  - **Live** — a host runs the quiz from `/quiz-host/{code}` (gated by a per-quiz *host code*, re-checked server-side on every host action).
  - **Self-paced ("solo")** — each person answers at their own speed, 30 s per question (limit comes from each question), unlimited retakes.
- **Leaderboards**: per quiz (live + self-paced sections) and a cross-quiz one (`/api/quiz-leaderboard`).
- Explanations appear after answering; completion screen has score, review, retry and navigation to other quizzes.

## 2. File map

| Path | Role |
|---|---|
| `pages/api/quiz.js` | **The whole quiz backend.** One POST endpoint; body `{ action, ... }`; actions are registered in an `ACTIONS` map. |
| `pages/api/quiz-leaderboard.js` | Cross-quiz leaderboard. Raw data cached in Firestore doc `system/quizLeaderboardCache` (10 min). Already de-duplicates best attempt per name. Unchanged by this work. |
| `pages/quiz/[code].js` | Public join page → `<OnlineQuizParticipant quizCode=…/>`. |
| `pages/quiz-host/[code].js` | Host panel page (host-code gate). |
| `pages/quiz/today.js` | **Permanent link** `/quiz/today` → redirects to today's `DAYnn`. |
| `pages/quiz/phrase.js` | **Permanent link** `/quiz/phrase` → redirects to today's `Phrase N`. |
| `pages/quiz.js` | Unrelated guest chapter-quiz page (portal). Do not confuse with `pages/api/quiz.js`. |
| `components/OnlineQuizParticipant.js` | Participant UI: join, lobby, live play, solo play, completion, retry. |
| `components/OnlineQuizHost.js` | Host UI (reveal screen uses `ExplanationTable`). |
| `components/SoloCompletion.js` | End-of-quiz screen (congrats, %, message, retry, review, day lists). |
| `components/ExplanationTable.js` | Parses explanation text into a table; `collapsible` prop. |
| `components/QuizBrand.js` | Logo (`LogoMark`, `BhaktivedantaLogo`) + `BrandStyles` (watermark). |
| `components/PreviousDays.js`, `components/UntriedDays.js` | Day/phrase chip grid; "not yet tried" drop-down. Both take `series` (`'day'` or `'phrase'`). |
| `lib/quizApi.js`, `lib/quizTheme.js`, `lib/quizSounds.js`, `lib/firebaseAdmin.js`, `components/QuizPlayer.js`, `components/QuizQuestionManager.js` | Used but *(not reviewed)*. `quizApi` passes API JSON through (extra response fields reach the client). |

## 3. Firestore data model (as observed)

- `quizzes/{quizId}` — `title`, `status` (e.g. `live`, `ended`), `currentQuestionIndex`, `currentQuestion` (with server-stamped `startedAt`, `timeLimitSec`), `totalQuestions`, `leaderboard` (frozen snapshot written by `endQuiz` for the **live** cohort only), `createdAt`.
  - `participants/{id}` — `name`, `nameLower` (added later; older docs lack it), `mode` (`solo`/live), `soloQuestionIndex`, `soloStartedAt`, running totals (`runningScore`, `runningCorrectCount`, `runningAnsweredCount`), `status`, `joinTime`.
  - `answers/{participantId_qNum}` — `selectedAnswer`, `isCorrect`, `pointsEarned`, `responseDurationMs`, `qNum`, `participantId`.
  - `questions/…` — `qNum`, `questionText`, `optionA–D`, `correctAnswer`, `explanation`, `timeLimitSec`.

## 4. Backend actions (`pages/api/quiz.js`)

Existing: `getQuizState`, `joinQuiz`, `submitAnswer`, `joinSoloQuiz`, `getSoloState`, `soloNextQuestion`, `submitSoloAnswer`, `getResults`, `endQuiz`, host actions.
Added in this work: `dailyQuiz`, `dailyPhrase`, `listQuizDays` (`series`), `getUnattemptedDays` (`name`, `series`).

Key rules:
- **Every solo join creates a new participant doc** — that is what makes retakes fresh attempts.
- **Solo leaderboard is recomputed on every read** (`computeSoloLeaderboard`) and now **keeps one row per name (case-insensitive): best score, ties → faster average response time.** Live leaderboard is the frozen snapshot.
- **Timers use server time.** `startedAt` is stamped by the server; responses carry `serverNow` so each device corrects for its own clock error.
- `submitSoloAnswer` is **idempotent**: a repeat submit returns the stored result (with `alreadyAnswered: true`) instead of an error. `getSoloState` returns `answered` when the current question already has an answer.
- `soloCompletionPayload` returns `summary` (`percentage`, correct/incorrect counts, `review` of wrong answers) + leaderboard.
- Day/phrase helpers: `todayInQuizTz()` uses env **`QUIZ_TIMEZONE`** (default `Europe/Copenhagen`); lists cached 5 min per instance.

## 5. Series and permanent links

- **DAY series**: code `DAY01…DAY31` = day of month. `/quiz/today` opens today's.
- **Phrase series**: titles/codes like `Phrase 1`, `PHRASE3`. **Day of the month picks the number** (the 25th → Phrase 25). Matching is by title (any case/spacing) or code prefix `PHRASE`. If today's number doesn't exist, a friendly page offers the latest available phrase quiz and the earlier ones.
- Lists never show future days and only include quizzes that exist with ≥1 question.
- Completion screen picks the series from the quiz's title/code (starts with "phrase" → phrase lists).

## 6. Change log (chronological)

1. Self-paced leaderboard keeps only each person's **best attempt per name**.
2. Fixed "already answered" dead end (idempotent submit + resume restores answered state).
3. **Root-cause fix for questions closing instantly as incorrect**: the device clock was ~40 s ahead of the server, so the 30 s window looked expired. Added `serverNow` + client `clockOffsetRef`.
4. Explanations → **table** (correct answer first, no horizontal scroll, stacked on phones), shown in a **collapsible drop-down below the Next button**; the answer screen shows only the correct answer.
5. **Branding**: lotus-over-open-book logo (inline SVG, no image files) and a faint full-page watermark on participant screens (host panel not yet branded).
6. **Completion screen**: personalised congratulations, percentage ring, incorrect-answer count with score-adaptive encouragement, **Retry Quiz** (same quiz code, fresh attempt, name/age reused), review of wrong answers.
7. **Permanent links** `/quiz/today` and `/quiz/phrase`, **Explore Previous Days' Quizzes**, and **days you haven't tried yet** (matched by name; a day leaves the list once joined).

## 7. Where files go / deploy

`quiz.js` → `pages/api/quiz.js` · `today.js`, `phrase.js` → `pages/quiz/` · all `*.js` components → `components/`. Commit + push; Vercel redeploys. Optional env var: `QUIZ_TIMEZONE`.

## 8. Known caveats and open items

- **Nothing here was run against live Firestore data**; changes were syntax-checked and the UI pieces smoke-rendered with sample data. Test: finish a quiz (score, retry stays on same day), `/quiz/today`, `/quiz/phrase`, previous/untried lists.
- "Attempted" = any join (live or solo), matched by typed name. Old participant docs lack `nameLower`, so they match only common spellings (as typed, lower, UPPER, Title Case).
- With day-of-month mapping, `/quiz/phrase` opens a quiz only when `Phrase {today's date}` exists (Phrase 1–3 cover only the 1st–3rd). A rotation mode was offered but not chosen.
- `DAYnn` codes repeat each month; a leftover quiz from a prior month with the same code will appear as an earlier day.
- Read budget matters (a past "30K reads" incident): completion adds ~50 reads; untried-days up to ~60 reads per open; avoid unbounded collection-group scans.
- Host panel has no logo/watermark yet.

## 9. Related but separate: Reading Club page

A Google Sheet + Apps Script page (`index.html`, `Code.gs`) lists Danish newspaper articles and links to these quizzes. It gained a "Previous quiz" drop-down (DAY01…yesterday, opens `/quiz/DAYnn`) and an attendance poll (new `Checkins` tab; check-in/out with browser-supplied local date/time). Its "Open today's quiz" button still computes the day in the browser; it could point to `/quiz/today` instead.

## 10. Rules for anyone (or any AI) continuing this work

- Preserve existing leaderboard logic, scoring and data; prefer additive changes.
- Keep server-side time authoritative; never rely on device clocks.
- After editing, run `node --check` (API) and a JSX build (e.g. esbuild) on components.
- Name the file path for every deliverable, and deploy dependent files together.

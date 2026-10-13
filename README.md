# StudyAI – AI Personalized Learning & Study Planner

MERN foundation with JWT auth, health checks, configurable AI provider, Multer uploads, and Tailwind design system. JavaScript only. No Spring Boot, no SQL.

## Project structure

```
yash/
  client/                  # React + Vite + Tailwind frontend
    src/
      api/                 # axios instance + auth/health API calls
        client.js          # baseURL from VITE_API_URL, attaches JWT
        auth.js
      components/          # reusable UI: Navbar, Loading, Empty, ErrorState, ProtectedRoute
      pages/               # routed pages: Home, Login, Register, Dashboard, NotFound
      hooks/               # useHealth – demo of loading/error/success states
      context/             # AuthContext – session restore, login/logout
      App.jsx              # BrowserRouter + route guards
      main.jsx             # React entry, providers
      index.css            # Tailwind + .card/.btn/.input design tokens
    vite.config.js         # dev proxy /api -> localhost:5000
    tailwind.config.js / postcss.config.js
    .env.example           # VITE_API_URL

  server/                  # Node + Express backend
    src/
      server.js            # entry: connect DB (non-fatal) + listen
      app.js               # createApp: helmet, cors, json, morgan, / + /api
      config/
        env.js             # centralized env parsing (PORT, MONGO_URI, JWT, AI_PROVIDER…)
        db.js              # mongoose.connect
      models/
        User.js            # name/email/password + bcrypt hook + comparePassword
        Notification.js    # in-app notifications (for later phases)
      routes/
        index.js           # mounts /health, /auth (planner/ai/notifs plug in here)
        health.routes.js   # GET /api/health
        auth.routes.js     # POST /auth/register|login, GET /auth/me
      controllers/         # thin HTTP layer -> services, ApiResponse
      services/
        auth.service.js    # register/login business logic + JWT signing
        ai.service.js      # generateText() with openai|gemini|mock switch
      middleware/
        auth.middleware.js # Bearer JWT -> req.user
        validate.middleware.js # express-validator -> ApiError 400
        error.middleware.js    # consistent {success:false} + 404
        upload.middleware.js   # Multer 5MB, pdf/png/jpg/txt/md only
      utils/
        ApiResponse.js     # {success:true,message,data}
        ApiError.js        # {success:false,message,errors}
        asyncHandler.js
    .env.example
    uploads/               # local upload dir (gitignored)
```

## Prerequisites

- Node.js 18+ (`node -v`), npm 9+
- MongoDB running locally (`mongod`) OR any `MONGO_URI`

## Setup & run (2 terminals)

Terminal 1 – backend:
```powershell
cd server
Copy-Item .env.example .env
npm install
npm run dev
# -> http://localhost:5000, health: http://localhost:5000/api/health
```

Terminal 2 – frontend:
```powershell
cd client
Copy-Item .env.example .env
npm install
npm run dev
# -> http://localhost:5173
```

Build check:
```powershell
cd client; npm run build
cd ../server; node src/server.js
```

## Deploy: frontend on Vercel, backend on Render

**Backend (Render)** — use `server/render.yaml` as a Blueprint, or create a Web Service manually:
- Build: `npm install` (root directory: `server`), Start: `node src/server.js`, Health check: `/api/health`.
- Required env vars: `NODE_ENV=production`, `PORT=10000`, `MONGO_URI` (MongoDB Atlas connection string), `JWT_SECRET` (long random string), `JWT_EXPIRES_IN=7d`, `CLIENT_URL=https://<your-app>.vercel.app` (must match the Vercel URL exactly, no trailing slash), `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`.
- Optional: `AI_PROVIDER` + key (`OPENAI_API_KEY` etc.), `ADMIN_EMAIL/ADMIN_PASSWORD` are NOT needed on Render — create the admin once via Render Shell: `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run seed:admin`.
- CORS allows only `CLIENT_URL`, and the auth cookie needs SameSite=None + Secure because Vercel and Render are different origins — the two `COOKIE_*` vars above are mandatory, otherwise login sessions silently fail in production.
- Uploads live on Render's ephemeral disk (wiped on redeploy/restart). For durable files, attach a Render Disk or move to S3/R2.

**Frontend (Vercel)** — import the repo, set root directory to `client` (build `npm run build`, output `dist`; `client/vercel.json` also covers SPA rewrites). Set env var `VITE_API_URL=https://<your-render-service>.onrender.com/api`, then redeploy. After deploying, copy the real Vercel URL back into the backend's `CLIENT_URL` and redeploy the backend.


## API contract

Success: `{ "success": true, "message": "...", "data": {...} }`
Error: `{ "success": false, "message": "...", "errors": [{field,message}] }`

| Method | Endpoint | Auth | Body |
|---|---|---|---|
| GET | `/` | no | — |
| GET | `/api/health` | no | — |
| POST | `/api/auth/register` | no | `{name,email,password}` |
| POST | `/api/auth/login` | no | `{email,password}` |
| GET | `/api/auth/me` | Bearer JWT | — |

## Env vars (server/.env)

`PORT=5000`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN=7d`, `CLIENT_URL=http://localhost:5173`, `AI_PROVIDER=mock|openai|gemini|ollama`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `OLLAMA_URL`, `OLLAMA_MODEL`.

Client (`client/.env`): `VITE_API_URL=http://localhost:5000/api`.

## AI provider configuration (backend-only keys)

`AI_PROVIDER=mock` (default) keeps everything offline: planner uses the labeled rule-based engine, tutor returns flagged fallback guidance, AI drafting/insights return honest 503. For live AI, set `AI_PROVIDER=openai` (or `gemini`) plus `OPENAI_API_KEY` (never commit, never log — keys travel only in server-side `Authorization` headers). For **free local AI with no key**, install Ollama from https://ollama.com, run `ollama pull llama3.1` once, keep `ollama serve` running, then set `AI_PROVIDER=ollama` (optional `OLLAMA_URL`, `OLLAMA_MODEL`) — tutor (streaming included), planner, drafting and insights then use the local model; the admin AI monitor shows Ollama reachability and whether the model is pulled. The server warns at boot if `NODE_ENV=production` still uses `mock`. Live-provider verification is NOT done in this repo (no credentials configured); `server/tests/ai.test.js` covers provider selection, timeouts, HTTP errors, Ollama NDJSON streaming, and key handling with mocked network responses.

## Tests

`cd server && npm test` — 67 tests (`tests/unit.test.js`, `tests/ai.test.js`, `tests/api.test.js`, `tests/admin.test.js`) on isolated `studyai_test*` databases that are dropped before and after. No test packages required (built-in `node:test`).

## Design system

Tailwind utilities + `.card`, `.btn-primary`, `.btn-ghost`, `.input`, `.label` in `index.css`. States: `Loading`, `Empty`, `ErrorState` components + `useHealth` demo. Responsive: `max-w-6xl`, `grid sm:grid-cols-2/3`.

## Learning setup module (`/api/learning`, student-only)

Profiles (`academicLevel, subjects, learningStyle, examType[college|gate|cat|upsc|competitive|other], dailyStudyHours`), goals with future target dates, subjects (unique per student), topics (`not-started|in-progress|completed`, `easy|medium|hard`, confidence 1-5, manual/bulk/upload), syllabus upload (PDF/TXT/MD ≤10 MB, server-side text extraction, .exe rejected), diagnostic assessments with level (`beginner|intermediate|advanced`), and `GET /learning/checklist` (5 steps + pct + next action). All queries scoped to the JWT user — students see only their own data. Wizard: `client/src/pages/SetupWizard.jsx` (`/setup`), checklist card on the student dashboard.

Admin seeding: `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run seed:admin` (CLI only, never public).

Demo data (dev only, idempotent — refuses production unless `ALLOW_DEMO_SEED=true`): `npm run seed:demo` creates demo student + educator (`demo.student@studyai.local` / `demo.educator@studyai.local`, password `Demo1234!`), subjects, topics, goal, an approved resource, a published 3-question quiz, and a welcome notification. Delete demo accounts before any real deployment.

Super admin bootstrap: `SUPER_ADMIN_EMAIL=… SUPER_ADMIN_PASSWORD=(12+ chars) npm run seed:superadmin` (CLI only, never public, never in frontend). Re-running never demotes or locks out existing super admins; add `SUPER_ADMIN_RESET_PASSWORD=true` to rotate the password explicitly. Sign in at `/login`, land on the admin console (`/dashboard/admin`), change the password via Profile. Hierarchy: super_admin ⊃ admin — ordinary admins cannot grant/revoke admin roles, suspend or delete privileged accounts, or touch the last super admin (enforced in middleware + services, audited).

## AI study-plan generator (`/api/plans`, student-only)

Inputs: exam date (future), target score, subject selection, daily/weekly hours (weekly ≤ 7×daily enforced), topic difficulty/confidence, diagnostics, completed/pending topics, learning style. Generation: `POST /plans/generate` tries the LLM (`generateJSON`, keys server-side only, 2 attempts, strict schema + per-day budget validation) then deterministic rule-based fallback (weak/unfinished topics first, learn/revision/weekly practice-test/break mix, never over-allocates a day). One active plan per student (409 otherwise; `force:true` or `POST /plans/:id/regenerate` archives → version history in `GET /plans`). Tasks: filter by subject/status/date range, edit, complete/skip, reschedule (past/exam/over-budget rejected), delete; every mutation recalculates counters. `GET /plans/:id/summary` → overall %, today %, upcoming (10), overdue. Generation capped at 10/hour. UI: `/plans` (generator + history, 3 client retries) and `/plans/:id` (progress cards, 7-day calendar, filters, task actions).

## Learning resources & smart recommendations (`/api/resources`)

Educators submit file materials (PDF/TXT/MD/PNG/JPG ≤10 MB, local disk in dev via pluggable `storage.service`, `STORAGE_PROVIDER` for prod) or external video/article URLs (validated http(s), stored with `urlVerified:false` — never claimed verified). Categorized by subject, topic, difficulty, exam type, format. Workflow: educator submit → `pending` → admin approve/reject with note → students see only `approved`. Educators edit (re-enters review), archive/restore, delete own; admins manage all. Library: text search, subject/topic/difficulty/exam/format filters, newest/popular sort, pagination, bookmarks + completion tracking, view counts, auth-guarded file download (no path leaks). Explainable rule-based ranker (`rule-v1`: subject + weak-area + plan-topic + exam + difficulty-fit + learning-style + popularity, each with a "why" reason; records persisted in `Recommendation`). AI ranking can plug into `recommender.service.js` later. UI: `/studio` (educator), `/review` (admin), `/library` + `/library/:id` (browse / For-you / saved tabs), dashboard recommendation strip.

## AI tutor & doubt solver (`/api/tutor`, student-only)

Conversational tutor with per-student history (list/create/rename/delete, ownership-enforced, messages cascade). `POST /conversations/:id/messages` (blocking) and `.../messages/stream` (SSE: real provider tokens on OpenAI, chunked final text otherwise; answer validated + persisted before `done`). RAG: modular keyword retrieval (`retrieval.service.js`) over approved materials (title/topic/subject/description + indexed file text extracted at upload with lazy backfill) — honestly labeled keyword matching, vector DB only via documented `vectorRetrieve()` slot (`RETRIEVER=vector` falls back with disclosure). Sources shown only when actually retrieved; fallback guidance is flagged `fallback:true` and never fabricates citations. Hint-first mode (hints, not solutions), helpful/unhelpful votes, 50/hr rate limit, 60s server timeout (90s client), 2000-char input cap, per-request `AIUsage` ledger. UI: `/tutor` (sidebar chats, streaming bubbles + typing indicator, safe code/math formatting, source cards, votes, accessible labels). File text indexed at educator upload (`extractedText`, never sent to clients).

## Practice tests & assessments (`/api/assessments`)

Educators create tests/assignments (subject, topic, difficulty, duration 0–600 min, deadlines, max attempts, `immediate|after-deadline|manual|never` answer release) with MCQ, true/false, and short-answer questions. AI drafting (`POST /:id/draft`, optional source material) validates strictly and returns honest 503 when AI is unavailable — never fake questions; publishing is blocked until every AI draft is approved/rejected. Assign to selected students by email or open to all. Students get timed attempts (server `expiresAt`, resume after reload, 20s autosave), auto-graded MCQ/TF on submit, educator-graded short answers with feedback, and results gated by release settings (correct answers never leak early). Guards: attempt limits, duplicate-submit rejection, deadline + timer enforcement, per-student result privacy, release-gated explanations. Analytics: educator per-assessment (attempts, avg score/accuracy/time, per-topic and per-question accuracy) + student performance history. UI: `/educator/assessments` (create, questions, AI draft + review, assign, grading queue, analytics), `/assessments` (available, history, performance), take/resume/result pages with live countdown and question navigator.

## Progress analytics & adaptive learning (`/api/analytics`, student-only)

Aggregates computed live from the student's own records (MongoDB aggregations, batched lookups): study time from completed plan tasks by completion day (daily/weekly), task completion + documented adherence (completed ÷ completed+overdue), syllabus % by subject, score/accuracy trend, per-topic mastery (strong/developing/weak/needs-data with evidence counts, recent-vs-overall trend, repeated-mistake detection), diagnostics, plan history, revision counts. Rule-based adaptive engine (`rule-v1`): weak-topic recommendations each carrying observed reasons + evidence size, practice-assessment suggestions, one-click revision boost inserting 20-min sessions into the active plan within budget (14-day lookahead), and the personalization inputs used (correctable in Learning Setup). Optional AI insights endpoint returns honest 503 when the provider is mock/unavailable. Observed results and suggestions are strictly separated; no stored mastery claims, no invented numbers. UI: `/analytics` (lazy-loaded Recharts: daily/weekly bars, score lines, completion donut, syllabus bars, topics, adaptive cards) with empty states throughout.

## Educator & super-admin modules (`/api/educator`, `/api/admin`, `/api/notifications`, `/api/meta`)

Educators: teaching profile (bio, subjects with taxonomy datalist), overview stats, connected-students list (only students who attempted or were assigned their assessments) with per-student progress (weak/strong topics, attempts), class summaries (averages, topics needing support, per-assessment breakdown), and feedback notes delivered to the student inbox. Admin console (`/dashboard/admin`, sidebar: Overview, Users, Students, Educators, Roles, Subjects, Resources, Study plans, Quizzes, AI monitor, Notifications, Analytics, Taxonomy, Settings, Reports, Audit log, Security): real-DB platform stats; user search/filter/pagination with detail drawer (learning summary), create-user, one-time reset tokens, suspend/activate (suspended blocked at login and every request; self- and admin-targeting refused for ordinary admins) and audited role/delete; roles matrix; subject engagement + taxonomy; resource metadata edit/delete; plan metadata inspection (never edited); assessment results summaries (scores read-only); AI status without keys; announcements broadcast; notification stats; time-bounded platform analytics; health; allowlisted settings (`announcement`, `support.email`, `registration.enabled`, `plan.maxDays`, `plan.maxTasks` — secrets stay env-only) with effective planner limits surfaced; append-only audit log; content-report triage. Super admins inherit all admin rights plus exclusive grant/revoke/suspend/delete of privileged accounts, with last-super-admin protection. All permissions enforced in middleware + service logic; every destructive action has a confirmation dialog.

## Notifications & reminders (`/api/notifications`, `/api/meta`)

In-app inbox with read/unread states for feedback, announcements, and reminder delivery. Reminders: students create/view/edit/cancel/complete study-task, exam, and session reminders with UTC due dates, per-type preferences, and a 60s server scheduler that delivers due reminders exactly once (atomic claim), marks long-overdue items missed, and never duplicates. Push delivery is NOT configured (no VAPID/service-worker integration); the backend exposes an honest `501 push-not-configured` stub. UI: `/inbox` (notifications) and `/reminders` (CRUD + preferences) with loading/empty/error states.

## What is NOT built yet (next phases)

AI-based recommendation ranking (rule-v1 slot ready), vector retrieval (`RETRIEVER=vector` slot ready), Web Push delivery (VAPID keys + service worker + provider required — see `.env.example`).
"# SmartAI" 

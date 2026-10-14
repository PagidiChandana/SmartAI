# StudyAI — Manual Browser Test Checklist

Environment: `mongod` running. Terminal 1: `cd server && npm install && npm run dev` (http://localhost:5000).
Terminal 2: `cd client && npm install && npm run dev` (http://localhost:5173).
Seed admin: `cd server && ADMIN_EMAIL=admin@test.local ADMIN_PASSWORD=Admin123! npm run seed:admin`.
Create test accounts: one student, one educator (register UI), one admin (seeded).
Note: reset-password dev tokens and mock-AI fallbacks only appear when the server runs with default (non-production) env.

How to use: run each row in a real browser, fill Actual + Status (PASS/FAIL), attach console/network evidence for failures.
Statuses: PASS | FAIL | BLOCKED | NOT RUN. Severity for failures: Critical/High/Medium/Low.

## Auth (Register/Login/Profile)

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-01 | Open `/register`, submit empty form | Inline errors for name/email/password/role | | |
| M-02 | Register student `stu1@test.local` / `secret123` | Lands on dashboard; session cookie set; no token in localStorage (DevTools → Application) | | |
| M-03 | Register same email again | "Email already registered" error | | |
| M-04 | Register with role admin via DevTools-edited payload | 403 blocked | | |
| M-05 | Logout → visit `/dashboard/student` | Redirect to `/login` | | |
| M-06 | Login wrong password → error; correct → dashboard; refresh → still logged in | Session persists via cookie | | |
| M-07 | `/profile`: change name, change password (wrong current → error; right → success) | Updates persist after re-login | | |
| M-08 | Forgot password → dev token shown (dev only) → reset → login with new password; reuse token → error | Single-use enforced | | |
| M-09 | As student, open `/dashboard/admin` and `/educator/students` | Redirected away (role guard) | | |

## Setup wizard (`/setup`, student)

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-10 | Step Profile: save level/exam/style/hours/subjects; reload page | Values persist | | |
| M-11 | Step Subjects: add + delete a subject; duplicate name | Duplicate rejected | | |
| M-12 | Step Syllabus: manual add, bulk paste, TXT upload, `.exe` upload | First three create topics; `.exe` rejected with message | | |
| M-13 | Topic status/difficulty/confidence dropdowns | Persist after reload | | |
| M-14 | Step Goals: past target date → error; future date → saved; delete goal | Validation + CRUD | | |
| M-15 | Step Diagnostic: start, answer, submit | Score + level shown; checklist ticks | | |
| M-16 | Step Review: progress bar + next-action link jumps to correct step | Deep link works | | |

## Plans (`/plans`, `/plans/:id`)

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-17 | Generate plan (exam + hours, subjects preselected) | "rule-based" badge (mock env), tasks listed | | |
| M-18 | Generate again without force | Conflict message + archive-and-regenerate path | | |
| M-19 | Filters (subject/status/date), 7-day strip, complete/skip/edit/Tomorrow/delete task | List updates; counters recalc | | |
| M-20 | Regenerate → version history shows v1 archived + v2 active | History preserved | | |
| M-21 | Overdue section: move-to-today works | Task moves | | |

## Library (`/library`, `/library/:id`) + dashboard recs

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-22 | Browse tab: search, each filter, sort, pagination | Results narrow correctly; empty state on no match | | |
| M-23 | For-you tab: reasons reference your topics | Personalized reasons, not generic | | |
| M-24 | Saved tab: bookmark then unbookmark | Appears/disappears | | |
| M-25 | Detail: download file works; external link shows unverified warning; complete toggle | Download 200; disclaimer visible | | |
| M-26 | Report box: submit + duplicate | Second submit rejected as duplicate | | |

## Tutor (`/tutor`)

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-27 | New chat, ask question → streams answer with sources (if library match) or fallback banner | No fabricated citations | | |
| M-28 | Follow-up question uses context; toggle stream off → blocking answer | Both modes work | | |
| M-29 | Hint-first toggle → hints not full solution | Hints only | | |
| M-30 | Rename/delete chat; vote helpful/unhelpful; reload → history intact | CRUD + persistence | | |
| M-31 | Empty submit blocked; 2001-char input rejected | Client+server validation | | |

## Tests (`/assessments`, take, result) — educator + student

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-32 | Educator: create test + 3 question types; publish with zero questions → blocked | Validation | | |
| M-33 | Educator: AI draft on mock → honest 503 (no fake questions) | 503 message | | |
| M-34 | Student: start → countdown ticks → reload → timer continues → autosave → submit | Score graded; resume works | | |
| M-35 | Let timer expire | Exactly one auto-submit; no error spam | | |
| M-36 | Result: answers hidden when `after-deadline` + future deadline; visible when immediate | Release gating | | |
| M-37 | Educator: grade short answer with feedback; analytics tab numbers match attempts | Grading + analytics | | |
| M-38 | Second submit → rejected; attempt beyond max → blocked | Guards | | |

## Analytics (`/analytics`)

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-39 | Overview charts reflect your real tasks/scores; fresh account → empty states, no console errors | Real data; graceful empty | | |
| M-40 | Topics tab statuses match evidence; weak topic +Revise adds sessions | Boost works | | |
| M-41 | Adaptive tab reasons cite evidence; profile-used card links to setup | Explainability | | |
| M-42 | AI insights on mock → honest unavailable message | No fake AI | | |

## Notifications + reminders (`/inbox`, `/reminders`)

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-43 | Create reminder (future) → appears scheduled; past date → rejected | Validation | | |
| M-44 | Edit, cancel, complete, delete reminder | Status transitions; list updates | | |
| M-45 | Toggle a type off in preferences → due item cancelled, never delivered | Prefs respected | | |
| M-46 | Wait past due time (~60s tick) → notification appears in inbox unread; no duplicates on later ticks | Exactly-once delivery | | |
| M-47 | Mark read / mark all read; unread badge clears | Read states | | |

## Educator (`/dashboard/educator`, `/educator/*`, `/studio`)

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-48 | Edit bio + teaching subjects (taxonomy suggestions) | Persists | | |
| M-49 | Students list shows only your students; open detail → weak topics + attempts | Scoped data | | |
| M-50 | Send feedback note → appears in student inbox | Delivery | | |
| M-51 | Class page averages match attempts; upload material → pending (student can't see) | Correctness | | |

## Admin (`/dashboard/admin`, `/review`)

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-52 | Overview counts match DB (spot-check users/resources) | Real numbers | | |
| M-53 | Users: search, role filter, paginate; suspend student → their login fails → reactivate works | Guards + recovery | | |
| M-54 | Self-suspend refused; role change + delete write audit log entries | Safeguards + audit | | |
| M-55 | Approve resource → student sees it; reject → hidden with note | Review flow | | |
| M-56 | Report triage: resolve + archive → material hidden | Enforcement | | |
| M-57 | Taxonomy add/disable/delete; setting save; usage + errors visible | Management | | |

## Super Admin (`/dashboard/admin` as super_admin; seed via `npm run seed:superadmin`)

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-63 | Seed: `SUPER_ADMIN_EMAIL=… SUPER_ADMIN_PASSWORD=(12+ chars) npm run seed:superadmin`; re-run without reset flag | Created first time; second run reports "password unchanged", no lockout | | |
| M-64 | Seed with 8-char password | Refused with 12-char minimum error | | |
| M-65 | Login as super admin → sidebar shows all 17 sections; ★ badge in header | Full console visible | | |
| M-66 | Users tab: create admin + super_admin accounts; detail drawer shows learning summary; issue reset token → use once → login works; second use fails | CRUD + one-time token | | |
| M-67 | As ordinary admin: role dropdown hides super_admin; suspend/delete/role-change on an admin shows disabled with explanation; direct API call returns 403 | No escalation path | | |
| M-68 | As super admin: grant admin to a student; suspend that admin; their login fails; reactivate works | Hierarchy enforced | | |
| M-69 | Attempt self-demote / self-suspend / self-delete | All refused with clear messages | | |
| M-70 | Roles tab matrix matches backend enforcement spot-checks (e.g. student POST /api/admin/stats → 403) | Matrix truthful | | |
| M-71 | Subjects tab engagement numbers; taxonomy add/disable; Settings tab plan limits update → regenerate a plan still respects budgets | Config effective | | |
| M-72 | Resources tab: edit metadata (audited), delete with confirm; Plans tab: inspect metadata (no edit affordance); Quizzes tab: view result rows (no score editing) | Read-only boundaries | | |
| M-73 | AI tab: provider/misconfiguration warnings, no keys visible (DevTools Network) | No secret leak | | |
| M-74 | Notifications tab: broadcast to students → student inbox receives; stats update | Delivery | | |
| M-75 | Analytics tab: 7/14/30/90-day ranges change charts; Security tab documents bootstrap/recovery | Ranges work | | |
| M-76 | Audit log shows entries for M-66/M-68/M-71/M-74 actions with actor email | Audit trail | | |
| M-77 | Mobile 390px: sidebar collapses to ☰ menu; tables scroll horizontally | Responsive | | |

## Cross-cutting

| ID | Steps | Expected | Actual | Status |
|----|-------|----------|--------|--------|
| M-58 | 390px / 768px / 1440px widths on dashboard, take-test, tutor | No overlap; nav collapses acceptably | | |
| M-59 | Keyboard-only: tab through login, take-test answers, tutor input; buttons focusable | Operable; visible focus | | |
| M-60 | DevTools Console on every page above | Zero errors (record any) | | |
| M-61 | DevTools Network: no token in bodies, no 500s during happy paths | Clean traffic | | |
| M-62 | Stop `mongod`, reload app | Health stays up; API calls fail gracefully with messages (no blank crash) | | |

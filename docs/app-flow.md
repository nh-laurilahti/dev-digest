# App-flow (with Signup, Slack & Email)

## 1) Happy path
1) **Signup → Preferences**: user chooses delivery channels (Slack/Email/Web), frequency (none/daily/weekly), repos, detail level.
2) **Create digest**: user submits form on Dashboard → `POST /api/v1/digests` → `{job_id}` (202 Accepted).
3) **Poll job**: client `GET /api/v1/jobs/{job_id}` until `COMPLETED` → `digest_id`.
4) **View**: client opens `/digests/{digest_id}` (server page) or fetches JSON.

## 2) Slack installation
- Admin clicks **Add to Slack** → `/slack/install` → Slack OAuth → `/slack/oauth_redirect` stores bot token and team.
- User links Slack identity (by email match or manual selection).
- Test send: admin calls `POST /api/v1/notifications/slack/test` to DM a sample digest.

## 3) Email setup
- Admin configures SMTP creds via `.env`. From-address & branding set in DB settings.
- Test send: `POST /api/v1/notifications/email/test`.

## 4) Scheduling (v1.1+)
- A cron/apscheduler job reads `Preference` rows and enqueues daily/weekly jobs per user; deliveries honor the user’s repos and detail level.

## 5) Endpoints & payloads
- **Signup/Preferences**
  - `GET /api/v1/users/me`
  - `GET /api/v1/preferences` → current prefs
  - `PUT /api/v1/preferences` → `{ frequency, time_of_day, repos:[], detail, channels:{slack,email,web}, slack_user_id?, email? }`
- **Digests/Jobs**
  - `POST /api/v1/digests` → `{ job_id }`
  - `GET /api/v1/jobs/{job_id}` → `{ status, message?, digest_id? }`
  - `GET /api/v1/digests/{id}` → `{ id, repo, html, stats }`
  - `GET /api/v1/digests?limit=20&repo=owner/repo`
- **Repos**
  - `GET /api/v1/repos`, `POST /api/v1/repos`, `PATCH /api/v1/repos/{id}`
- **Settings**
  - `GET /api/v1/settings`, `PATCH /api/v1/settings` (non‑secret settings in DB)
  - **Secrets** (GitHub, OpenAI, Slack, SMTP) are taken strictly from `.env`

## 6) Errors
- 400 validation (field-specific messages)
- 401/403 for auth/permission failures (role checks)
- 502 for upstream API failures (Slack/GitHub/SMTP), with redacted error message.

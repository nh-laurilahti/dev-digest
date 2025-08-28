# Product Requirements Document (PRD) — Daily Dev Digest (Simplified, with Roles & Notifications)

## 1) What we’re building (single purpose)
A tiny web app that pulls recent GitHub PRs for one or more repositories and produces a human‑readable digest (HTML/Markdown) with links and quick stats. Users can receive digests on the web, via Slack, and via email.

## 2) Scope trims (why this is simpler)
- **Keep**: On-demand digests, archive, minimal repo management, minimal settings, Slack/email delivery.
- **Cut**: multi‑audience templates, complex settings endpoints, custom rate‑limiter, DI container.
- **Replace**: In‑memory progress → **Jobs table** in the DB (persists across restarts).

## 3) Users, Signup & Custom Roles
### 3.1 Personas
- **Manager**: wants a fast overview of what shipped and what’s risky.
- **Developer**: wants to scan changes and click through quickly.
- **Admin**: configures repos, tokens, and default preferences.

### 3.2 Signup & onboarding
On the first visit (or invite link), a short signup asks:
- Preferred delivery: **Slack DM**, **Email**, **Web only** (can choose multiple).
- Frequency: **on‑demand only**, **daily**, **weekly** (time-of-day if scheduled).
- Repositories to include (from tracked repos).
- Level of detail: **concise** or **detailed** (affects summary length).
These preferences are stored in `NotificationPreference` and can be edited any time.

### 3.3 Roles (RBAC with custom roles)
- **Built‑in roles**
  - **Admin**: manage repos/tokens/settings, invite users, manage roles, view all digests.
  - **Maintainer**: trigger digests, manage repos list, view archive.
  - **Viewer**: view archive, subscribe/unsubscribe to notifications.
- **Custom roles** (Admin-defined): An Admin can define a role by toggling permissions:
  - `manage_settings`, `manage_repos`, `trigger_digests`, `view_all_digests`, `manage_notifications`.
  - Users can be assigned multiple roles; effective permission is union.
- Access checks are enforced in the API middleware (decorator) and in UI (hide unauthorized actions).

## 4) Integrations
### 4.1 GitHub
- Uses **PyGithub** with **`GITHUB_TOKEN`** from `.env`.
- Pull requests fetched by date window; basic metadata extracted for summaries and stats.

### 4.2 Slack bot (installation)
- One‑workspace support for v1.
- Admin clicks **“Add to Slack”** which starts OAuth:
  - App URLs: `/slack/install` → redirects to Slack; `/slack/oauth_redirect` to handle code exchange.
  - Store: `team_id`, `bot_user_id`, **bot token** in DB (token loaded from `.env` for single‑workspace v1 if preferred; DB used for rotation).
  - **Required scopes** (minimal): `chat:write`, `users:read.email` (if mapping by email), `commands` *(optional if using slash commands)*.
- Delivery:
  - Users can subscribe to **DM** delivery (we map app user ↔ slack user via email or selector).
  - Admins can configure **channel posts** (e.g., `#dev-digest`) for scheduled digests.
- Endpoints:
  - `POST /api/v1/notifications/slack/test` (admin) — send a test message to a user/channel.
  - Optional slash command `/digest` that triggers on-demand digests.

### 4.3 Email notifications (installation)
- Support **SMTP** (host, port, username, password) **or** **SendGrid API**.
- In v1, keep it simple: **use SMTP** via `.env` secrets; from-address configurable in settings.
- Delivery options at signup: **daily/weekly** schedule, **on‑demand CC**.
- Endpoints:
  - `POST /api/v1/notifications/email/test` (admin) — send a test email.
- Each delivery records an entry in `NotificationLog` with status for observability.

## 5) Functional requirements (minimal)
- **Create digest**: `POST /api/v1/digests` → returns `job_id`.
- **Check job**: `GET /api/v1/jobs/{job_id}` → `PENDING|RUNNING|FAILED|COMPLETED` and `digest_id` when done.
- **Read digest**: `GET /api/v1/digests/{digest_id}` → JSON with HTML/markdown + stats.
- **List digests**: `GET /api/v1/digests?limit=20&repo=owner/repo`.
- **Repos**: `GET /api/v1/repos`, `POST /api/v1/repos`, `PATCH /api/v1/repos/{id}`.
- **Settings**: 
  - **API keys & secrets** (GitHub, OpenAI, Slack bot token/signing secret, SMTP creds) **come from `.env` only**.
  - Other non‑secret settings (defaults, feature flags) are stored in DB and mutated via `GET/PATCH /api/v1/settings`.
- **Users & Roles**: 
  - `GET /api/v1/users/me` (profile & effective permissions).
  - `GET/POST/PATCH /api/v1/roles` (admin only).
  - `PATCH /api/v1/users/{id}/roles` (admin only).
- **Notifications**:
  - `GET/PUT /api/v1/preferences` — per‑user notification preferences (repos, channels, frequency, detail level).

## 6) Non‑functional requirements
- **Simplicity**: three-code-layer structure; no DI container.
- **Resilience**: jobs persisted in DB; safe restarts; retries on Slack/email sends.
- **Performance**: ≤ 30s for ~100 PRs (bounded by GitHub).
- **Security**: All API keys in `.env` (never stored in DB/UI). Rate limiting via Flask‑Limiter if needed.
- **Privacy**: store only summary text and metadata; do not store raw source code.
- **Observability**: structured logs; job & delivery logs with durations and status codes.

## 7) Data model (lean + roles & notifications)
- **Repo**: `id, path (owner/name) UNIQUE, name, active, created_at, updated_at`
- **Digest**: `id, repo_id, date_range, summary_md, html, stats_json, created_at`
- **Job**: `id, type ('digest'), repo_id, params_json, status, started_at, finished_at, error, digest_id`
- **User**: `id, email, name, created_at, last_login_at`
- **Role**: `id, name UNIQUE, permissions_json`
- **UserRole**: `user_id, role_id` (composite PK)
- **Preference**: `user_id, frequency ('none'|'daily'|'weekly'), time_of_day, repos_json, detail ('concise'|'detailed'), channels_json ('web'|'slack'|'email'), slack_user_id?, email?`
- **SlackInstall**: `team_id, bot_user_id, bot_token (optional if from env)`
- **NotificationLog**: `id, user_id?, channel ('slack'|'email'), target, template, status, error, created_at`

## 8) Rollout
- v1: on‑demand digests, Slack DM + email test sends, per‑user preferences, RBAC (built‑in roles).
- v1.1: scheduled digests (daily/weekly), channel posts, OpenAI summaries toggle.
- v1.2: custom roles UI, slash command `/digest`, per‑repo filters per user.

## 9) Success metrics
- Digest job success rate and median runtime.
- Slack/email delivery success rate.
- Weekly active viewers + subscribers (DM + email).

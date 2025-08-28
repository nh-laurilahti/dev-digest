# Tech-stack (No Docker, Secrets in .env)

## Backend
- **Express.js** with **TypeScript** (routes + API endpoints)
- **Prisma** (DB), SQLite by default (switchable to Postgres via `DATABASE_URL`)
- **@octokit/rest** (GitHub API)
- **zod** (validation & config)
- **express-rate-limit** (rate limiting)
- **optional**: `openai` (summaries behind DB flag)

## Frontend
- **React** + **TypeScript** + **Vite** for modern SPA
- **HTMX** alternative: React Query for server state management
- Modern build toolchain with Vite, no Docker.

## Configuration
**All API keys/secrets are loaded exclusively from `.env`** (not stored in DB):
```
# REQUIRED
GITHUB_TOKEN=...
JWT_SECRET=...
NODE_ENV=development

# OPTIONAL
OPENAI_API_KEY=...

# Slack (if used)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...

# Email (SMTP)
SMTP_HOST=...
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
SMTP_USE_TLS=true

# Database
DATABASE_URL=sqlite:///devdigest.db
```

**Non-secret settings** (defaults, feature flags, branding, from-address, default timespan, AI enabled, etc.) live in the DB and are mutated via `PATCH /api/v1/settings`.

## Running (local)
```
bun install
cp .env.example .env  # then fill in secrets
bun run dev
```
No Docker required. Use `bun run dev` for hot reloading during development.

## Testing
- `vitest` for unit/integration tests; use a temp SQLite DB.
- `playwright` for e2e testing.

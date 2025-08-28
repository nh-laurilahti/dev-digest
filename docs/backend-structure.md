# Backend-structure (Lean)

## 1) Keep it to three layers
- **routes/**: Express.js routes + request/response validation with Zod schemas.
- **services/**: business logic (create_digest, list_digests, manage_repo) — thin, testable functions.
- **data/**: Prisma models and simple repository helpers (no CQRS/hexagonal overhead).

## 2) Kill the over-engineering
- ❌ Full DI container → **Use ES6 modules + function composition**.
- ❌ In‑memory status tracker → **Jobs table** (persistent).
- ❌ Custom rate limiter → **express-rate-limit** (off-the-shelf).
- ❌ Settings per‑key endpoints → **single PATCH /settings**.
- ❌ Audience modes & template variants → **one template**, write summaries generically.

## 3) Data
**Prisma models (schema.prisma):**
```prisma
model Repo {
  id       Int    @id @default(autoincrement())
  path     String @unique
  name     String
  // ... other fields
}

model Digest {
  id       Int    @id @default(autoincrement())
  repoId   Int
  repo     Repo   @relation(fields: [repoId], references: [id])
  // ... other fields
}

model Job {
  id       String @id @default(cuid())
  type     String
  status   String
  // ... other fields
}

model Setting {
  key        String @id
  valueJson  String
}
```
Use SQLite by default; add Postgres URL when/if needed. Use `prisma db push` for development; add migrations later if schema churns.

## 4) Services (examples)
- `createDigest(repository, timespan, days)` → returns `job_id`
- `runDigestJob(job_id)` → fetch PRs (@octokit/rest), build stats, create HTML, save `Digest`, update `Job`
- `listDigests(repo?: string, limit: number)`
- `addRepo(path, name)` / `patchRepo(id, updates)`
- `getSettings()` / `patchSettings(updates: Record<string, any>)`

## 5) GitHub & optional AI
- Wrap @octokit/rest in a tiny helper `clients/github.ts` with typed functions:
  - `fetchPRs(path, since, until): Promise<PR[]>`
- AI summarization is **optional**. Provide interface `summarizePRs(prs): Promise<string[]>` that defaults to rule‑based summaries; only call OpenAI if `ai_enabled` is true.

## 6) Logging
- Use `pino` logger with structured JSON logging and request ID middleware.

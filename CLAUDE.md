# CLAUDE.md - Coding Assistant Guide

# Development Guidelines

## Philosophy

### Core Beliefs

- **Incremental progress over big bangs** - Small changes that compile and pass tests
- **Learning from existing code** - Study and plan before implementing
- **Pragmatic over dogmatic** - Adapt to project reality
- **Clear intent over clever code** - Be boring and obvious
- **Read and update documentation** - Always check the documentation at [docs/](docs/) and keep them updated
- **Journal your findings** - Read and update your [JOURNAL.MD](docs/JOURNAL.md), if you stay stuck or notice something that you thing you should remember, place it there

### Simplicity Means

- Single responsibility per function/class
- Avoid premature abstractions
- No clever tricks - choose the boring solution
- If you need to explain it, it's too complex

## Technical Standards

### Architecture Principles

- **Composition over inheritance** - Use dependency injection
- **Interfaces over singletons** - Enable testing and flexibility
- **Explicit over implicit** - Clear data flow and dependencies
- **Test-driven when possible** - Never disable tests, fix them

### Error Handling

- Fail fast with descriptive messages
- Include context for debugging
- Handle errors at appropriate level
- Never silently swallow exceptions

## Decision Framework

When multiple valid approaches exist, choose based on:

1. **Testability** - Can I easily test this?
2. **Readability** - Will someone understand this in 6 months?
3. **Consistency** - Does this match project patterns?
4. **Simplicity** - Is this the simplest solution that works?
5. **Reversibility** - How hard to change later?

## Project Integration

### Learning the Codebase

- **ALWAYS check existing features first** - Search for similar functionality before implementing new features
- Find 3 similar features/components to understand patterns
- Identify common patterns and conventions
- Use same libraries/utilities when possible
- Follow existing test patterns
- Check services directory (`/apps/backend/src/services/`) for existing integrations
- Look for existing AI/LLM services before adding new ones
- Search for similar API patterns before creating new endpoints

### Tooling

- Use project's existing build system
- Use project's test framework
- Use project's formatter/linter settings
- Don't introduce new tools without strong justification

## Journal Update Requirements

**IMPORTANT**: Update JOURNAL.md regularly throughout our work sessions:
- After completing any significant feature or fix
- When encountering and resolving errors
- At the end of each work session
- When making architectural decisions
- Format: What/Why/How/Issues/Result structure

## Quality Gates

### Definition of Done

- [ ] Tests written and passing
- [ ] Code follows project conventions
- [ ] No linter/formatter warnings
- [ ] Commit messages are clear
- [ ] Implementation matches plan
- [ ] No TODOs without issue numbers

### Test Guidelines

- Test behavior, not implementation
- One assertion per test when possible
- Clear test names describing scenario
- Use existing test utilities/helpers
- Tests should be deterministic

---
description: Daily Dev Digest - A personalized developer newsletter application built with Bun, TypeScript, and Prisma
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json, *.prisma"
alwaysApply: false
---

## Project Overview

Daily Dev Digest is a web application that generates personalized developer newsletters from GitHub repository activity. The app pulls recent PRs, generates human-readable summaries, and delivers them via web, Slack, or email.

## Technology Stack & Runtime

**Always use Bun instead of Node.js:**
- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest` 
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv

**Core Technologies:**
- **Backend**: Express.js with TypeScript, Prisma ORM, SQLite (default) 
- **Database**: Prisma with SQLite for development, Postgres for production
- **Authentication**: JWT tokens with bcrypt for password hashing
- **External APIs**: GitHub (@octokit/rest), optional OpenAI, Slack, Email (SMTP)
- **Validation**: Zod schemas for request validation and environment config
- **Logging**: Pino with structured JSON logging
- **Testing**: Vitest for unit tests, Playwright for E2E tests

## Common Development Commands

```bash
# Development server with hot reload
bun run dev

# Build for production
bun run build

# Start production server
bun run start

# Run tests
bun test
bun run test:ui     # Vitest UI
bun run test:e2e    # Playwright tests

# Code quality
bun run lint        # ESLint with auto-fix
bun run format      # Prettier formatting
bun run type-check  # TypeScript checking

# Database operations
bun run db:generate # Generate Prisma client
bun run db:push     # Push schema changes to database
bun run db:studio   # Open Prisma Studio GUI
```

## Project Architecture

### Three-Layer Architecture
1. **Routes** (`src/routes/`): Express.js endpoints with Zod validation
2. **Services** (`src/services/`): Business logic and orchestration
3. **Database** (`src/db/`): Prisma models and database operations

### Key Directories
- `src/lib/`: Core utilities (config, logger, auth, validation)
- `src/clients/`: External API integrations (GitHub, Slack, email)
- `src/types/`: TypeScript type definitions
- `docs/`: Comprehensive project documentation
- `tests/`: Test files (unit and integration)

### Database Models (Prisma)
**Core entities:**
- `User`: Authentication and user management with role-based access
- `Role` & `UserRole`: Permission system (Admin, Maintainer, Viewer + custom roles)
- `Repo`: GitHub repository tracking
- `Digest`: Generated summaries with PR data and statistics
- `Job`: Background job processing with persistent status
- `UserPreference`: Notification preferences and subscription settings

**Key relationships:**
- Users have roles, create digests, and have preferences
- Repositories have multiple digests
- Jobs are linked to users and optionally to digests
- Notifications are tied to users and digests

## Configuration & Environment

All secrets come from `.env` file (never stored in database):
```bash
# Required
GITHUB_TOKEN=ghp_xxxxx
JWT_SECRET=xxxxx
DATABASE_URL=file:./dev.db

# Optional integrations
OPENAI_API_KEY=sk-xxxxx
SLACK_BOT_TOKEN=xoxb-xxxxx
SMTP_HOST=smtp.gmail.com
SMTP_USER=xxxxx
```

Non-secret settings are stored in the database `Setting` model and accessed via `PATCH /api/v1/settings`.

## API Design Patterns

### Request/Response Structure
- All API endpoints return JSON with `success: boolean` field
- Use Zod schemas for validation in routes
- Authentication via JWT tokens in Authorization header
- Role-based permissions enforced via middleware decorators

### Common Endpoints
- `POST /api/v1/digests` → Create digest job, returns `job_id`
- `GET /api/v1/jobs/{id}` → Check job status (PENDING/RUNNING/COMPLETED/FAILED)
- `GET /api/v1/digests` → List digests with pagination
- `GET /api/v1/repos` → Manage tracked repositories
- `GET/PATCH /api/v1/settings` → Application configuration

## Development Workflow

### Adding New Features
1. Update Prisma schema if database changes needed
2. Run `bun run db:push` to apply schema changes
3. Generate types: `bun run db:generate`
4. Create/update Zod validation schemas in routes
5. Implement business logic in services layer
6. Add comprehensive tests
7. Update API documentation

### Testing Strategy
- Unit tests for services and utilities
- Integration tests for API endpoints
- Mock external services (GitHub, email) in tests
- Use separate test database with cleanup between tests

### Code Quality Standards
- Follow existing TypeScript patterns and imports
- Use structured logging via Pino loggers (apiLogger, dbLogger, etc.)
- Validate all external inputs with Zod
- Handle errors gracefully with proper HTTP status codes
- Follow existing naming conventions (camelCase for vars, PascalCase for types)

## External Integrations

### GitHub API
- Uses @octokit/rest with token authentication
- Implements rate limiting and error handling
- Fetches PR data with configurable date ranges
- Repository metadata and statistics

### Background Jobs
- Persistent job queue via database `Job` model
- Job processing handles digest generation, notifications
- Status tracking: PENDING → RUNNING → COMPLETED/FAILED
- Retry logic and error capture

### Optional Integrations
- **OpenAI**: AI-powered PR summaries (behind feature flag)
  - **IMPORTANT**: Always read the latest API specs from `docs/openai-api-specs.md` before implementing OpenAI features
  - Use streaming responses for better user experience
  - Follow the parameter requirements for specific models (e.g., gpt-5-mini only supports temperature=1)
- **Slack**: Bot notifications and DM delivery  
- **Email**: SMTP-based email notifications
- **Webhooks**: Configurable webhook delivery for events

## Key Architectural Decisions

- **No Docker required**: Simple Bun-based development setup
- **SQLite for development**: Easy local setup, Postgres for production
- **Express over Bun.serve()**: Leverages existing ecosystem and patterns
- **Zod for validation**: Runtime type safety and environment validation
- **Pino structured logging**: Production-ready logging with request correlation
- **Jobs in database**: Persistent background processing that survives restarts
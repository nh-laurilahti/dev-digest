# Daily Dev Digest

A personalized developer newsletter application built with Bun, TypeScript, Express, and Prisma.

## Features

- **User Management**: Secure authentication and user management
- **Repository Integration**: Connect with GitHub repositories
- **Digest Generation**: Automated digest creation with AI summaries
- **Multi-channel Notifications**: Email, Slack, and web notifications
- **Flexible Scheduling**: Customizable digest frequency and timing
- **API-first**: RESTful API with comprehensive error handling

## Quick Start

### Prerequisites

- [Bun](https://bun.com) runtime (v1.2.20+)
- PostgreSQL database (or SQLite for development)
- GitHub token for repository access

### Installation

1. Clone the repository and install dependencies:
   ```bash
   bun install
   ```

2. Copy the environment template and configure your settings:
   ```bash
   cp .env.example .env
   ```

3. Set up your database (with Prisma):
   ```bash
   bun run db:generate
   bun run db:push
   ```

### Development

Start the development server with hot reload:
```bash
bun run dev
```

The API will be available at:
- Main API: http://localhost:3000
- Health Check: http://localhost:3000/health
- API Documentation: http://localhost:3000/docs

### Available Scripts

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build for production
- `bun run start` - Start production server
- `bun run test` - Run tests
- `bun run test:ui` - Run tests with UI
- `bun run lint` - Lint code
- `bun run format` - Format code
- `bun run type-check` - Type check without emitting

### Project Structure

```
src/
├── index.ts           # Application entry point
├── app.ts             # Express app configuration
├── routes/            # API route handlers
├── services/          # Business logic
├── clients/           # External service clients
├── lib/               # Core utilities
├── db/                # Database layer
└── types/             # TypeScript type definitions
```

## Configuration

Key environment variables (see `.env.example` for complete list):

- `DATABASE_URL` - Database connection string
- `JWT_SECRET` - JWT signing secret (min 32 characters)
- `GITHUB_TOKEN` - GitHub personal access token
- `OPENAI_API_KEY` - OpenAI API key for AI summaries

## Tech Stack

- **Runtime**: Bun
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL/SQLite with Prisma ORM
- **Authentication**: JWT tokens
- **Testing**: Vitest + Playwright
- **Code Quality**: ESLint + Prettier
- **External APIs**: GitHub, OpenAI, Slack

## License

MIT

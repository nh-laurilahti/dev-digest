# Project File Structure

```
├── src/                      # Application source
│   ├── index.ts              # Application entry point
│   ├── app.ts                # Express app configuration
│   ├── routes/               # Route handlers
│   ├── services/             # Business logic
│   ├── clients/              # External service clients
│   ├── lib/                  # Core utilities
│   └── db/                   # Database layer
├── client/                   # React frontend (optional)
├── package.json              # Project config and scripts
├── tsconfig.json             # TypeScript configuration
└── bun.lockb                 # Bun lockfile
```

Note: Development server should be started with:

```
bun run dev
```

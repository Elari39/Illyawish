# Illyawish

Illyawish is a local AI chat workspace built with a Go backend and a React/Vite frontend.

## What is included

- Session-based authentication with first-user bootstrap
- Persistent conversations stored in SQLite
- Streaming chat responses over SSE
- Provider preset management for OpenAI-compatible endpoints
- Image upload flow with server-side storage and authenticated image delivery
- Conversation export, archive, pin, retry, regenerate, and edit flows

## Quick start

1. Copy `.env.example` to `.env`.
2. Set `SESSION_SECRET` to a real secret. In production, also set `SETTINGS_ENCRYPTION_KEY`.
3. Optionally set `BOOTSTRAP_USERNAME` and `BOOTSTRAP_PASSWORD` if you want the first admin user to be created automatically on startup.
4. Start the backend:

```bash
cd backend
go run ./cmd/server
```

5. Start the frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

6. Open `http://localhost:10170`.

If no users exist and no bootstrap credentials were provided, the login page will prompt you to create the first administrator account.

## Environment variables

- `APP_ENV`: defaults to `development`. Use `production` or another non-dev value to enable strict secret validation.
- `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODEL`: optional fallback provider config.
- `SQLITE_PATH`: SQLite database path.
- `UPLOAD_DIR`: local directory used to persist uploaded images.
- `SERVER_PORT`: backend port.
- `SESSION_SECRET`: cookie/session signing secret.
- `SETTINGS_ENCRYPTION_KEY`: encrypts stored provider API keys. Falls back to `SESSION_SECRET` if omitted in development.
- `FRONTEND_ORIGIN`: allowed browser origin for the frontend.
- `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD`: optional first-user bootstrap credentials.

## Verification

- Backend: `cd backend && GOCACHE=/tmp/go-build go test ./...`
- Frontend: `cd frontend && pnpm build`

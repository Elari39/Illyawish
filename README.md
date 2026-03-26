# Illyawish

Illyawish is a local AI chat workspace built with a Go backend and a React/Vite frontend.

## What is included

- Session-based authentication with first-user bootstrap
- Persistent conversations stored in SQLite
- Streaming chat responses over SSE
- Provider preset management for OpenAI-compatible endpoints
- Image upload flow with server-side storage and authenticated image delivery
- Conversation export, archive, pin, retry, regenerate, and edit flows

## Docker deployment

Start the full stack:

```bash
docker compose up -d --build
```

Open `http://localhost:10170`.

The Docker stack publishes only the frontend on host port `10170`. The backend listens on `5721` inside Docker and is reached through Nginx at `/api`.

Useful commands:

```bash
docker compose ps
docker compose logs -f
docker compose down
```

## 1Panel deployment

This project is a good fit for 1Panel's Compose deployment flow. The recommended setup is:

- Import the existing `docker-compose.yml` from this repository through `Containers -> Orchestration`
- Keep the frontend published on host port `10170`
- Keep the backend internal-only on `5721`
- Use a 1Panel website reverse proxy to point your domain at `http://127.0.0.1:10170`

Guides:

- English guide: [`docs/1panel-deploy.md`](docs/1panel-deploy.md)
- 中文指南: [`docs/1panel-deploy.zh-CN.md`](docs/1panel-deploy.zh-CN.md)

## Persistent data

All runtime data is stored in the project root `data/` directory:

- `data/app.json`: generated application config and secrets
- `data/aichat.db`: SQLite database
- `data/uploads/`: uploaded images

On first startup, the backend creates `data/app.json` automatically and generates secure values for:

- `sessionSecret`
- `settingsEncryptionKey`

## Optional server fallback

If you want a server-wide OpenAI-compatible fallback provider, start the stack once and then edit `data/app.json`:

```json
{
  "openAIBaseURL": "https://api.openai.com/v1",
  "openAIApiKey": "sk-...",
  "model": "gpt-4.1-mini"
}
```

If these fields are empty, users can still configure provider presets from the UI.

You can also optionally preconfigure first-user bootstrap credentials in `data/app.json`:

```json
{
  "bootstrapUsername": "admin",
  "bootstrapPassword": "change-me"
}
```

## Local development

Start the backend:

```bash
cd backend
go run ./cmd/server
```

Start the frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

Development defaults:

- Frontend: `http://localhost:10170`
- Backend: `http://localhost:5721`

The frontend uses relative `/api` requests, and Vite proxies them to `http://localhost:5721`.

## Verification

- Backend: `cd backend && GOCACHE=/tmp/go-build go test ./...`
- Frontend: `cd frontend && pnpm build`
- Docker config: `docker compose config`

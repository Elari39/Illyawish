# Illyawish

Illyawish is a local AI chat workspace with a Go backend and a React/Vite frontend.

## Highlights

- Session-based authentication with first-user bootstrap
- SQLite-backed conversations and settings
- Streaming chat responses over SSE
- Provider preset management for OpenAI-compatible endpoints
- Attachment upload and authenticated file delivery
- Conversation archive, pin, export, retry, regenerate, and edit flows

## Runtime Layout

- Public app entry: `http://localhost:10170`
- Internal backend port: `5721`
- Persistent runtime data: project-root `data/`
- Browser traffic always enters through the frontend, and `/api` is proxied internally to the backend

## Quick Start

```bash
docker compose up -d --build
```

Then open `http://localhost:10170`.

## Deployment Paths

| Path | When to use it | Core steps |
| --- | --- | --- |
| `1Panel Orchestration Mode` | You want 1Panel to manage the Compose stack lifecycle | Import `docker-compose.yml` in `Containers -> Orchestration`, keep the public entry on `10170`, and point the 1Panel website reverse proxy to `http://127.0.0.1:10170` |
| `Direct Git Clone + Docker Compose` | You prefer SSH + Git + Compose on the server | Clone to a fixed path such as `/opt/illyawish`, run `docker compose up -d --build`, and optionally use 1Panel only for website reverse proxy / HTTPS |

Do not manage the same stack through both 1Panel orchestration and shell `docker compose` at the same time.

When you deploy behind a reverse proxy and want login rate limits or secure-cookie forwarding to use the real client address, set trusted proxies in `data/app.json`:

```json
{
  "trustedProxies": ["127.0.0.1/32"],
  "trustProxyHeadersForSecureCookies": true
}
```

Keep `trustedProxies` limited to the proxy hops you actually control. Leave it empty for direct, non-proxied deployments.

## Documentation

- Chinese guide: [`docs/README.zh-CN.md`](docs/README.zh-CN.md)
- Japanese guide: [`docs/README.ja-JP.md`](docs/README.ja-JP.md)
- Compatibility redirect for old 1Panel guide links: [`docs/1panel-deploy.md`](docs/1panel-deploy.md)

## Local Development

Backend:

```bash
cd backend
go run ./cmd/server
```

Frontend:

```bash
cd frontend
pnpm install
pnpm dev
```

Development defaults:

- Frontend: `http://localhost:10170`
- Backend: `http://localhost:5721`
- Vite proxies relative `/api` requests to `http://localhost:5721`

## Verification

- Backend tests: `cd backend && GOCACHE=/tmp/go-build go test ./...`
- Frontend lint: `cd frontend && pnpm lint`
- Frontend tests: `cd frontend && pnpm test:run`
- Frontend build: `cd frontend && pnpm build`
- Docker config: `docker compose config`

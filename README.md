# Illyawish

Illyawish is a local AI chat workspace built with a Go backend and a React/Vite frontend.

## What is included

- Session-based authentication with first-user bootstrap
- Persistent conversations stored in SQLite
- Streaming chat responses over SSE
- Provider preset management for OpenAI-compatible endpoints
- Image upload flow with server-side storage and authenticated image delivery
- Conversation export, archive, pin, retry, regenerate, and edit flows

## Local development

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

## Docker deployment

1. Copy `.env.example` to `.env`.
2. Edit at least these variables in `.env`:
   - `SESSION_SECRET`: must be a real random secret.
   - `SETTINGS_ENCRYPTION_KEY`: should also be a real random secret in production.
   - `FRONTEND_ORIGIN`: for local Docker access use `http://localhost:10170`; for a domain deployment use your real public URL such as `https://chat.example.com`.
   - Optional: `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODEL`, `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD`.
3. Build and start the stack:

```bash
docker compose up -d --build
```

4. Open `http://localhost:10170`.

Useful commands:

```bash
docker compose ps
docker compose logs -f
docker compose down
```

Persistent data is stored in:

- `./docker-data/backend/aichat.db`
- `./docker-data/backend/uploads`

The Docker setup exposes only the frontend on port `10170`. The backend stays on the internal Docker network and is reached through Nginx at `/api`.

## 1Panel deployment

### Option 1: access by server IP and port

1. Upload or clone this project to your server.
2. Copy `.env.example` to `.env`.
3. Set `SESSION_SECRET`, `SETTINGS_ENCRYPTION_KEY`, and keep `FRONTEND_ORIGIN=http://服务器IP:10170`.
4. In 1Panel, open `容器 -> 编排 -> 创建编排`.
5. Choose `路径选择`, then point it to this project's `docker-compose.yml`.
6. Start the compose project.
7. Open the server firewall/security-group port `10170`.
8. Visit `http://服务器IP:10170`.

### Option 2: deploy behind a domain in 1Panel

1. Upload or clone this project to your server.
2. Copy `.env.example` to `.env`.
3. Set these values before starting the compose project:
   - `SESSION_SECRET=你的随机密钥`
   - `SETTINGS_ENCRYPTION_KEY=你的随机密钥`
   - `FRONTEND_ORIGIN=https://你的域名`
   - Optional: `BOOTSTRAP_USERNAME` and `BOOTSTRAP_PASSWORD`
4. In 1Panel, open `容器 -> 编排 -> 创建编排`.
5. Choose `路径选择`, then select this project's `docker-compose.yml`.
6. Start the compose project and make sure the frontend is published on host port `10170`.
7. In 1Panel, open `网站 -> 创建网站 -> 反向代理`.
8. Bind your domain and forward it to `http://127.0.0.1:10170`.
9. After the website is created, apply an SSL certificate in 1Panel and enable HTTPS.
10. Visit `https://你的域名`.

Notes for 1Panel:

- If you change `FRONTEND_ORIGIN`, recreate or restart the compose project so the backend gets the new origin.
- Do not expose backend port `5721` to the public internet; the frontend container already proxies `/api`.
- If you want to back up data, back up the `docker-data/backend` directory.

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
- Docker: `docker compose build`

# AI Chat Frontend

This frontend is the Vite + React client for the local AI chat MVP.

## Local development

1. Start the Go backend on `http://localhost:5721`.
2. Start the frontend with `pnpm dev`.
3. Open the frontend URL from Vite in your browser and use that origin directly.
4. If no users exist yet, create the first admin account from the login screen.

During development, the frontend calls relative `/api/...` paths and Vite proxies
them to `http://localhost:5721`. This keeps auth cookies same-origin from the
browser's perspective and avoids the usual `localhost` vs `127.0.0.1` session
issues.

## API base URL

- Default: use relative `/api` requests
- Optional override: set `VITE_API_BASE_URL` to call a different backend origin
  explicitly

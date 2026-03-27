# Illyawish on 1Panel

This guide explains how to deploy Illyawish on a Linux server with 1Panel using the repository's existing Docker Compose setup.

Repository:

- `https://github.com/Elari39/Illyawish`

## Deployment model

The current Compose file already matches a production-friendly layout:

- `frontend` is published on host port `10170`
- `backend` listens only inside Docker on `5721`
- all persistent data is stored in the project root `data/` directory
- browser traffic should always enter through the frontend, with `/api` proxied internally to the backend

That means the recommended 1Panel architecture is:

- `Containers -> Orchestration` imports the existing `docker-compose.yml`
- `Websites -> Reverse Proxy` points your domain to `http://127.0.0.1:10170`
- HTTPS is terminated by the 1Panel website

Do not expose backend port `5721` to the public internet.

## 1. Prepare the server

If 1Panel is not installed yet, install it with the official online installer:

```bash
bash -c "$(curl -sSL https://resource.fit2cloud.com/1panel/package/v2/quick_start.sh)"
```

After installation:

- run `1pctl user-info` to get the panel address
- allow the 1Panel panel port in your firewall or security group
- if you plan to use a domain, point the DNS record at the server first

Official references:

- `https://1panel.cn/docs/v2/installation/online_installation/`
- `https://1panel.cn/docs/v1/user_manual/containers/compose/`
- `https://1panel.cn/docs/v2/user_manual/websites/website_create/`
- `https://1panel.cn/docs/v2/user_manual/websites/website_config_basic/`

## 2. Upload the project to a fixed path

Use a stable directory so `./data` remains persistent across rebuilds.

Recommended path:

```bash
mkdir -p /opt/illyawish
cd /opt/illyawish
git clone https://github.com/Elari39/Illyawish.git .
```

You can also upload the repository manually, but keep the final project root at a fixed path such as:

```bash
/opt/illyawish
```

The imported Compose file should then be:

```bash
/opt/illyawish/docker-compose.yml
```

## 3. Understand what 1Panel will run

The repository's current Compose file does the following:

- builds `backend` from `./backend`
- exposes backend port `5721` only inside Docker
- mounts `./data:/data`
- builds `frontend` from `./frontend`
- publishes frontend as `10170:80`
- waits for the backend health check before starting the frontend

Operationally this means:

- the public entrypoint is the frontend on `10170`
- the backend should not be published separately
- `data/app.json`, `data/aichat.db`, and `data/uploads/` will live under the project root

## 4. Import the Compose stack in 1Panel

In 1Panel:

1. Open `Containers -> Orchestration`
2. Click `Create`
3. Choose `Path`
4. Select `/opt/illyawish/docker-compose.yml`
5. Save the orchestration
6. Start the stack

This tells 1Panel to use the repository's existing Compose definition directly instead of rebuilding the stack by hand in the app store.

## 5. Verify the first startup

After the stack starts, verify in the orchestration detail view:

- `frontend` is running
- `backend` is running
- `frontend` publishes host port `10170`
- `backend` is not published to the host
- the volume mount points to the project root `data/`

On first startup, the backend should automatically create:

- `data/app.json`
- `data/aichat.db`
- `data/uploads/`

These files mean:

- `app.json`: generated app configuration and secrets
- `aichat.db`: SQLite database
- `uploads/`: stored uploaded files

## 6. Access options

### Option A: direct IP and port

Best for testing or private/internal use.

Requirements:

- allow `10170/tcp` in the firewall or cloud security group
- visit `http://SERVER_IP:10170`

Notes:

- do not open `5721`
- the browser should never target the backend container directly

### Option B: domain and HTTPS through 1Panel

This is the recommended production setup.

Before you begin:

- make sure the domain resolves to the server
- make sure the 1Panel website component is available
- if needed, prepare the OpenResty website environment in 1Panel first

Then in 1Panel:

1. Open `Websites -> Create Website`
2. Choose `Reverse Proxy`
3. Enter your domain, for example `chat.example.com`
4. Set the proxy target to `http://127.0.0.1:10170`
5. Save the website
6. Open the website's basic settings
7. Apply for or upload an HTTPS certificate
8. Enable HTTPS

Always proxy to:

```text
http://127.0.0.1:10170
```

Never proxy to:

```text
http://127.0.0.1:5721
```

The frontend container is the correct entrypoint because it serves the app and forwards `/api` to the backend. If you proxy the domain straight to the backend, the UI will not work correctly.

## Cookie security setting for HTTPS reverse proxy

Because 1Panel terminates HTTPS before forwarding traffic inward, set this in `data/app.json` after the first startup:

```json
{
  "trustProxyHeadersForSecureCookies": true
}
```

This allows the backend to trust `X-Forwarded-Proto` / `X-Forwarded-Ssl` when deciding whether the session cookie should use the `Secure` flag.

Keep this value `false` for direct HTTP access without a trusted reverse proxy.

## 7. Updating the deployment later

For future updates, the recommended server-side flow is:

```bash
cd /opt/illyawish
git pull
docker compose build
docker compose up -d
```

A practical split of responsibilities is:

- update code by SSH on the server
- use 1Panel for start/stop, logs, and runtime inspection
- avoid creating and recreating the same Compose project from both 1Panel and external scripts unless you are intentionally replacing it

## Runtime contracts

Keep these deployment assumptions unchanged:

- public entrypoint: frontend host port `10170`, or 1Panel website `80/443`
- internal backend port: `5721` only inside Docker
- persistent data path: project root `./data`
- reverse proxy target: `http://127.0.0.1:10170`

If you later move the project from `/opt/illyawish` to another directory, move the whole project folder together so the relative `./data` volume keeps the same contents.

## Validation and troubleshooting

Recommended server commands:

```bash
cd /opt/illyawish
docker compose ps
docker compose logs -f
```

Extra things to check:

- `data/app.json` exists
- `data/uploads/` receives new files after uploads
- the website proxy target is still `127.0.0.1:10170`

Common problems:

1. `502` or `504` on the domain

The reverse proxy target is usually wrong. Point it to `http://127.0.0.1:10170`.

2. The page opens but API requests fail

This usually means the request path is bypassing the frontend entrypoint or the reverse proxy was aimed at the backend instead.

3. Chat history disappears after rebuilds

The project directory may have changed, or the `./data:/data` mount is wrong. The data lives on the host in the project root, not inside the container image.

4. The backend is reachable from the public internet

Backend port `5721` was exposed somewhere it should not have been.

5. The domain fails but `IP:10170` works

Check:

- DNS resolution
- firewall or security group rules
- website reverse proxy target
- HTTPS certificate status

# Docker deployment

Run the **frontend** and **backend** as containers. The UI nginx reverse-proxies `/api` and `/generated` to the API, so the browser only needs one URL.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- MongoDB Atlas (or any reachable MongoDB) with Network Access allowing your host/server IPs
- `backend/.env` filled from `backend/.env.example` **or** a root `.env` from `.env.docker.example`

## Quick start (local)

```bash
cd Inventory_management

# Option A: use backend/.env (already used by the Node app)
# Option B: copy compose env
cp .env.docker.example .env
# edit MONGODB_URI, JWT_SECRET, etc.

docker compose up --build -d
```

- App: **http://localhost:8080**
- API (direct): **http://localhost:3001/api/health**
- API via nginx: **http://localhost:8080/api/health**

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
```

## What each container does

| Service | Image role | Port |
|---------|------------|------|
| `backend` | Node 20 + system Chromium for Puppeteer PDFs | `3001` |
| `frontend` | nginx serving Vite `dist` + proxy `/api` → backend | `80` → host `8080` |

Build args:

- `VITE_API_URL=/api` (default) — browser calls same origin; nginx proxies to `backend:3001`.

## Production server

1. Set real secrets in `backend/.env` (never commit it).
2. Set:

```env
FRONTEND_ORIGIN=https://your-domain.com
PUBLIC_BASE_URL=https://your-domain.com
```

Use the **public site URL** for both when nginx (or a reverse proxy) fronts the stack on one domain.

3. Put TLS in front (Caddy, Traefik, Hostinger/nginx, Cloudflare).

Example reverse proxy to Docker:

```text
https://your-domain.com  →  localhost:8080
```

4. Deploy:

```bash
docker compose pull   # if using a registry
docker compose up --build -d
```

### Separate domains (API on api.*)

If the API is on another host, rebuild the frontend with an absolute API URL:

```bash
VITE_API_URL=https://api.your-domain.com/api docker compose build frontend
```

And set `FRONTEND_ORIGIN` on the backend to `https://your-frontend-domain.com`.

## Build images alone

```bash
docker build -t inventory-backend:latest ./backend
docker build -t inventory-frontend:latest \
  --build-arg VITE_API_URL=/api \
  ./frontend
```

## Health checks

- Backend: `GET /api/health`
- Frontend: `GET /healthz`

Compose waits for a healthy backend before starting the frontend.

## Volumes

- `inventory_backend_generated` → container `/app/generated` (quotation / invoice PDFs)

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Backend keeps restarting | Check `docker compose logs backend` — usually missing `MONGODB_URI` or Atlas IP not allowed |
| Frontend loads but API fails | Confirm `http://localhost:8080/api/health`; check `BACKEND_UPSTREAM=backend:3001` |
| PDF generation fails | Image includes Chromium; ensure `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` |
| CORS errors | Set `FRONTEND_ORIGIN` to the exact browser origin (scheme + host + port) |

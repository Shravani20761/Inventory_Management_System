# Battery Inventory Management

Split for Hostinger: **frontend** (static) + **backend** (Node.js) deploy separately.

## Structure

```text
frontend/          React + Vite UI (deploy static dist/)
  src/             Live app
  legacy/          Old battery.jsx prototype (not deployed)
backend/           Express + MongoDB API (deploy Node.js)
  models/ routes/  Live Invoice / Product / Quotation stack
  legacy/          Old CommonJS /server prototype (not started)
docs/
docker-compose.yml
```

## Quick start (local)

```bash
npm install
npm run install:all
# Configure backend/.env (see backend/.env.example)
npm run dev
```

- Web: http://localhost:5173  
- API: http://localhost:3001/api/health  

## Docker

See [docs/DOCKER.md](docs/DOCKER.md).

```bash
# Set MONGODB_URI / JWT_SECRET in backend/.env
docker compose up --build -d
# App → http://localhost:8080
```

## Hostinger

See [docs/HOSTINGER_DEPLOYMENT.md](docs/HOSTINGER_DEPLOYMENT.md).

1. Deploy **`backend/`** as a Node.js app → `npm start`
2. Build **`frontend/`** with `VITE_API_URL=https://YOUR-API/api` → upload `dist/`

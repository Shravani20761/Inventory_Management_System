# Battery Inventory Management

Separate **frontend** (React + Vite) and **backend** (Express + MongoDB) for Hostinger Business Hosting (hPanel): Node.js API + static frontend.

## Structure

```text
Inventory_management/
  frontend/     React + Vite UI → build to dist/, upload as static site
  backend/      Express + MongoDB API → Hostinger Node.js app
  docs/         Deployment guides
```

Each of `frontend/` and `backend/` also has a small `shared/` copy of isomorphic helpers.

## Local development

```bash
cd Inventory_management
npm install
npm run install:all
# Copy backend/.env.example → backend/.env and set MONGODB_URI, JWT_SECRET
npm run dev
```

Or separately:

```bash
# Terminal 1 — API
cd backend
npm install
npm run dev          # or: npm start

# Terminal 2 — UI
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxies /api → :3001)
npm run build        # production build → dist/
```

- Web: http://localhost:5173  
- API health: http://localhost:3001/api/health  

Frontend uses `VITE_API_URL` (default `/api`). Vite proxies `/api` and `/generated` to the backend in development.

## Hostinger Business Hosting (hPanel)

See [docs/HOSTINGER_DEPLOYMENT.md](docs/HOSTINGER_DEPLOYMENT.md) for full steps.

## Coolify (backend Docker)

See [docs/COOLIFY_BACKEND.md](docs/COOLIFY_BACKEND.md). Use `backend/Dockerfile` with Base Directory `backend`.

Summary:

1. **Backend** — Node.js app, root = `backend/`, start = `npm start`
2. **Frontend** — build with `VITE_API_URL=https://YOUR-API-DOMAIN/api`, upload `frontend/dist/` to `public_html`

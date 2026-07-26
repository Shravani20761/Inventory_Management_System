# Hostinger: separate Frontend + Backend

This app is split so you can deploy **frontend** and **backend** as two Hostinger apps.

```text
Inventory_management/
  frontend/     # React + Vite → static site (or Docker/nginx)
  backend/      # Express + MongoDB → Node.js app
  docker-compose.yml
  docs/
```

## 1) Backend (Hostinger Node.js)

1. Create a **Node.js** app.
2. Upload / set application root to **`backend/`**.
3. **Build command:** leave empty, or `npm install` only (no Vite).
4. **Start command:** `npm start`
5. **Node:** 18+ (20 LTS preferred).
6. Environment variables — copy from `backend/.env.hostinger.example`:

| Variable | Example |
|----------|---------|
| `NODE_ENV` | `production` |
| `PORT` | Hostinger-injected or `3001` |
| `PUBLIC_BASE_URL` | `https://your-api-domain.com` |
| `FRONTEND_ORIGIN` | `https://your-frontend-domain.com` |
| `MONGODB_URI` | Atlas connection string |
| `JWT_SECRET` | long random secret |
| `BOOTSTRAP_ADMIN_EMAIL` / `PASSWORD` | first admin (empty DB only) |

7. Atlas Network Access: allow Hostinger egress (`0.0.0.0/0` or their IPs).
8. Health check: `https://your-api-domain.com/api/health`

## 2) Frontend (Hostinger Static / Website)

1. Create a **static website** (or Website builder that hosts `dist`).
2. Locally (or in CI):

```bash
cd frontend
# Point to your live API (include /api)
echo VITE_API_URL=https://your-api-domain.com/api > .env.production
npm ci
npm run build
```

3. Upload contents of **`frontend/dist/`** to public_html (or Hostinger static root).
4. SPA routing: if deep links 404, add an `.htaccess` rewrite to `index.html`.

### Example Apache SPA rewrite (`frontend/public/.htaccess` or on host)

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

## 3) CORS

Backend must allow the frontend origin:

```env
FRONTEND_ORIGIN=https://your-frontend-domain.com
```

## 4) Local development

```bash
cd Inventory_management
npm install
npm run install:all
npm run dev
```

- Frontend: http://localhost:5173 (proxies `/api` → backend)
- Backend: http://localhost:3001

## 5) Docker (optional)

```bash
# backend/.env required
docker compose up --build
```

- UI: http://localhost:8080  
- API: http://localhost:3001  

For Docker frontend, set build arg `VITE_API_URL` to a URL the **browser** can reach (not the Docker service name).

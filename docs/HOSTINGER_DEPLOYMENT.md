# Hostinger Business Hosting (hPanel)

Deploy **frontend** and **backend** separately using Hostinger’s Node.js and static website tools.

```text
Inventory_management/
  frontend/   → build with Vite → upload dist/ to public_html (static)
  backend/    → Node.js application (Express API)
  docs/
```

---

## Prerequisites

- Hostinger **Business Hosting** (or plan that includes **Node.js**)
- Domain (or subdomain) for the website, and ideally a subdomain for the API (e.g. `api.yourdomain.com`)
- MongoDB Atlas cluster
- Node **18+** (prefer **20 LTS**) in hPanel → Node.js

---

## Part A — Backend (Node.js app)

### 1. Prepare files locally

```bash
cd Inventory_management/backend
cp .env.example .env
# Edit .env — see variables below
npm install
npm start   # smoke-test locally first
```

### 2. Create the Node.js app in hPanel

1. Log in to **hPanel**
2. Open **Websites** → your site (or create a subdomain such as `api.yourdomain.com`)
3. Open **Node.js** (Advanced / Website section)
4. **Create application**:
   - **Application root:** folder that contains `backend`’s `package.json`  
     (upload only the `backend` folder contents, or set root to `…/backend`)
   - **Application URL / domain:** your API host (e.g. `api.yourdomain.com`)
   - **Application startup file / start command:** `npm start`  
     (runs `node --use-system-ca index.js`)
   - **Node version:** 18 or 20
5. **Install / build:**
   - Install: `npm install`
   - Build: leave empty **or** `npm run build` (backend has a no-op `build` so Hostinger does not fail)  
   - Do **not** point the Node app at `frontend/` for build — build the UI locally and upload `dist/`

### 3. Environment variables (hPanel Node.js → Environment)

Set these (also documented in `backend/.env.hostinger.example`):

| Variable | Required | Example |
|----------|----------|---------|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Usually auto | Leave Hostinger’s value if shown |
| `MONGODB_URI` | **Yes** | Atlas connection string |
| `JWT_SECRET` | **Yes** | Long random string |
| `PUBLIC_BASE_URL` | Yes | `https://api.yourdomain.com` |
| `FRONTEND_ORIGIN` | Yes | `https://yourdomain.com` |
| `BOOTSTRAP_ADMIN_EMAIL` | First boot | Admin email |
| `BOOTSTRAP_ADMIN_PASSWORD` | First boot | Admin password |
| Meta / Cloudinary | Optional | WhatsApp / invoice uploads |

Restart the Node.js app after saving env vars.

### 4. MongoDB Atlas

1. Atlas → **Network Access** → allow `0.0.0.0/0` (or Hostinger outbound IPs if known)
2. Atlas → **Database Access** → user/password must match `MONGODB_URI`

### 5. Verify backend

Open:

```text
https://api.yourdomain.com/api/health
```

Expect JSON with `"ok": true`. If the app crashes on start, check Node.js logs in hPanel — most often missing `MONGODB_URI` or Atlas IP block.

---

## Part B — Frontend (static site)

### 1. Build locally (or on any machine with Node)

```bash
cd Inventory_management/frontend
```

Create `.env.production` (build-time — Vite inlines this):

```env
VITE_API_URL=https://api.yourdomain.com/api
```

Then:

```bash
npm install
npm run build
```

Output is in **`frontend/dist/`**.

### 2. Upload to Hostinger

1. hPanel → **File Manager** (or FTP)
2. Open your **website** `public_html` (main domain or www)
3. Upload **all contents** of `frontend/dist/` into `public_html`  
   (so `index.html` sits at `public_html/index.html`)
4. Keep SPA routing: ensure `.htaccess` is present (copied from `frontend/public/.htaccess` into the build if Vite copies `public/`; otherwise upload it manually):

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

### 3. Verify frontend

1. Open `https://yourdomain.com`
2. Log in with bootstrap admin (if DB was empty)
3. Browser DevTools → Network: API calls should go to `https://api.yourdomain.com/api/...`

---

## CORS

Backend must allow the exact browser origin:

```env
FRONTEND_ORIGIN=https://yourdomain.com
```

Use comma-separated origins if you have www + apex:

```env
FRONTEND_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
```

---

## Local development (no Hostinger)

```bash
cd Inventory_management
npm install
npm run install:all
# backend/.env with MONGODB_URI
npm run dev
```

| App | URL |
|-----|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3001 |
| Health | http://localhost:3001/api/health |

In dev, `frontend/vite.config.js` proxies `/api` and `/generated` to `http://localhost:3001`.  
`frontend/.env` can keep `VITE_API_URL=/api`.

---

## Troubleshooting (hPanel)

| Issue | What to check |
|-------|----------------|
| Site shows 503 / app down | Node.js app logs; `MONGODB_URI`; process exited |
| Frontend loads, login fails | `VITE_API_URL` wrong (rebuild after fixing); CORS `FRONTEND_ORIGIN` |
| Mixed content | Both sites must be **HTTPS** |
| PDF / WhatsApp links broken | Set `PUBLIC_BASE_URL` to the **public API** HTTPS URL |
| Deep links 404 | Missing `.htaccess` SPA rewrite |

---

## What not to do

- Do **not** upload `node_modules` from Windows unless required — prefer `npm install` on Hostinger for the backend
- Do **not** deploy `backend/legacy` or `frontend/legacy`
- Do **not** put secrets in the frontend build except the public API base URL

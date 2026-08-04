# Coolify — backend API

Deploy **`Inventory_management/backend`** as a Docker app on Coolify.

## Coolify settings

| Setting | Value |
|---------|--------|
| Build pack | Dockerfile |
| Base Directory | `backend` (if repo root is `Inventory_management`) **or** empty if the Git root is already `backend` |
| Dockerfile Location | `Dockerfile` (or `/backend/Dockerfile` from monorepo root) |
| Port | Coolify injects `PORT` — app listens on `0.0.0.0` |
| Health check path | `/api/health` |

## Required environment variables

Set these in Coolify → Environment Variables (do not bake secrets into the image):

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/batterymela?retryWrites=true&w=majority
JWT_SECRET=your-long-secret
PUBLIC_BASE_URL=https://api.krishnainfotec.com
FRONTEND_ORIGIN=https://quickfixsinventorymanagement.pages.dev
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=change-me
```

**Do not** leave these from local/dev:

- `PUBLIC_BASE_URL=https://....ngrok-free.dev`
- `FRONTEND_ORIGIN=http://localhost:5173`

If the browser shows a **CORS** error from your Pages/static site:

1. Set exact origin (no trailing slash), e.g.  
   `FRONTEND_ORIGIN=https://quickfixsinventorymanagement.pages.dev`
2. Multiple fronts:  
   `FRONTEND_ORIGIN=https://site1.com,https://site2.pages.dev`
3. Redeploy / restart the backend so env reloads.
4. Startup logs must print:  
   `[cors] Allowed origins: https://quickfixsinventorymanagement.pages.dev`

Optional: Meta WhatsApp, Cloudinary (see `.env.example`).

`PORT` is set by Coolify — you usually do not need to set it yourself. `PORT=3001` is fine if Coolify assigned it.

## MongoDB Atlas (required for Coolify)

If logs show `ENOTFOUND` or “IP isn't whitelisted”:

1. Atlas → **Network Access** → add **`0.0.0.0/0`** (allow from anywhere) **or** your Coolify server’s public IP.
2. Prefer a **`mongodb+srv://...`** URI from Atlas → Connect → Drivers (not the long `mongodb://host1,host2,host3` form if DNS fails).
3. Confirm the cluster is not paused.
4. Redeploy after changing Network Access (can take a minute to apply).

## Persistent storage (PDFs)

Mount a volume if you want quotation/invoice PDFs to survive redeploys:

| Container path | Purpose |
|----------------|---------|
| `/app/generated` | Generated PDFs |

## Verify

After deploy:

```text
https://YOUR-API-DOMAIN/api/health
```

Expect JSON with `"ok": true` and `"database": "mongodb"`.

Runtime logs should include:

```text
[db] SUCCESS — Connected to MongoDB …
[startup] SUCCESS — Battery Inventory API is running
```

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
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-long-secret
PUBLIC_BASE_URL=https://your-coolify-api-domain.com
FRONTEND_ORIGIN=https://your-frontend-domain.com
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=change-me
```

Optional: Meta WhatsApp, Cloudinary (see `.env.example`).

`PORT` is set by Coolify — you usually do not need to set it yourself.

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

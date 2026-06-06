# Hostinger Deployment Guide

This project must be deployed as a Node.js application, not only static hosting, because it uses:

- Express APIs
- MongoDB
- Puppeteer PDF generation
- Meta WhatsApp Cloud API
- Cloudinary uploads

## Final Production Shape

```text
Hostinger Node.js App
  server/index.js        # Express API + serves dist/
  dist/                  # React production build
  public/                # static assets used by PDFs
  server/generated/      # runtime PDFs, not committed
```

## Files To Upload

Upload the project root except:

```text
node_modules/
.env
dist/                  # optional if Hostinger runs npm run build
server/generated/*.pdf
server/generated/accounts/*.pdf
server/generated/invoices/*.pdf
```

Keep these folders:

```text
public/
server/
src/
docs/
package.json
package-lock.json
vite.config.js
index.html
.env.hostinger.example
```

## Hostinger Setup

1. Create a Node.js app in Hostinger.
2. Set app root to the uploaded `Inventory_management` folder.
3. Set startup file/command:

```bash
npm start
```

4. Set build command:

```bash
npm ci && npm run build
```

5. Add environment variables from `.env.hostinger.example`.
6. Set `PUBLIC_BASE_URL` to your real HTTPS domain.
7. Restart the app.

## Required Environment Variables

```env
NODE_ENV=production
PORT=3001
PUBLIC_BASE_URL=https://your-domain.com
VITE_API_URL=/api
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/batterymela?retryWrites=true&w=majority
JWT_SECRET=change-this-to-a-long-random-secret
```

WhatsApp:

```env
META_ACCESS_TOKEN=...
META_PHONE_NUMBER_ID=...
META_VERIFY_TOKEN=...
```

Cloudinary:

```env
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

## Important Notes

- WhatsApp PDF sending requires a public HTTPS PDF URL. `PUBLIC_BASE_URL` cannot be localhost.
- MongoDB Atlas must allow Hostinger's outbound IP, or use `0.0.0.0/0` temporarily while testing.
- Puppeteer is installed in dependencies. If Hostinger shared Node cannot run Chromium, use Hostinger VPS or configure a system Chromium executable.
- Generated PDFs are runtime files. They should not be committed or manually uploaded as source.

## Local Production Test

Run this before uploading:

```powershell
npm install
npm run build
$env:NODE_ENV="production"
npm start
```

Then open:

```text
http://localhost:3001
http://localhost:3001/api/health
```


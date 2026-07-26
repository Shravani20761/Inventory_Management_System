# MongoDB setup (backend)

In **`backend/.env`** (same folder as backend `package.json`), set:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.../batterymela?retryWrites=true&w=majority
JWT_SECRET=your-long-secret
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=change-me
```

Then from `backend/`:

```bash
npm start
```

On first boot with an empty user collection, bootstrap creates the first superAdmin.

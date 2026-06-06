# MongoDB setup for this project

You **do not** need a large SQL-style init script. **Mongoose** creates collections and indexes when the Node API runs and writes data (or when you run the helpers below).

## 1. Connection string (`.env`)

In **`Inventory_management/.env`** (same folder as `package.json`), set:

- **`MONGODB_URI`** — include the **database name** at the end, e.g.  
  `mongodb+srv://USER:ENCODED_PASSWORD@cluster.xxxxx.mongodb.net/batterypro`  
  If the password contains `@ # : / ?`, **URL-encode** those characters (e.g. `@` → `%40`).

- **`JWT_SECRET`** — at least 16 characters.

## 2. First admin user (app, not manual Mongo insert)

**Do not** insert a `users` document by hand unless you know how to store a **bcrypt** hash. The API does it for you.

1. Start with an **empty `users` collection** (or delete existing users if you accept a reset).
2. Set **`BOOTSTRAP_ADMIN_EMAIL`** and **`BOOTSTRAP_ADMIN_PASSWORD`** in `.env`.
3. Run **`npm run server`** once. It will create the default **branch** (if missing) and the first **superAdmin** user.

If `users` already has documents, bootstrap is skipped — log in with an existing account or clear users and repeat.

## 3. Optional sample products

From `Inventory_management`:

```bash
npm run seed
```

This seeds **products** for the main branch. It does **not** create login users.

## 4. Sync indexes (recommended after first deploy)

Ensures Mongoose-defined indexes (e.g. `users.email`, product compound indexes) exist in MongoDB:

```bash
npm run db:sync-indexes
```

## 5. Optional checks in mongosh (Atlas → Browse Collections or `mongosh`)

You can **inspect** data; you usually **should not** create login users here.

```javascript
// After: mongosh "<your MONGODB_URI>"
use batterypro; // use the same DB name as in your URI
db.getCollectionNames();
db.users.find({}, { email: 1, role: 1, branchId: 1, active: 1 });
db.branches.find();
```

## 6. How data fills in day to day

- **Users / branches** — API bootstrap + `/api/auth/register` (admin).
- **Inventory, quotations, invoices, etc.** — UI + **`/api/sync`** (and other routes) when you use the app.

There is **no** single Mongo script that “loads everything” for the whole project; the app is designed to **connect first**, then **create or sync** data through Node.

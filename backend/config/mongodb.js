import dns from "node:dns";
import mongoose from "mongoose";

let connected = false;
let listenersBound = false;

export function isMongoConnected() {
  return connected && mongoose.connection.readyState === 1;
}

/** Safe diagnostic: database name only (never URI or credentials). */
export function getMongoDbName() {
  if (!isMongoConnected()) return null;
  return mongoose.connection?.name || null;
}

function bindConnectionListeners() {
  if (listenersBound) return;
  listenersBound = true;
  const conn = mongoose.connection;
  conn.on("connected", () => {
    connected = true;
    console.log("[db] MongoDB connection established (driver event)");
  });
  conn.on("reconnected", () => {
    connected = true;
    console.log("[db] SUCCESS — MongoDB reconnected");
  });
  conn.on("disconnected", () => {
    connected = false;
    console.warn("[db] WARNING — MongoDB disconnected — driver will retry automatically");
  });
  conn.on("error", (err) => {
    console.warn("[db] MongoDB connection error:", err?.message || err);
  });
}

/** Some networks block SRV lookups (querySrv ECONNREFUSED). Resolve via public DNS instead. */
async function resolveSrvViaPublicDns(hostname) {
  const resolver = new dns.promises.Resolver();
  resolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
  return resolver.resolveSrv(`_mongodb._tcp.${hostname}`);
}

/**
 * Convert mongodb+srv://… to mongodb://… using SRV records (works when OS DNS blocks SRV).
 * Falls back to MONGODB_URI_DIRECT when set.
 */
export async function resolveMongoConnectionUri(rawUri) {
  const direct = String(process.env.MONGODB_URI_DIRECT ?? "").trim();
  if (direct) {
    console.log("[db] Using MONGODB_URI_DIRECT (non-SRV connection string).");
    return direct;
  }

  const trimmed = rawUri.trim();
  if (!trimmed.startsWith("mongodb+srv://")) return trimmed;

  try {
    const withoutScheme = trimmed.slice("mongodb+srv://".length);
    const atIdx = withoutScheme.indexOf("@");
    if (atIdx < 0) return trimmed;
    const creds = withoutScheme.slice(0, atIdx);
    const rest = withoutScheme.slice(atIdx + 1);
    const qIdx = rest.indexOf("?");
    const slashIdx = rest.indexOf("/");
    const hostname =
      slashIdx >= 0 ? rest.slice(0, slashIdx) : qIdx >= 0 ? rest.slice(0, qIdx) : rest;
    const pathPart = slashIdx >= 0 ? rest.slice(slashIdx, qIdx >= 0 ? qIdx : undefined) : "";
    const queryPart = qIdx >= 0 ? rest.slice(qIdx + 1) : "";

    const records = await resolveSrvViaPublicDns(hostname);
    if (!records.length) return trimmed;

    const hosts = records
      .map((r) => `${String(r.name).replace(/\.$/, "")}:${r.port || 27017}`)
      .join(",");

    const params = new URLSearchParams(queryPart);
    if (!params.has("ssl")) params.set("ssl", "true");
    if (!params.has("authSource")) params.set("authSource", "admin");
    if (!params.has("retryWrites")) params.set("retryWrites", "true");
    if (!params.has("w")) params.set("w", "majority");

    const directUri = `mongodb://${creds}@${hosts}${pathPart}?${params.toString()}`;
    console.log(
      `[db] Resolved Atlas SRV via public DNS → direct connection (${records.length} host(s)).`,
    );
    return directUri;
  } catch (err) {
    console.warn(
      `[db] Could not resolve mongodb+srv via public DNS (${err?.message || err}). Using original URI.`,
    );
    return trimmed;
  }
}

/** Database name from a mongodb:// or mongodb+srv:// URI path (never logs credentials). */
function databaseNameFromUri(uri) {
  const trimmed = String(uri ?? "").trim();
  const withoutScheme = trimmed.replace(/^mongodb(\+srv)?:\/\//, "");
  const afterAt = withoutScheme.includes("@")
    ? withoutScheme.slice(withoutScheme.lastIndexOf("@") + 1)
    : withoutScheme;
  const beforeQuery = afterAt.split("?")[0];
  const slash = beforeQuery.indexOf("/");
  if (slash < 0) return "";
  return decodeURIComponent(beforeQuery.slice(slash + 1)).replace(/\/$/, "").trim();
}

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) {
    connected = true;
    return true;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.trim()) {
    throw new Error("MONGODB_URI is missing. Add it to backend/.env.");
  }
  if (uri.trim().includes("mongodb+srv:mongodb+srv")) {
    throw new Error('MONGODB_URI looks invalid: duplicated "mongodb+srv:" in the string.');
  }

  const connectionUri = await resolveMongoConnectionUri(uri);
  const uriDb = databaseNameFromUri(connectionUri);
  const envDb = String(process.env.MONGODB_DB_NAME ?? "").trim();
  const dbName = envDb || uriDb || "";

  try {
    const safe = new URL(connectionUri.replace(/^mongodb(\+srv)?:\/\//, "http://"));
    console.log(
      `[db] Connecting to host=${safe.hostname} db=${dbName || "(mongoose default: test)"}…`,
    );
  } catch {
    console.log("[db] Connecting to MongoDB…");
  }

  if (!dbName) {
    console.warn(
      '[db] WARNING: MONGODB_URI has no /databaseName and MONGODB_DB_NAME is unset. MongoDB will use "test". ' +
        "Local and production must use the same cluster AND the same database or logins fail with Invalid email or password.",
    );
  }

  bindConnectionListeners();

  const options = {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    heartbeatFrequencyMS: 10000,
    maxPoolSize: 10,
    minPoolSize: 1,
    retryWrites: true,
    retryReads: true,
    ...(dbName ? { dbName } : {}),
  };

  const maxAttempts = 5;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`[db] Connection attempt ${attempt}/${maxAttempts}…`);
      await mongoose.connect(connectionUri, options);
      connected = true;
      const host = mongoose.connection.host || "unknown";
      const name = mongoose.connection.name || "unknown";
      console.log(`[db] SUCCESS — Connected to MongoDB host=${host} database=${name}`);
      return true;
    } catch (err) {
      connected = false;
      lastErr = err;
      console.error(
        `[db] MongoDB connection failed (attempt ${attempt}/${maxAttempts}):`,
        err.message,
      );
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      }
    }
  }

  throw new Error(
    lastErr?.message ||
      "Could not reach MongoDB. Check MONGODB_URI, Atlas Network Access (IP whitelist), or set MONGODB_URI_DIRECT in backend/.env.",
  );
}

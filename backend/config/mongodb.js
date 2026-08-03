import mongoose from "mongoose";

let connected = false;
let listenersBound = false;

export function isMongoConnected() {
  return connected && mongoose.connection.readyState === 1;
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

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.trim()) {
    console.error("[db] MONGODB_URI is missing. Add it to backend/.env (see .env.example).");
    process.exit(1);
  }
  const trimmed = uri.trim();
  if (trimmed.includes("mongodb+srv:mongodb+srv")) {
    console.error("[db] MONGODB_URI looks invalid: duplicated \"mongodb+srv:\" in the string.");
    process.exit(1);
  }

  // Log target without credentials
  try {
    const safe = new URL(trimmed.replace(/^mongodb(\+srv)?:\/\//, "http://"));
    console.log(`[db] Connecting to host=${safe.hostname} db=${(safe.pathname || "/").replace(/^\//, "") || "(default)"}…`);
  } catch {
    console.log("[db] Connecting to MongoDB…");
  }

  bindConnectionListeners();

  // Resiliency options: tolerate transient Atlas/network drops (ETIMEDOUT / ResetPool)
  // so in-flight saves are retried by the driver instead of failing outright.
  const options = {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    heartbeatFrequencyMS: 10000,
    maxPoolSize: 10,
    minPoolSize: 1,
    retryWrites: true,
    retryReads: true,
  };

  // Retry the initial connect a few times instead of killing the server on the
  // first network hiccup (common on home connections talking to Atlas).
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`[db] Connection attempt ${attempt}/${maxAttempts}…`);
      await mongoose.connect(trimmed, options);
      connected = true;
      const host = mongoose.connection.host || "unknown";
      const name = mongoose.connection.name || "unknown";
      console.log(`[db] SUCCESS — Connected to MongoDB host=${host} database=${name}`);
      return true;
    } catch (err) {
      connected = false;
      console.error(
        `[db] MongoDB connection failed (attempt ${attempt}/${maxAttempts}):`,
        err.message,
      );
      if (attempt === maxAttempts) {
        console.error(
          "[db] FAILED — Could not reach MongoDB. Check MONGODB_URI and Atlas Network Access (IP whitelist).",
        );
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
    }
  }
  return false;
}

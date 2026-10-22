import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3030);
const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000
    })
  : null;

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
});

async function ensureSchema() {
  if (!pool) return;
  // Benny uses its own prefixed table; Shadowrealm tables are not modified.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS benny_dealer_inquiries (
      id BIGSERIAL PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL,
      service VARCHAR(80) NOT NULL,
      budget VARCHAR(40),
      message VARCHAR(2000) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'NEW',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS benny_dealer_inquiries_status_created_idx
    ON benny_dealer_inquiries (status, created_at DESC)
  `);
}

app.get("/api/health", async (_req, res) => {
  let database = false;
  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = true;
    } catch {
      database = false;
    }
  }
  res.status(database ? 200 : 503).json({
    ok: database,
    service: "benny-the-dealer",
    database,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/inquiries", inquiryLimiter, async (req, res) => {
  if (!pool) {
    return res.status(503).json({ error: "Inquiry service is not configured yet. Please try again later." });
  }

  const { name, email, service, budget = "", message, company = "" } = req.body || {};

  // Quiet honeypot for simple bots.
  if (typeof company === "string" && company.trim()) {
    return res.status(202).json({ ok: true, message: "Thanks — your request has been received." });
  }

  const clean = {
    name: typeof name === "string" ? name.trim() : "",
    email: typeof email === "string" ? email.trim().toLowerCase() : "",
    service: typeof service === "string" ? service.trim() : "",
    budget: typeof budget === "string" ? budget.trim() : "",
    message: typeof message === "string" ? message.trim() : ""
  };

  const allowedServices = new Set([
    "Managed servers",
    "Web hosting",
    "Business email",
    "Media placement",
    "Digital toolkit",
    "Not sure yet"
  ]);
  const allowedBudgets = new Set(["Under $50", "$50–$150", "$150–$500", "$500+", "Let's discuss", ""]);

  if (clean.name.length < 2 || clean.name.length > 100) {
    return res.status(400).json({ error: "Enter a name between 2 and 100 characters." });
  }
  if (clean.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!allowedServices.has(clean.service)) {
    return res.status(400).json({ error: "Choose one of the listed services." });
  }
  if (!allowedBudgets.has(clean.budget)) {
    return res.status(400).json({ error: "Choose a valid budget range." });
  }
  if (clean.message.length < 10 || clean.message.length > 2000) {
    return res.status(400).json({ error: "Your message must be between 10 and 2,000 characters." });
  }

  const reference = "BTD-" + crypto.randomUUID().slice(0, 8).toUpperCase();

  try {
    await pool.query(
      `INSERT INTO benny_dealer_inquiries
       (reference, full_name, email, service, budget, message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [reference, clean.name, clean.email, clean.service, clean.budget || null, clean.message]
    );
    return res.status(201).json({
      ok: true,
      reference,
      message: "Request received. Benny's team will review it and follow up."
    });
  } catch (error) {
    console.error("Benny inquiry save failed:", error?.message || "unknown database error");
    return res.status(500).json({ error: "We couldn't save your request right now. Please try again shortly." });
  }
});

app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"],
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.get("*path", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error("Benny server error:", error?.message || "unknown error");
  res.status(500).json({ error: "Something went wrong." });
});

ensureSchema().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Benny the Dealer listening on port ${PORT}`);
  });
}).catch((error) => {
  console.error("Database initialization failed:", error?.message || "unknown error");
  // Keep the service available for the static site; health and inquiry endpoints
  // report that the database is not ready until configuration is corrected.
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Benny the Dealer listening on port ${PORT} without database readiness`);
  });
});

process.on("SIGTERM", async () => {
  if (pool) await pool.end().catch(() => {});
  process.exit(0);
});
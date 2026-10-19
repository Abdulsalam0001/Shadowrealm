import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false }));

const PORT = Number(process.env.PORT || 3000);
const BTC_ADDRESS = process.env.BTC_RECEIVING_ADDRESS || "bc1qzwsza9hzcaa36avgv5qu6kts4k52wvx2m4cpgv";
const ETH_ADDRESS = (process.env.ETH_RECEIVING_ADDRESS || "0x2bAE0972099c92463ec38A1bC11b8856892388eC").toLowerCase();
const BTC_RATE = process.env.BTC_NGN_RATE || "";
const BTC_USD_RATE = process.env.BTC_USD_RATE || "";
const ETH_RATE = process.env.ETH_NGN_RATE || "";
const BTC_CONFIRMATIONS = Number(process.env.BTC_REQUIRED_CONFIRMATIONS || 2);
const ETH_CONFIRMATIONS = Number(process.env.ETH_REQUIRED_CONFIRMATIONS || 12);
const ETH_RPC_URL = process.env.ETH_RPC_URL || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "";
const FULFILLMENT_WEBHOOK_URL = process.env.FULFILLMENT_WEBHOOK_URL || "";
const FULFILLMENT_WEBHOOK_SECRET = process.env.FULFILLMENT_WEBHOOK_SECRET || "";
const assets = { BTC: { decimals: 8, displayDecimals: 8, rate: BTC_RATE, address: BTC_ADDRESS }, ETH: { decimals: 18, displayDecimals: 8, rate: ETH_RATE, address: ETH_ADDRESS } };

const seedProducts = [
  { sku: "toolkit", name: "Developer Toolkit", description: "Productivity utilities for development work.", priceNgn: 850000, fulfillmentMode: "MANUAL" },
  { sku: "rdp", name: "RDP Starter", description: "Remote desktop for authorized access and workflows.", priceNgn: 1200000, fulfillmentMode: "MANUAL" },
  { sku: "cpanel", name: "cPanel Basic", description: "Starter web hosting with a control panel.", priceNgn: 1800000, fulfillmentMode: "MANUAL" },
  { sku: "smtp", name: "SMTP Launch", description: "Authenticated email setup for legitimate transactional mail.", priceNgn: 950000, fulfillmentMode: "MANUAL" },
  { sku: "automation", name: "Automation Utility Pack", description: "Workflow helpers for authorized business operations.", priceNgn: 600000, fulfillmentMode: "MANUAL" },
  { sku: "rdppro", name: "RDP Pro", description: "Remote administration and testing resources.", priceNgn: 2800000, fulfillmentMode: "MANUAL" },
  { sku: "cpanelbiz", name: "cPanel Business", description: "Hosting for business websites and client projects.", priceNgn: 4200000, fulfillmentMode: "MANUAL" },
  { sku: "smtpgrowth", name: "SMTP Growth", description: "Email delivery for verified domains and opted-in lists.", priceNgn: 2400000, fulfillmentMode: "MANUAL" }
];

const ADMIN_SESSION_COOKIE = "shadowrealm_admin";
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
const CUSTOMER_SESSION_COOKIE = "shadowrealm_customer";
const CUSTOMER_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const CUSTOMER_SESSION_SECRET = process.env.CUSTOMER_SESSION_SECRET || "";

function safeEqualText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function signAdminPayload(payload) {
  return crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(payload).digest("hex");
}
function getAdminCookie(req) {
  const match = String(req.headers.cookie || "").match(/(?:^|;\s*)shadowrealm_admin=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}
function validAdminSession(req) {
  if (!ADMIN_SESSION_SECRET || ADMIN_SESSION_SECRET.length < 32) return false;
  const token = getAdminCookie(req);
  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEqualText(signature, signAdminPayload(payload))) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.username === ADMIN_USERNAME && Number.isFinite(session.exp) && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
function setAdminCookie(res, value, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", value
    ? `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}${secure}`
    : `${ADMIN_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0${secure}`);
}
function admin(req, res, next) {
  if (!validAdminSession(req)) return res.status(401).json({ error: "Please log in to the admin panel." });
  next();
}
function customerCookie(req) {
  const match = String(req.headers.cookie || "").match(/(?:^|;\s*)shadowrealm_customer=([^;]+)/);
  if (!match) return "";
  try { return decodeURIComponent(match[1]); } catch { return ""; }
}
function signCustomerPayload(payload) {
  return crypto.createHmac("sha256", CUSTOMER_SESSION_SECRET).update(payload).digest("hex");
}
function setCustomerCookie(res, token, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", token
    ? `${CUSTOMER_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`
    : `${CUSTOMER_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}
function createCustomerSession(customer) {
  const payload = Buffer.from(JSON.stringify({ customerId: customer.id, exp: Math.floor(Date.now() / 1000) + CUSTOMER_SESSION_TTL_SECONDS })).toString("base64url");
  return payload + "." + signCustomerPayload(payload);
}
async function currentCustomer(req) {
  if (!CUSTOMER_SESSION_SECRET || CUSTOMER_SESSION_SECRET.length < 32) return null;
  const token = customerCookie(req), separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = token.slice(0, separator);
  if (!safeEqualText(token.slice(separator + 1), signCustomerPayload(payload))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.customerId || !Number.isFinite(session.exp) || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return await prisma.customer.findUnique({ where: { id: session.customerId }, select: { id: true, email: true, membershipPaidAt: true } });
  } catch { return null; }
}
async function customerAuth(req, res, next) {
  try {
    const customer = await currentCustomer(req);
    if (!customer) return res.status(401).json({ error: "Sign in to view the members-only catalogue." });
    req.customer = customer;
    next();
  } catch (err) { next(err); }
}
function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(password, salt, 64).toString("hex");
}
function verifyPassword(password, stored) {
  const [salt, hex] = String(stored || "").split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex"), actual = crypto.scryptSync(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254; }

function amountToAtomic(ngn, rate, decimals) {
  if (!rate || !/^\d+(\.\d+)?$/.test(rate) || Number(rate) <= 0) throw new Error("Crypto rate is not configured.");
  const [whole, fraction = ""] = rate.split(".");
  const scale = 10n ** BigInt(decimals);
  const rateScaled = BigInt(whole) * scale + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
  if (rateScaled <= 0n) throw new Error("Invalid crypto rate.");
  return (BigInt(ngn) * scale * scale) / (rateScaled * 100n);
}
function formatAtomic(atomic, decimals, displayDecimals = decimals) {
  const n = BigInt(atomic), scale = 10n ** BigInt(decimals);
  const whole = n / scale;
  const visible = (n % scale) / (10n ** BigInt(decimals - displayDecimals));
  const frac = visible.toString().padStart(displayDecimals, "0").replace(/0+$/, "");
  return frac ? whole.toString() + "." + frac : whole.toString();
}
function randomToken() { return crypto.randomBytes(32).toString("hex"); }
function publicOrder(order) {
  return { id: order.id, orderNumber: order.orderNumber, type: order.type, status: order.status, totalNgn: order.totalNgn / 100, createdAt: order.createdAt };
}
async function rpc(method, params) {
  if (!ETH_RPC_URL) throw new Error("ETH_RPC_URL is not configured.");
  const response = await fetch(ETH_RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Ethereum RPC unavailable.");
  const body = await response.json();
  if (body.error) throw new Error("Ethereum RPC returned an error.");
  return body.result;
}
async function verifyTransaction(payment) {
  if (!payment.txHash) return { found: false, confirmations: 0 };
  if (payment.asset === "BTC") {
    const response = await fetch("https://mempool.space/api/tx/" + encodeURIComponent(payment.txHash), { signal: AbortSignal.timeout(12000) });
    if (response.status === 404) return { found: false, confirmations: 0 };
    if (!response.ok) throw new Error("Bitcoin explorer unavailable.");
    const tx = await response.json();
    const paid = tx.vout.filter(o => o.scriptpubkey_address === BTC_ADDRESS).reduce((sum, o) => sum + BigInt(o.value), 0n);
    const status = tx.status || {};
    let confirmations = 0;
    if (status.confirmed && status.block_height) {
      const tipResponse = await fetch("https://mempool.space/api/blocks/tip/height", { signal: AbortSignal.timeout(12000) });
      if (!tipResponse.ok) throw new Error("Bitcoin block height unavailable.");
      confirmations = Math.max(0, Number((await tipResponse.text()).trim()) - Number(status.block_height) + 1);
    }
    return { found: true, correctDestination: tx.vout.some(o => o.scriptpubkey_address === BTC_ADDRESS), paidAtomic: paid.toString(), confirmations, successful: true };
  }
  const chainId = await rpc("eth_chainId", []);
  if (BigInt(chainId) !== 1n) throw new Error("ETH_RPC_URL is not connected to Ethereum mainnet.");
  const [tx, receipt, tipHex] = await Promise.all([
    rpc("eth_getTransactionByHash", [payment.txHash]),
    rpc("eth_getTransactionReceipt", [payment.txHash]),
    rpc("eth_blockNumber", [])
  ]);
  if (!tx || !receipt || String(tx.hash || "").toLowerCase() !== payment.txHash.toLowerCase()) return { found: false, confirmations: 0 };
  const blockNumber = receipt.blockNumber ? BigInt(receipt.blockNumber) : 0n;
  const tip = BigInt(tipHex);
  const confirmations = blockNumber > 0n && tip >= blockNumber ? Number(tip - blockNumber + 1n) : 0;
  return { found: true, correctDestination: String(tx.to || "").toLowerCase() === ETH_ADDRESS, paidAtomic: BigInt(tx.value || "0x0").toString(), confirmations, successful: receipt.status === "0x1" };
}
async function checkPayment(paymentId) {
  const payment = await prisma.cryptoPayment.findUnique({ where: { id: paymentId }, include: { order: { include: { items: true } } } });
  if (!payment || !payment.txHash || ["PAID", "FULFILLED", "REVIEW"].includes(payment.status)) return;
  try {
    const result = await verifyTransaction(payment);
    const now = new Date();
    if (!result.found) {
      await prisma.cryptoPayment.update({ where: { id: payment.id }, data: { lastCheckedAt: now } });
      return;
    }
    if (!result.correctDestination || !result.successful || BigInt(result.paidAtomic) < BigInt(payment.expectedAtomic)) {
      await prisma.cryptoPayment.update({ where: { id: payment.id }, data: { status: "REVIEW", confirmations: result.confirmations, paidAtomic: result.paidAtomic, lastCheckedAt: now } });
      await prisma.order.update({ where: { id: payment.orderId }, data: { status: "PAYMENT_REVIEW" } });
      return;
    }
    const required = payment.asset === "BTC" ? BTC_CONFIRMATIONS : ETH_CONFIRMATIONS;
    const paymentStatus = result.confirmations >= required ? "PAID" : "CONFIRMING";
    await prisma.cryptoPayment.update({ where: { id: payment.id }, data: { status: paymentStatus, confirmations: result.confirmations, paidAtomic: result.paidAtomic, lastCheckedAt: now } });
    await prisma.order.update({ where: { id: payment.orderId }, data: { status: paymentStatus === "PAID" ? "PAID" : "CONFIRMING" } });
    if (paymentStatus === "PAID") {
      if (payment.order.type === "MEMBERSHIP" && payment.order.customerId) {
        await prisma.customer.update({ where: { id: payment.order.customerId }, data: { membershipPaidAt: new Date() } });
      } else if (payment.order.type === "PRODUCT") {
        await tryAutoFulfillment(payment.orderId);
      }
    }
  } catch (err) {
    console.error("Payment verification error:", err.message);
    await prisma.cryptoPayment.update({ where: { id: payment.id }, data: { lastCheckedAt: new Date() } }).catch(() => {});
  }
}
async function tryAutoFulfillment(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.status !== "PAID") return;
  const products = await prisma.product.findMany({ where: { sku: { in: order.items.map(i => i.productSku) } } });
  const allAuto = order.items.every(item => products.find(p => p.sku === item.productSku)?.fulfillmentMode === "AUTO");
  if (!allAuto || !FULFILLMENT_WEBHOOK_URL || !FULFILLMENT_WEBHOOK_SECRET) return;
  const payload = JSON.stringify({ event: "order.paid", orderNumber: order.orderNumber, customerEmail: order.customerEmail, items: order.items.map(i => ({ sku: i.productSku, name: i.productName, quantity: i.quantity })) });
  const signature = crypto.createHmac("sha256", FULFILLMENT_WEBHOOK_SECRET).update(payload).digest("hex");
  try {
    const response = await fetch(FULFILLMENT_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "x-shadowrealm-signature": signature, "idempotency-key": order.orderNumber }, body: payload, signal: AbortSignal.timeout(15000) });
    if (response.ok) await prisma.order.update({ where: { id: order.id }, data: { status: "FULFILLMENT_PENDING" } });
  } catch (err) { console.error("Fulfillment provider request failed:", err.message); }
}


const mediaSubmissionLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });
const MEDIA_PACKAGES = new Set(["EDITORIAL_REVIEW", "ARTICLE_SPOTLIGHT", "NEWSROOM_CAMPAIGN", "CUSTOM"]);
const MEDIA_ROLES = new Set(["Journalist / Reporter", "Editor", "Publisher / Newsroom", "Freelance writer", "Media representative", "Other"]);
const MEDIA_TIMINGS = new Set(["FLEXIBLE", "THIS_WEEK", "NEXT_2_WEEKS", "DATE_TO_CONFIRM"]);
const MEDIA_BUDGETS = new Set(["UNDER_100", "100_500", "500_PLUS", "QUOTE_FIRST", ""]);
function cleanMediaText(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validArticleUrl(value) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password; }
  catch { return false; }
}
app.post("/api/media-submissions", mediaSubmissionLimiter, async (req, res) => {
  const body = req.body || {};
  // A filled honeypot is silently accepted to avoid teaching simple bots the check.
  if (cleanMediaText(body.website, 200)) return res.status(202).json({ received: true, reference: "ARP-RECEIVED" });
  const journalistName = cleanMediaText(body.journalistName, 100);
  const journalistEmail = cleanMediaText(body.journalistEmail, 254).toLowerCase();
  const journalistPhone = cleanMediaText(body.journalistPhone, 80);
  const role = cleanMediaText(body.role, 60);
  const publicationName = cleanMediaText(body.publicationName, 160);
  const articleUrl = cleanMediaText(body.articleUrl, 2048);
  const promotionPackage = cleanMediaText(body.package, 40);
  const timing = cleanMediaText(body.timing, 40);
  const summary = cleanMediaText(body.summary, 2500);
  const budget = cleanMediaText(body.budget, 40);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(journalistEmail);
  if (journalistName.length < 2 || !validEmail || !role || !MEDIA_ROLES.has(role) ||
      publicationName.length < 2 || !validArticleUrl(articleUrl) || !MEDIA_PACKAGES.has(promotionPackage) ||
      !MEDIA_TIMINGS.has(timing) || !MEDIA_BUDGETS.has(budget) || summary.length < 20 ||
      summary.length > 2500 || body.consent !== true) {
    return res.status(400).json({ error: "Check the required fields, article URL, summary and consent, then try again." });
  }
  const reference = "ARP-" + crypto.randomBytes(5).toString("hex").toUpperCase();
  try {
    const submission = await prisma.mediaSubmission.create({ data: {
      reference, journalistName, journalistEmail, journalistPhone: journalistPhone || null,
      role, publicationName, articleUrl, package: promotionPackage, timing, summary,
      budget: budget || null, consentAt: new Date()
    }, select: { reference: true, createdAt: true } });
    res.status(201).json({ received: true, reference: submission.reference, submittedAt: submission.createdAt });
  } catch (err) {
    console.error("Media submission save failed:", err.message);
    res.status(503).json({ error: "The submission service is temporarily unavailable. Please try again shortly." });
  }
});
app.get("/api/admin/media-submissions", admin, async (_req, res) => {
  const submissions = await prisma.mediaSubmission.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ submissions });
});
app.patch("/api/admin/media-submissions/:id", admin, async (req, res) => {
  const allowed = ["PENDING", "IN_REVIEW", "APPROVED", "REJECTED", "COMPLETED"];
  const status = cleanMediaText(req.body?.status, 30);
  const adminNote = cleanMediaText(req.body?.adminNote, 1500);
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid media submission status." });
  try {
    const submission = await prisma.mediaSubmission.update({ where: { id: req.params.id }, data: { status, adminNote: adminNote || null } });
    res.json({ submission });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Media submission not found." });
    throw err;
  }
});
\napp.get("/api/health", (_req, res) => res.json({ ok: true, databaseConfigured: Boolean(process.env.DATABASE_URL), crypto: { BTC: Boolean(BTC_RATE), ETH: Boolean(ETH_RATE && ETH_RPC_URL) } }));
app.post("/api/auth/register", rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  if (CUSTOMER_SESSION_SECRET.length < 32) return res.status(503).json({ error: "Customer sign-in is not configured yet." });
  const email = String(req.body.email || "").trim().toLowerCase(), password = String(req.body.password || "");
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 12 || password.length > 128) return res.status(400).json({ error: "Use a password between 12 and 128 characters." });
  try {
    const customer = await prisma.customer.create({ data: { email, passwordHash: passwordHash(password) }, select: { id: true, email: true, membershipPaidAt: true } });
    setCustomerCookie(res, createCustomerSession(customer), CUSTOMER_SESSION_TTL_SECONDS);
    res.status(201).json({ authenticated: true, customer });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    throw err;
  }
});
app.post("/api/auth/login", rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  if (CUSTOMER_SESSION_SECRET.length < 32) return res.status(503).json({ error: "Customer sign-in is not configured yet." });
  const email = String(req.body.email || "").trim().toLowerCase(), password = String(req.body.password || "");
  if (!validEmail(email) || !password || password.length > 128) return res.status(401).json({ error: "Email or password is incorrect." });
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer || !verifyPassword(password, customer.passwordHash)) return res.status(401).json({ error: "Email or password is incorrect." });
  setCustomerCookie(res, createCustomerSession(customer), CUSTOMER_SESSION_TTL_SECONDS);
  res.json({ authenticated: true, customer: { id: customer.id, email: customer.email, membershipPaidAt: customer.membershipPaidAt } });
});
app.get("/api/auth/session", async (req, res) => {
  const customer = await currentCustomer(req);
  if (!customer) return res.json({ authenticated: false });
  res.json({ authenticated: true, customer });
});
app.post("/api/auth/logout", (_req, res) => {
  setCustomerCookie(res, "", 0);
  res.json({ authenticated: false });
});
app.post("/api/membership/invoice", customerAuth, rateLimit({ windowMs: 60_000, limit: 3, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  if (req.customer.membershipPaidAt) return res.status(409).json({ error: "Membership is already active." });
  try {
    const pending = await prisma.order.findFirst({
      where: { customerId: req.customer.id, type: "MEMBERSHIP", status: { in: ["AWAITING_PAYMENT", "PAYMENT_SUBMITTED", "CONFIRMING"] } },
      include: { payment: true }, orderBy: { createdAt: "desc" }
    });
    if (pending?.payment) {
      return res.json({ order: publicOrder(pending), accessToken: pending.customerToken, membershipPriceUsd: 20, payment: { asset: "BTC", address: pending.payment.address, expectedAmount: pending.payment.expectedAmount, status: pending.payment.status, explorer: "https://mempool.space" } });
    }
    let btcUsdRate = BTC_USD_RATE;
    if (!btcUsdRate) {
      const quoteResponse = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", { signal: AbortSignal.timeout(8000) });
      if (!quoteResponse.ok) throw new Error("Live BTC/USD quote unavailable.");
      const quote = await quoteResponse.json();
      btcUsdRate = String(quote?.data?.amount || "");
    }
    if (!/^\d+(\.\d+)?$/.test(btcUsdRate) || Number(btcUsdRate) <= 0) throw new Error("Invalid BTC/USD quote.");
    const expectedAtomic = amountToAtomic(2000, btcUsdRate, 8).toString();
    const expectedAmount = formatAtomic(expectedAtomic, 8, 8);
    const accessToken = randomToken();
    const orderNumber = "SHR-MEM-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const order = await prisma.order.create({ data: {
      orderNumber, customerEmail: req.customer.email, customerToken: accessToken,
      customerId: req.customer.id, type: "MEMBERSHIP", totalNgn: 0, status: "AWAITING_PAYMENT",
      payment: { create: { asset: "BTC", address: BTC_ADDRESS, expectedAtomic, expectedAmount, status: "AWAITING_PAYMENT" } }
    }, include: { payment: true } });
    res.status(201).json({ order: publicOrder(order), accessToken, membershipPriceUsd: 20, payment: { asset: "BTC", address: BTC_ADDRESS, expectedAmount, status: order.payment.status, explorer: "https://mempool.space" } });
  } catch (err) {
    console.error("Membership invoice error:", err.message);
    res.status(500).json({ error: "Could not create membership invoice." });
  }
});

app.get("/api/products", customerAuth, async (req, res) => {
  const fullMember = Boolean(req.customer.membershipPaidAt);
  const products = await prisma.product.findMany({ where: { active: true }, orderBy: { sku: "asc" }, take: fullMember ? undefined : 2, select: { sku: true, name: true, description: true, priceNgn: true, fulfillmentMode: true } });
  res.json({ products: products.map(p => ({ ...p, priceNgn: p.priceNgn / 100 })), membershipRequired: !fullMember, membershipPaidAt: req.customer.membershipPaidAt || null });
});
app.post("/api/orders", customerAuth, rateLimit({ windowMs: 60_000, limit: 12 }), async (req, res) => {
  if (!req.customer.membershipPaidAt) return res.status(403).json({ error: "Full catalogue ordering requires verified $20 Bitcoin membership." });
  try {
    const email = req.customer.email;
    const asset = String(req.body.asset || "").toUpperCase();
    const items = req.body.items;
    if (!["BTC", "ETH"].includes(asset)) return res.status(400).json({ error: "Choose BTC or ETH." });
    if (!Array.isArray(items) || items.length < 1 || items.length > 20) return res.status(400).json({ error: "Cart is empty or invalid." });
    const catalog = await prisma.product.findMany({ where: { active: true, sku: { in: [...new Set(items.map(i => String(i.sku)))] } } });
    if (catalog.length !== new Set(items.map(i => String(i.sku))).size) return res.status(400).json({ error: "A product is unavailable." });
    const normalized = items.map(i => ({ sku: String(i.sku), quantity: Number(i.quantity) }));
    if (normalized.some(i => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 25)) return res.status(400).json({ error: "Invalid product quantity." });
    const totalNgn = normalized.reduce((sum, i) => sum + catalog.find(p => p.sku === i.sku).priceNgn * i.quantity, 0);
    const config = assets[asset];
    let baseAtomic;
    try { baseAtomic = amountToAtomic(totalNgn, config.rate, config.decimals); } catch { return res.status(503).json({ error: asset + " checkout is not configured. Contact support." }); }
    const orderNumber = "SHR-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    const accessToken = randomToken();
    // Small per-order increment enables matching shared-wallet deposits; the exact amount is shown before payment.
    const displayUnit = 10n ** BigInt(config.decimals - config.displayDecimals);
    const roundedBaseAtomic = (baseAtomic / displayUnit) * displayUnit;
    const offset = BigInt(crypto.randomInt(1, 1000)) * displayUnit;
    const expectedAtomic = (roundedBaseAtomic + offset).toString();
    const expectedAmount = formatAtomic(expectedAtomic, config.decimals, config.displayDecimals);
    const order = await prisma.order.create({ data: {
      orderNumber, customerEmail: email, customerToken: accessToken, totalNgn, status: "AWAITING_PAYMENT",
      items: { create: normalized.map(i => { const p = catalog.find(x => x.sku === i.sku); return { productSku: p.sku, productName: p.name, quantity: i.quantity, unitPriceNgn: p.priceNgn }; }) },
      payment: { create: { asset, address: config.address, expectedAtomic, expectedAmount, status: "AWAITING_PAYMENT" } }
    }, include: { payment: true } });
    res.status(201).json({ order: publicOrder(order), payment: { asset, address: config.address, expectedAmount, status: order.payment.status, explorer: asset === "BTC" ? "https://mempool.space" : "https://etherscan.io" }, accessToken });
  } catch (err) { console.error(err); res.status(500).json({ error: "Could not create order." }); }
});
app.post("/api/orders/:id/transaction", rateLimit({ windowMs: 60_000, limit: 10 }), async (req, res) => {
  const token = req.get("x-order-token");
  const txHash = String(req.body.txHash || "").trim();
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { payment: true } });
  if (!order || !token || !crypto.timingSafeEqual(Buffer.from(order.customerToken), Buffer.from(token.padEnd(order.customerToken.length).slice(0, order.customerToken.length))) || token.length !== order.customerToken.length) return res.status(404).json({ error: "Order not found." });
  if (order.payment.status === "PAID" || order.status === "FULFILLED") return res.json({ status: order.status, message: "Payment already verified." });
  const valid = order.payment.asset === "BTC" ? /^[0-9a-fA-F]{64}$/.test(txHash) : /^0x[0-9a-fA-F]{64}$/.test(txHash);
  if (!valid) return res.status(400).json({ error: "Enter a valid transaction hash for the selected network." });
  try {
    const updated = await prisma.cryptoPayment.update({ where: { id: order.payment.id }, data: { txHash, status: "SUBMITTED", confirmations: 0, lastCheckedAt: null } });
    await prisma.order.update({ where: { id: order.id }, data: { status: "PAYMENT_SUBMITTED" } });
    await checkPayment(updated.id);
    const fresh = await prisma.order.findUnique({ where: { id: order.id }, include: { payment: true } });
    res.json({ status: fresh.status, paymentStatus: fresh.payment.status, confirmations: fresh.payment.confirmations, requiredConfirmations: fresh.payment.asset === "BTC" ? BTC_CONFIRMATIONS : ETH_CONFIRMATIONS, message: "Transaction recorded. Verification uses live blockchain data; this page does not treat a submitted hash as proof of payment." });
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "That transaction hash has already been submitted for another order." });
    console.error(err); res.status(500).json({ error: "Could not submit transaction hash." });
  }
});
app.get("/api/orders/:id/status", async (req, res) => {
  const token = req.get("x-order-token") || String(req.query.token || "");
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { payment: true } });
  if (!order || !token || token.length !== order.customerToken.length || !crypto.timingSafeEqual(Buffer.from(order.customerToken), Buffer.from(token))) return res.status(404).json({ error: "Order not found." });
  res.json({ order: publicOrder(order), payment: { asset: order.payment.asset, status: order.payment.status, confirmations: order.payment.confirmations, requiredConfirmations: order.payment.asset === "BTC" ? BTC_CONFIRMATIONS : ETH_CONFIRMATIONS, expectedAmount: order.payment.expectedAmount, txHash: order.payment.txHash } });
});
app.post("/api/admin/login", rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: true, legacyHeaders: false }), (req, res) => {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD || ADMIN_SESSION_SECRET.length < 32) {
    return res.status(503).json({ error: "Admin login is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD and a 32+ character ADMIN_SESSION_SECRET in Render." });
  }
  const username = String(req.body.username || "");
  const password = String(req.body.password || "");
  if (!safeEqualText(username, ADMIN_USERNAME) || !safeEqualText(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }
  const payload = Buffer.from(JSON.stringify({ username: ADMIN_USERNAME, exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS })).toString("base64url");
  const token = payload + "." + signAdminPayload(payload);
  setAdminCookie(res, token, ADMIN_SESSION_TTL_SECONDS);
  res.json({ authenticated: true, username: ADMIN_USERNAME });
});
app.get("/api/admin/session", (req, res) => {
  if (!validAdminSession(req)) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, username: ADMIN_USERNAME });
});
app.post("/api/admin/logout", (_req, res) => {
  setAdminCookie(res, "", 0);
  res.json({ authenticated: false });
});
app.get("/api/admin/products", admin, async (_req, res) => {
  const products = await prisma.product.findMany({ orderBy: { sku: "asc" } });
  res.json({ products: products.map(p => ({ ...p, priceNgn: p.priceNgn / 100 })) });
});
app.patch("/api/admin/products/:sku", admin, async (req, res) => {
  const data = {};
  if (req.body.priceNgn !== undefined) {
    const price = Number(req.body.priceNgn);
    if (!Number.isFinite(price) || price <= 0 || price > 100000000) return res.status(400).json({ error: "Invalid product price." });
    data.priceNgn = Math.round(price * 100);
  }
  if (req.body.active !== undefined) {
    if (typeof req.body.active !== "boolean") return res.status(400).json({ error: "active must be a boolean." });
    data.active = req.body.active;
  }
  if (req.body.fulfillmentMode !== undefined) {
    if (!["AUTO", "MANUAL"].includes(req.body.fulfillmentMode)) return res.status(400).json({ error: "fulfillmentMode must be AUTO or MANUAL." });
    data.fulfillmentMode = req.body.fulfillmentMode;
  }
  if (req.body.name !== undefined) data.name = String(req.body.name).trim().slice(0, 120);
  if (req.body.description !== undefined) data.description = String(req.body.description).trim().slice(0, 1000);
  if (!Object.keys(data).length) return res.status(400).json({ error: "No valid product fields supplied." });
  try {
    const product = await prisma.product.update({ where: { sku: req.params.sku }, data });
    res.json({ product: { ...product, priceNgn: product.priceNgn / 100 } });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Product not found." });
    throw err;
  }
});
app.get("/api/admin/orders", admin, async (_req, res) => {
  const orders = await prisma.order.findMany({ include: { items: true, payment: true }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ orders: orders.map(({ customerToken, ...order }) => order) });
});
app.patch("/api/admin/orders/:id/fulfill", admin, async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { payment: true } });
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (!["PAID", "FULFILLMENT_PENDING"].includes(order.status)) return res.status(409).json({ error: "Only blockchain-verified paid orders can be fulfilled." });
  const updated = await prisma.order.update({ where: { id: order.id }, data: { status: "FULFILLED", fulfilledAt: new Date(), fulfillmentNote: String(req.body.note || "").slice(0, 1000) } });
  await prisma.cryptoPayment.update({ where: { id: order.payment.id }, data: { status: "FULFILLED" } });
  res.json({ order: publicOrder(updated) });
});
app.patch("/api/admin/orders/:id/review", admin, async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { payment: true } });
  if (!order) return res.status(404).json({ error: "Order not found." });
  const updated = await prisma.order.update({ where: { id: order.id }, data: { status: "PAYMENT_REVIEW", fulfillmentNote: String(req.body.note || "Admin review").slice(0, 1000) } });
  await prisma.cryptoPayment.update({ where: { id: order.payment.id }, data: { status: "REVIEW" } });
  res.json({ order: publicOrder(updated) });
});
app.get("/hosting", (_req, res) => res.sendFile(path.join(__dirname, "hosting.html")));
app.get("/servers", (_req, res) => res.sendFile(path.join(__dirname, "servers.html")));
app.get("/email", (_req, res) => res.sendFile(path.join(__dirname, "email.html")));
app.get("/media", (_req, res) => res.sendFile(path.join(__dirname, "media.html")));
app.get("/pricing", (_req, res) => res.sendFile(path.join(__dirname, "pricing.html")));
app.get("/support", (_req, res) => res.sendFile(path.join(__dirname, "support.html")));
app.get("/dashboard", (_req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/deposit", (_req, res) => res.sendFile(path.join(__dirname, "deposit.html")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: "Unexpected server error." }); });

async function main() {
  await prisma.$connect();
  for (const p of seedProducts) await prisma.product.upsert({ where: { sku: p.sku }, update: {}, create: p });
  app.listen(PORT, () => console.log("Shadowrealm listening on " + PORT));
  setInterval(async () => {
    const pending = await prisma.cryptoPayment.findMany({ where: { txHash: { not: null }, status: { in: ["SUBMITTED", "CONFIRMING"] } }, select: { id: true }, take: 100 });
    for (const p of pending) await checkPayment(p.id);
  }, 20_000).unref();
}
main().catch(err => { console.error("Startup failed:", err); process.exit(1); });

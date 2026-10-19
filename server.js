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
const ETH_RATE = process.env.ETH_NGN_RATE || "";
const BTC_CONFIRMATIONS = Number(process.env.BTC_REQUIRED_CONFIRMATIONS || 2);
const ETH_CONFIRMATIONS = Number(process.env.ETH_REQUIRED_CONFIRMATIONS || 12);
const ETH_RPC_URL = process.env.ETH_RPC_URL || "";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "";
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

function admin(req, res, next) {
  if (!ADMIN_API_KEY || req.get("x-admin-key") !== ADMIN_API_KEY) return res.status(401).json({ error: "Unauthorized admin request." });
  next();
}
function amountToAtomic(ngn, rate, decimals) {
  if (!rate || !/^\d+(\.\d+)?$/.test(rate) || Number(rate) <= 0) throw new Error("Crypto rate is not configured.");
  const [whole, fraction = ""] = rate.split(".");
  const scale = 10n ** BigInt(decimals);
  const rateScaled = BigInt(whole) * scale + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
  if (rateScaled <= 0n) throw new Error("Invalid crypto rate.");
  return (BigInt(ngn) * scale * scale) / (rateScaled * 100n);
}
function formatAtomic(atomic, decimals) {
  const n = BigInt(atomic), scale = 10n ** BigInt(decimals);
  const whole = n / scale, frac = (n % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? whole.toString() + "." + frac : whole.toString();
}
function randomToken() { return crypto.randomBytes(32).toString("hex"); }
function publicOrder(order) {
  return { id: order.id, orderNumber: order.orderNumber, status: order.status, totalNgn: order.totalNgn / 100, createdAt: order.createdAt };
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
    if (paymentStatus === "PAID") await tryAutoFulfillment(payment.orderId);
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

app.get("/api/health", (_req, res) => res.json({ ok: true, databaseConfigured: Boolean(process.env.DATABASE_URL), crypto: { BTC: Boolean(BTC_RATE), ETH: Boolean(ETH_RATE && ETH_RPC_URL) } }));
app.get("/api/products", async (_req, res) => {
  const products = await prisma.product.findMany({ where: { active: true }, orderBy: { sku: "asc" }, select: { sku: true, name: true, description: true, priceNgn: true, fulfillmentMode: true } });
  res.json({ products: products.map(p => ({ ...p, priceNgn: p.priceNgn / 100 })) });
});
app.post("/api/orders", rateLimit({ windowMs: 60_000, limit: 12 }), async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const asset = String(req.body.asset || "").toUpperCase();
    const items = req.body.items;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
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
    const offset = BigInt(crypto.randomInt(1, 1000));
    const expectedAtomic = (baseAtomic + offset).toString();
    const expectedAmount = formatAtomic(expectedAtomic, config.decimals);
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
app.get("/api/admin/orders", admin, async (_req, res) => {
  const orders = await prisma.order.findMany({ include: { items: true, payment: true }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ orders });
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
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
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

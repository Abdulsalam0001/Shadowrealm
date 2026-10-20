import http from "node:http";

const INTERVAL_MS = Math.max(30_000, Number(process.env.MONITOR_INTERVAL_MS || 60_000));
const TIMEOUT_MS = Math.max(3_000, Number(process.env.MONITOR_TIMEOUT_MS || 12_000));
const FAILURES_TO_ALERT = Math.max(1, Number(process.env.MONITOR_FAILURES_TO_ALERT || 2));
const RECOVERY_SUCCESSES = Math.max(1, Number(process.env.MONITOR_RECOVERY_SUCCESSES || 1));
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const DEFAULT_TARGETS = [
  "https://bennythedealer.org/",
  "https://shop.bennythedealer.org/",
  "https://shadowrealm-yj6v.onrender.com/api/health"
];
const targetUrls = (process.env.MONITOR_TARGETS || DEFAULT_TARGETS.join(","))
  .split(",").map(value => value.trim()).filter(Boolean);

function parseTargets(values) {
  return values.map(value => {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("Monitor targets must use HTTP or HTTPS.");
    return { url: url.toString(), label: url.hostname + (url.pathname === "/" ? "" : url.pathname) };
  });
}
const targets = parseTargets(targetUrls);
const state = new Map(targets.map(target => [target.url, {
  failures: 0, successes: 0, down: false, lastStatus: null, lastError: null, lastCheckedAt: null
}]));
let isChecking = false;

function log(event, details = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...details }));
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new Error("Alert destination returned HTTP " + response.status);
}

async function sendAlert(message) {
  const tasks = [];
  if (DISCORD_WEBHOOK_URL) {
    tasks.push(postJson(DISCORD_WEBHOOK_URL, { content: message }).then(
      () => log("alert_sent", { channel: "discord" }),
      error => log("alert_failed", { channel: "discord", error: error.message })
    ));
  }
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    const url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage";
    tasks.push(postJson(url, { chat_id: TELEGRAM_CHAT_ID, text: message, disable_web_page_preview: true }).then(
      () => log("alert_sent", { channel: "telegram" }),
      error => log("alert_failed", { channel: "telegram", error: error.message })
    ));
  }
  if (tasks.length === 0) {
    log("alert_not_configured", { message: "Set DISCORD_WEBHOOK_URL or TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Render." });
    return;
  }
  await Promise.all(tasks);
}

async function checkTarget(target) {
  const item = state.get(target.url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(target.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Shadowrealm-Uptime-Monitor/1.0", "cache-control": "no-cache" }
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    // Consume only a small amount of response data; status code is the primary probe.
    if (response.body) await response.body.cancel().catch(() => {});
    item.failures = 0;
    item.successes += 1;
    item.lastStatus = response.status;
    item.lastError = null;
    item.lastCheckedAt = new Date().toISOString();
    if (item.down && item.successes >= RECOVERY_SUCCESSES) {
      item.down = false;
      log("target_recovered", { target: target.label, status: response.status });
      await sendAlert("✅ RECOVERED: " + target.label + " is responding again (HTTP " + response.status + "). Checked " + item.lastCheckedAt);
    } else {
      log("target_ok", { target: target.label, status: response.status });
    }
  } catch (error) {
    item.successes = 0;
    item.failures += 1;
    item.lastError = error.name === "AbortError" ? "Request timed out" : error.message;
    item.lastStatus = null;
    item.lastCheckedAt = new Date().toISOString();
    log("target_failure", { target: target.label, failures: item.failures, error: item.lastError });
    if (!item.down && item.failures >= FAILURES_TO_ALERT) {
      item.down = true;
      await sendAlert("🚨 OUTAGE: " + target.label + " failed " + item.failures + " consecutive checks. Latest error: " + item.lastError + ". Checked " + item.lastCheckedAt);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function runChecks() {
  if (isChecking) return;
  isChecking = true;
  try {
    await Promise.all(targets.map(checkTarget));
  } finally {
    isChecking = false;
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    const allHealthy = [...state.values()].every(item => !item.down);
    res.writeHead(allHealthy ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({
      ok: allHealthy,
      monitor: "shadowrealm-uptime-monitor",
      checkedAt: new Date().toISOString(),
      targets: targets.map(target => {
        const item = state.get(target.url);
        return { target: target.label, down: item.down, failures: item.failures, lastStatus: item.lastStatus, lastError: item.lastError, lastCheckedAt: item.lastCheckedAt };
      })
    }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const PORT = Number(process.env.PORT || 10000);
server.listen(PORT, "0.0.0.0", () => {
  log("monitor_started", {
    port: PORT, intervalMs: INTERVAL_MS, timeoutMs: TIMEOUT_MS,
    failureThreshold: FAILURES_TO_ALERT, targets: targets.map(target => target.label),
    alertChannels: [DISCORD_WEBHOOK_URL ? "discord" : null, TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID ? "telegram" : null].filter(Boolean)
  });
  if (!DISCORD_WEBHOOK_URL && !(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID)) {
    log("warning", { message: "No alert channel configured; outages will be logged but not sent externally." });
  }
  void runChecks();
  setInterval(() => void runChecks(), INTERVAL_MS);
});

function shutdown(signal) {
  log("monitor_shutdown", { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

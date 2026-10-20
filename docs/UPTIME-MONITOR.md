# Shadowrealm / Benny Uptime Monitor

## Purpose

A separate, continuously running Node.js service checks the Benny homepage, Shadowrealm shop subdomain, and the existing Render origin's health endpoint. It alerts on a confirmed outage and sends a recovery notification. It does not touch the Shadowrealm database, authentication, orders, crypto verification, or fulfilment.

## Deployment model

Deploy this monitor as a **separate Render web service** from the same repository and the dedicated `shadowrealm-uptime-monitor` branch. Do not change the existing Shadowrealm web service's start command or deploy this monitor over it.

- Runtime: Node
- Build command: `npm install`
- Start command: `node scripts/uptime-monitor.js`
- Plan: a paid always-on plan (for example, Starter); a free instance may sleep and is not appropriate for continuous monitoring.
- Health endpoint: `/healthz`
- Recommended interval: 60 seconds
- Request timeout: 12 seconds
- Alert threshold: 2 consecutive failures per target

The process includes a tiny HTTP server so Render can health-check it. It checks targets concurrently, avoids overlapping check cycles, logs structured JSON, and remembers outages in process memory so it only alerts on the transition to DOWN and again on recovery. A process restart resets the in-memory incident state.

## Default targets

- `https://bennythedealer.org/`
- `https://shop.bennythedealer.org/`
- `https://shadowrealm-yj6v.onrender.com/api/health`

Override with `MONITOR_TARGETS`, a comma-separated list of HTTP(S) URLs. The monitor considers a successful HTTP response in the 200–399 range healthy. It checks reachability and HTTP response status, not checkout correctness or database writes.

## Environment variables

Configure these in the **monitor service only**. Do not add them to the existing store service or commit secrets.

| Variable | Default | Purpose |
|---|---:|---|
| `MONITOR_INTERVAL_MS` | `60000` | Delay between checks; minimum enforced 30 seconds |
| `MONITOR_TIMEOUT_MS` | `12000` | Per-target request timeout |
| `MONITOR_FAILURES_TO_ALERT` | `2` | Consecutive failures before outage alert |
| `MONITOR_RECOVERY_SUCCESSES` | `1` | Successful checks before recovery alert |
| `MONITOR_TARGETS` | Three URLs above | Comma-separated targets |
| `DISCORD_WEBHOOK_URL` | unset | Optional Discord incoming webhook for alerts |
| `TELEGRAM_BOT_TOKEN` | unset | Optional Telegram bot token |
| `TELEGRAM_CHAT_ID` | unset | Chat/group receiving Telegram alerts |

Configure either Discord or both Telegram variables. Both channels may be enabled. Without a channel, the service logs warnings but cannot send an external alert. Treat webhook URLs and bot tokens as credentials.

## Cloud setup and smoke test

1. Create the separate monitor service in the confirmed Render workspace using the settings above.
2. Set at least one alert channel's secret variables.
3. Deploy the `shadowrealm-uptime-monitor` branch.
4. Open the service's `/healthz` endpoint. It returns JSON listing each target's latest status; it returns HTTP 503 while a target has an active DOWN state.
5. Verify Render logs show `monitor_started` and `target_ok` events.
6. Test alert delivery using a private, temporary test endpoint or a deliberately invalid test target in a non-production monitor configuration. Do not disrupt the production domains to test alerts.
7. Confirm both outage and recovery notifications arrive before relying on the monitor.

## Limitations and operational notes

- The monitor is a reachability/status-code monitor, not a full end-to-end test of sign-in, payments, or order fulfilment.
- State is in memory. After a monitor restart, an ongoing outage may need to fail twice again before an alert is sent. A durable incident store would be a separate enhancement.
- Render can restart or deploy services; configure a paid always-on plan and use the service health check for the monitor itself.
- Do not configure the monitor to call a private/local network URL. Keep targets to intended public endpoints.
- No service is literally guaranteed to be online 100% of the time. This setup provides continuous checks while the monitor service is running, plus failure/recovery alerts.

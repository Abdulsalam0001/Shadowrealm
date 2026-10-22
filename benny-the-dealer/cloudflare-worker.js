/**
 * Cloudflare Worker for Benny the Dealer + Shadowrealm.
 *
 * Attach this Worker to these proxied routes:
 *   bennythedealer.org/*
 *   www.bennythedealer.org/*
 *   shop.bennythedealer.org/*
 *
 * The only upstream is the existing Shadowrealm Render service.
 * No database, payment, or backend configuration is changed here.
 */
const ORIGIN = "https://shadowrealm-yj6v.onrender.com";
const BENNY_HOSTS = new Set(["bennythedealer.org", "www.bennythedealer.org"]);
const SHADOWREALM_HOSTS = new Set(["shop.bennythedealer.org"]);

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const host = incoming.hostname.toLowerCase();

    if (!BENNY_HOSTS.has(host) && !SHADOWREALM_HOSTS.has(host)) {
      return new Response("Unknown host", { status: 404 });
    }

    const upstream = new URL(ORIGIN);
    upstream.search = incoming.search;

    if (SHADOWREALM_HOSTS.has(host)) {
      // Shadowrealm storefront: preserve its original paths and query string.
      upstream.pathname = incoming.pathname;
    } else if (incoming.pathname === "/api" || incoming.pathname.startsWith("/api/")) {
      // Keep existing API routes intact for Benny pages that call the API.
      upstream.pathname = incoming.pathname;
    } else {
      // Benny domain: serve the static storefront from the existing /benny mount.
      const path = incoming.pathname === "/" ? "/" : incoming.pathname;
      upstream.pathname = path === "/" ? "/benny/" : "/benny" + path;
    }

    // Rebuild the request against the fixed, trusted origin. The browser-visible
    // URL stays on the requested Benny/Shop hostname.
    const headers = new Headers(request.headers);
    headers.delete("host");
    const init = {
      method: request.method,
      headers,
      redirect: "manual"
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    return fetch(new Request(upstream.toString(), init));
  }
};

const ALLOWED_HOSTS = new Set([
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "api.coingecko.com",
  "fred.stlouisfed.org",
  "api.binance.com",
  "stooq.com",
  "www.stooq.com",
  "api.alternative.me",
  "api.blockchain.info",
  "blockchain.info",
  "charts.bgeometrics.com",
  "bitcoin-data.com",
  "financialmodelingprep.com",
  "api.financialmodelingprep.com",
  "www.reddit.com",
  "reddit.com",
  "news.google.com",
  "feeds.reuters.com",
  "feeds.bbci.co.uk",
  "www.cnbc.com",
  "federalreserve.gov",
  "www.federalreserve.gov",
  "www.ecb.europa.eu",
  "www.coindesk.com",
  "cointelegraph.com",
]);

const MAX_CACHE_ENTRIES = 400;
const responseCache = new Map();
const inflight = new Map();
const hostCooldownUntil = new Map();
const hostNextAllowedAt = new Map();
const YAHOO_MIN_GAP_MS = 1200;

function pickFirst(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function now() {
  return Date.now();
}

function trimCacheIfNeeded() {
  if (responseCache.size <= MAX_CACHE_ENTRIES) return;
  const entries = Array.from(responseCache.entries()).sort((a, b) => (a[1]?.updatedAt ?? 0) - (b[1]?.updatedAt ?? 0));
  const removeCount = Math.ceil(MAX_CACHE_ENTRIES * 0.2);
  for (let i = 0; i < removeCount && i < entries.length; i += 1) {
    responseCache.delete(entries[i][0]);
  }
}

function getTtlsForTarget(target) {
  const host = target.host;
  const pathname = target.pathname;
  if (host.includes("finance.yahoo.com")) {
    if (pathname.includes("/finance/search")) return { freshMs: 30_000, staleMs: 10 * 60_000 };
    if (pathname.includes("/screener/")) return { freshMs: 45_000, staleMs: 15 * 60_000 };
    if (pathname.includes("/finance/quote")) return { freshMs: 20_000, staleMs: 10 * 60_000 };
    if (pathname.includes("/finance/chart")) return { freshMs: 60_000, staleMs: 30 * 60_000 };
    return { freshMs: 30_000, staleMs: 10 * 60_000 };
  }
  if (host === "api.coingecko.com") return { freshMs: 15_000, staleMs: 15 * 60_000 };
  if (host === "fred.stlouisfed.org") return { freshMs: 60_000, staleMs: 60 * 60_000 };
  if (host === "api.binance.com") return { freshMs: 8_000, staleMs: 3 * 60_000 };
  if (host.includes("financialmodelingprep.com")) return { freshMs: 25_000, staleMs: 20 * 60_000 };
  if (host.endsWith("reddit.com")) return { freshMs: 45_000, staleMs: 20 * 60_000 };
  return { freshMs: 15_000, staleMs: 5 * 60_000 };
}

function yahooMirrorUrl(target) {
  if (target.host === "query1.finance.yahoo.com") {
    const mirror = new URL(target.toString());
    mirror.host = "query2.finance.yahoo.com";
    return mirror.toString();
  }
  if (target.host === "query2.finance.yahoo.com") {
    const mirror = new URL(target.toString());
    mirror.host = "query1.finance.yahoo.com";
    return mirror.toString();
  }
  return "";
}

function sendCached(res, cached, reason) {
  res.setHeader("Content-Type", cached.contentType || "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=120");
  res.setHeader("X-Proxy-Cache", reason);
  res.status(200).send(cached.body);
}

function setSyntheticJsonCache(cacheKey, body, freshMs, staleMs) {
  const ts = now();
  responseCache.set(cacheKey, {
    body,
    contentType: "application/json; charset=utf-8",
    updatedAt: ts,
    freshUntil: ts + freshMs,
    staleUntil: ts + staleMs,
  });
  trimCacheIfNeeded();
}

function isYahooHost(host) {
  return host === "query1.finance.yahoo.com" || host === "query2.finance.yahoo.com";
}

function parseRetryAfterMs(retryAfterValue) {
  if (!retryAfterValue) return 0;
  const asInt = Number.parseInt(String(retryAfterValue), 10);
  if (Number.isFinite(asInt) && asInt > 0) return asInt * 1000;
  const asDateMs = Date.parse(String(retryAfterValue));
  if (Number.isFinite(asDateMs)) {
    const delta = asDateMs - Date.now();
    return delta > 0 ? delta : 0;
  }
  return 0;
}

function canonicalizeTarget(urlObj) {
  const target = new URL(urlObj.toString());
  if (isYahooHost(target.host) && target.pathname.includes("/v7/finance/quote")) {
    const rawSymbols = target.searchParams.get("symbols") || "";
    if (rawSymbols) {
      const symbols = Array.from(
        new Set(
          rawSymbols
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        )
      ).sort();
      target.searchParams.set("symbols", symbols.join(","));
    }
  }
  if (target.host === "financialmodelingprep.com" && target.pathname.includes("/api/v3/quote/")) {
    const prefix = "/api/v3/quote/";
    const raw = decodeURIComponent(target.pathname.slice(prefix.length));
    const symbols = Array.from(
      new Set(
        raw
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      )
    ).sort();
    target.pathname = `${prefix}${encodeURIComponent(symbols.join(","))}`;
  }
  if ((target.host === "financialmodelingprep.com" || target.host === "api.financialmodelingprep.com") && !target.searchParams.get("apikey")) {
    const serverKey = process.env.FMP_API_KEY || process.env.EXPO_PUBLIC_FMP_API_KEY || "";
    if (serverKey) target.searchParams.set("apikey", serverKey);
  }
  const entries = Array.from(target.searchParams.entries()).sort((a, b) => {
    if (a[0] === b[0]) return a[1].localeCompare(b[1]);
    return a[0].localeCompare(b[0]);
  });
  target.search = "";
  for (const [k, v] of entries) target.searchParams.append(k, v);
  return target;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const rawUrl = pickFirst(req.query.url);
  if (!rawUrl) {
    res.status(400).json({ error: "missing_url" });
    return;
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "invalid_url" });
    return;
  }

  if (target.protocol !== "https:") {
    res.status(400).json({ error: "https_only" });
    return;
  }

  if (!ALLOWED_HOSTS.has(target.host)) {
    res.status(403).json({ error: "host_not_allowed" });
    return;
  }

  target = canonicalizeTarget(target);
  const cacheKey = target.toString();
  const cached = responseCache.get(cacheKey);
  const currentTs = now();
  if (cached && currentTs <= cached.freshUntil) {
    sendCached(res, cached, "hit");
    return;
  }

  const cooldownUntil = hostCooldownUntil.get(target.host) || 0;
  if (isYahooHost(target.host) && cooldownUntil > currentTs) {
    const fallback = responseCache.get(cacheKey);
    if (fallback && currentTs <= fallback.staleUntil) {
      sendCached(res, fallback, "cooldown-stale");
      return;
    }
    // Keep clients responsive during cooldown windows instead of propagating 429s.
    setSyntheticJsonCache(cacheKey, "{}", 7_000, 45_000);
    sendCached(res, responseCache.get(cacheKey), "cooldown-empty");
    return;
  }

  const pending = inflight.get(cacheKey);
  if (pending) {
    try {
      const settled = await pending;
      if (settled?.ok) {
        sendCached(res, settled.payload, "join");
        return;
      }
      if (cached && currentTs <= cached.staleUntil) {
        sendCached(res, cached, "join-stale");
        return;
      }
    } catch {}
  }

  const nextAllowed = hostNextAllowedAt.get(target.host) || 0;
  if (isYahooHost(target.host) && nextAllowed > currentTs) {
    if (cached && currentTs <= cached.staleUntil) {
      sendCached(res, cached, "throttled-stale");
      return;
    }
  }

  const run = (async () => {
    const ttls = getTtlsForTarget(target);
    if (isYahooHost(target.host)) {
      hostNextAllowedAt.set(target.host, now() + YAHOO_MIN_GAP_MS);
    }
    const upstream = await fetch(target.toString(), {
      headers: {
        Accept: req.headers.accept || "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        // Browser-like UA avoids upstream anti-bot false positives.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });

    let body = await upstream.text();
    let contentType = upstream.headers.get("content-type") || "text/plain; charset=utf-8";
    let retryAfter = upstream.headers.get("retry-after");
    let status = upstream.status;

    if (!upstream.ok && target.host.includes("finance.yahoo.com")) {
      const mirrorUrl = yahooMirrorUrl(target);
      if (mirrorUrl) {
        const mirrorRes = await fetch(mirrorUrl, {
          headers: {
            Accept: req.headers.accept || "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          },
          redirect: "follow",
        });
        if (mirrorRes.ok) {
          body = await mirrorRes.text();
          contentType = mirrorRes.headers.get("content-type") || contentType;
          retryAfter = mirrorRes.headers.get("retry-after") || retryAfter;
          status = mirrorRes.status;
        }
      }
    }

    if (status >= 200 && status < 300) {
      const payload = {
        body,
        contentType,
        updatedAt: now(),
        freshUntil: now() + ttls.freshMs,
        staleUntil: now() + ttls.staleMs,
      };
      responseCache.set(cacheKey, payload);
      trimCacheIfNeeded();
      return { ok: true, payload, retryAfter };
    }

    if (status === 429 && isYahooHost(target.host)) {
      const retryAfterMs = parseRetryAfterMs(retryAfter);
      const cooldownMs = Math.max(45_000, Math.min(5 * 60_000, retryAfterMs || 90_000));
      hostCooldownUntil.set(target.host, now() + cooldownMs);
    }

    return { ok: false, status, body, contentType, retryAfter };
  })();

  inflight.set(cacheKey, run);
  try {
    const result = await run;
    if (result?.ok) {
      if (result.retryAfter) res.setHeader("Retry-After", result.retryAfter);
      sendCached(res, result.payload, "miss");
      return;
    }

    const fallback = responseCache.get(cacheKey);
    if (fallback && now() <= fallback.staleUntil) {
      sendCached(res, fallback, "stale-fallback");
      return;
    }

    if (result?.status === 429 && isYahooHost(target.host)) {
      setSyntheticJsonCache(cacheKey, "{}", 7_000, 45_000);
      sendCached(res, responseCache.get(cacheKey), "rate-limited-empty");
      return;
    }

    if (result?.retryAfter) res.setHeader("Retry-After", result.retryAfter);
    res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=60");
    res.setHeader("Content-Type", result?.contentType || "application/json; charset=utf-8");
    res.status(result?.status || 502).send(result?.body || JSON.stringify({ error: "upstream_error" }));
  } catch {
    const fallback = responseCache.get(cacheKey);
    if (fallback && now() <= fallback.staleUntil) {
      sendCached(res, fallback, "exception-stale");
      return;
    }
    res.status(502).json({ error: "upstream_fetch_failed" });
  } finally {
    inflight.delete(cacheKey);
  }
};

const ALLOWED_HOSTS = new Set([
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "api.coingecko.com",
  "fred.stlouisfed.org",
  "api.binance.com",
]);

function pickFirst(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
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

  try {
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

    const body = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "text/plain; charset=utf-8";
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter) res.setHeader("Retry-After", retryAfter);
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=120");
    res.setHeader("Content-Type", contentType);
    res.status(upstream.status).send(body);
  } catch {
    res.status(502).json({ error: "upstream_fetch_failed" });
  }
};

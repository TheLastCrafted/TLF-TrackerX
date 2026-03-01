import { fetchWithWebProxy } from "./web-proxy";

export type NewsCategory = "crypto" | "global" | "stocks" | "macro";

export type NewsArticle = {
  id: string;
  category: NewsCategory;
  title: string;
  source: string;
  link: string;
  pubDate: string;
  summary: string;
  contentHtml: string;
  images: string[];
};

type RedditChild = {
  data?: {
    id?: string;
    title?: string;
    selftext?: string;
    permalink?: string;
    url?: string;
    created_utc?: number;
    subreddit_name_prefixed?: string;
    thumbnail?: string;
    preview?: {
      images?: {
        source?: { url?: string; width?: number; height?: number };
        resolutions?: { url?: string; width?: number; height?: number }[];
      }[];
    };
    media_metadata?: Record<
      string,
      {
        s?: { u?: string };
      }
    >;
  };
};

type RedditListing = {
  data?: {
    children?: RedditChild[];
  };
};

type FeedSource =
  | { kind: "reddit"; url: string; source?: string }
  | { kind: "rss"; url: string; source?: string };

const FEED_TIMEOUT_MS = 2600;
const NEWS_CACHE_TTL_MS = 45_000;
const CATEGORY_CACHE = new Map<NewsCategory, { expiresAt: number; rows: NewsArticle[] }>();

const PAYWALL_HOST_BLOCKLIST = [
  "wsj.com",
  "barrons.com",
  "ft.com",
  "bloomberg.com",
  "economist.com",
  "theinformation.com",
  "seekingalpha.com",
  "marketwatch.com",
  "nytimes.com",
  "washingtonpost.com",
  "thetimes.co.uk",
  "telegraph.co.uk",
  "handelsblatt.com",
  "faz.net",
  "nikkei.com",
  "scmp.com",
];

const PAYWALL_TITLE_HINTS = [
  "subscriber-only",
  "subscribers only",
  "subscription required",
  "for subscribers",
  "premium content",
  "member-only",
  "members only",
  "paywall",
];

const SOURCE_NAME_BLOCKLIST = [
  "times of india",
  "semafor",
  "simple flying",
  "the street",
  "newsbreak",
  "the mirror",
  "daily express",
];

const SOURCE_HOST_BLOCKLIST = [
  "timesofindia.indiatimes.com",
  "semafor.com",
  "simpleflying.com",
  "newsbreak.com",
  "mirror.co.uk",
  "express.co.uk",
];

const IMAGE_HOST_BLOCKLIST = [
  "google.com",
  "news.google.com",
  "gstatic.com",
  "googleusercontent.com",
  "googlesyndication.com",
];

const FEEDS: Record<NewsCategory, FeedSource[]> = {
  crypto: [
    { kind: "rss", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
    { kind: "rss", url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
    { kind: "reddit", url: "https://www.reddit.com/r/CryptoCurrency/new.json?limit=24" },
    { kind: "reddit", url: "https://www.reddit.com/r/CryptoMarkets/new.json?limit=24" },
    { kind: "reddit", url: "https://www.reddit.com/r/Bitcoin/new.json?limit=18" },
  ],
  global: [
    { kind: "rss", url: "https://feeds.reuters.com/Reuters/worldNews", source: "Reuters/World" },
    { kind: "rss", url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC/World" },
    { kind: "reddit", url: "https://www.reddit.com/r/worldnews/new.json?limit=24" },
    { kind: "reddit", url: "https://www.reddit.com/r/geopolitics/new.json?limit=24" },
    { kind: "reddit", url: "https://www.reddit.com/r/internationalpolitics/new.json?limit=18" },
  ],
  stocks: [
    { kind: "rss", url: "https://feeds.reuters.com/reuters/businessNews", source: "Reuters/Business" },
    { kind: "rss", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC/Markets" },
    { kind: "reddit", url: "https://www.reddit.com/r/stocks/new.json?limit=24" },
    { kind: "reddit", url: "https://www.reddit.com/r/investing/new.json?limit=18" },
    { kind: "reddit", url: "https://www.reddit.com/r/options/new.json?limit=18" },
  ],
  macro: [
    { kind: "rss", url: "https://feeds.reuters.com/reuters/businessNews", source: "Reuters/Macro" },
    { kind: "rss", url: "https://www.federalreserve.gov/feeds/press_monetary.xml", source: "FederalReserve" },
    { kind: "rss", url: "https://www.ecb.europa.eu/rss/press.html", source: "ECB" },
    { kind: "reddit", url: "https://www.reddit.com/r/economics/new.json?limit=24" },
    { kind: "reddit", url: "https://www.reddit.com/r/macroeconomics/new.json?limit=18" },
    { kind: "reddit", url: "https://www.reddit.com/r/finance/new.json?limit=18" },
  ],
};

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeImageUrl(raw: string): string {
  const decoded = decodeHtml(raw).trim();
  if (!decoded) return "";
  if (decoded.startsWith("//")) return `https:${decoded}`;
  return decoded;
}

function isUsableImageUrl(url: string): boolean {
  const clean = normalizeImageUrl(url);
  if (!clean.startsWith("http")) return false;
  try {
    const parsed = new URL(clean);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("redditstatic.com") || host.includes("redditmedia.com")) return false;
    if (IMAGE_HOST_BLOCKLIST.some((domain) => host === domain || host.endsWith(`.${domain}`))) return false;
    const path = parsed.pathname.toLowerCase();
    if (/favicon|logo|apple-touch|sprite|icon/.test(path)) return false;
    const w = Number(parsed.searchParams.get("w") ?? parsed.searchParams.get("width") ?? parsed.searchParams.get("imgw"));
    const h = Number(parsed.searchParams.get("h") ?? parsed.searchParams.get("height") ?? parsed.searchParams.get("imgh"));
    if (Number.isFinite(w) && Number.isFinite(h) && w <= 220 && h <= 220) return false;
  } catch {
    return false;
  }
  return true;
}

function imageQualityScore(url: string): number {
  const clean = normalizeImageUrl(url);
  if (!clean) return -1;
  let score = 0;
  const lower = clean.toLowerCase();
  if (lower.includes("thumbnail")) score -= 50;
  if (lower.includes("preview.redd.it")) score -= 10;
  if (lower.includes("i.redd.it")) score += 10;
  if (lower.includes("images") || lower.includes("img") || lower.includes("photo")) score += 4;
  try {
    const parsed = new URL(clean);
    const w = Number(parsed.searchParams.get("width"));
    const h = Number(parsed.searchParams.get("height"));
    if (Number.isFinite(w) && w > 0) score += Math.min(40, w / 20);
    if (Number.isFinite(h) && h > 0) score += Math.min(40, h / 20);
  } catch {}
  return score;
}

function imageCanonicalKey(url: string): string {
  const clean = normalizeImageUrl(url).toLowerCase();
  if (!clean) return "";
  try {
    const parsed = new URL(clean);
    // Canonicalize by origin+pathname to collapse same image served in multiple query-size variants.
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return clean;
  }
}

function prioritizeImages(urls: string[]): string[] {
  const byCanonical = new Map<string, { url: string; score: number }>();
  for (const raw of urls) {
    const url = normalizeImageUrl(raw);
    if (!isUsableImageUrl(url)) continue;
    const key = imageCanonicalKey(url);
    if (!key) continue;
    const score = imageQualityScore(url);
    const prev = byCanonical.get(key);
    if (!prev || score > prev.score) {
      byCanonical.set(key, { url, score });
    }
  }
  const unique = Array.from(byCanonical.values())
    .sort((a, b) => b.score - a.score)
    .map((row) => row.url);
  return unique;
}

function buildImageList(child: RedditChild): string[] {
  const data = child.data;
  if (!data) return [];
  const outPrimary: string[] = [];
  const outFallback: string[] = [];

  const preview = data.preview?.images ?? [];
  for (const row of preview) {
    const src = row.source?.url;
    if (src && isUsableImageUrl(src)) outPrimary.push(normalizeImageUrl(src));
    const resolutions = row.resolutions ?? [];
    for (const r of resolutions) {
      if (r.url && isUsableImageUrl(r.url)) outPrimary.push(normalizeImageUrl(r.url));
    }
  }

  const media = data.media_metadata ?? {};
  for (const key of Object.keys(media)) {
    const src = media[key]?.s?.u;
    if (src && isUsableImageUrl(src)) outPrimary.push(normalizeImageUrl(src));
  }

  const thumb = data.thumbnail ?? "";
  if (isUsableImageUrl(thumb)) outFallback.push(normalizeImageUrl(thumb));

  return prioritizeImages([...outPrimary, ...outFallback]);
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLikelyPaywalled(url: string, title: string): boolean {
  const host = hostFromUrl(url);
  if (host) {
    if (PAYWALL_HOST_BLOCKLIST.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return true;
    }
  }

  const lowerTitle = title.toLowerCase();
  return PAYWALL_TITLE_HINTS.some((hint) => lowerTitle.includes(hint));
}

async function fetchReddit(url: string): Promise<RedditChild[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
  const res = await fetchWithWebProxy(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "tlf-trackerx/1.0",
    },
    signal: ctrl.signal,
  }).finally(() => clearTimeout(timer));
  if (!res.ok) return [];
  const json = (await res.json()) as RedditListing;
  return json.data?.children ?? [];
}

function stripHtml(input: string): string {
  return decodeHtml(
    String(input ?? "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

function readTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const hit = block.match(re);
  if (!hit?.[1]) return "";
  return String(hit[1]).trim();
}

function readAttr(block: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["'][^>]*>`, "i");
  const hit = block.match(re);
  return hit?.[1] ? normalizeImageUrl(hit[1]) : "";
}

function readRssLink(block: string): string {
  const direct = stripHtml(readTag(block, "link"));
  if (direct.startsWith("http")) return direct;
  const href =
    readAttr(block, "link", "href") ||
    readAttr(block, "atom:link", "href");
  return href.startsWith("http") ? href : "";
}

function sourceLabelFromUrl(url: string, fallback?: string): string {
  if (fallback) return fallback;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    return host || "RSS";
  } catch {
    return "RSS";
  }
}

function sanitizeSourceLabel(input: string): string {
  const clean = String(input ?? "")
    .replace(/^r\//i, "r/")
    .replace(/\s+/g, " ")
    .trim();
  return clean;
}

function isBlockedSource(source: string, link: string): boolean {
  const sourceLower = source.trim().toLowerCase();
  if (SOURCE_NAME_BLOCKLIST.some((needle) => sourceLower.includes(needle))) return true;
  const host = hostFromUrl(link);
  if (SOURCE_HOST_BLOCKLIST.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
  return false;
}

function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function parseRssItems(xml: string, category: NewsCategory, feedUrl: string, sourceHint?: string): NewsArticle[] {
  const items = String(xml ?? "").match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) ?? [];
  const sourceBase = sanitizeSourceLabel(sourceLabelFromUrl(feedUrl, sourceHint));
  const out: NewsArticle[] = [];
  for (const block of items) {
    const title = stripHtml(readTag(block, "title"));
    const link = readRssLink(block);
    if (!title || !link) continue;
    if (isLikelyPaywalled(link, title)) continue;
    const summaryRaw =
      readTag(block, "description") ||
      readTag(block, "summary") ||
      readTag(block, "content");
    const summary = stripHtml(summaryRaw).slice(0, 320) || "Open to read the original linked article/discussion.";
    const pubRaw =
      stripHtml(readTag(block, "pubDate")) ||
      stripHtml(readTag(block, "updated")) ||
      stripHtml(readTag(block, "published"));
    const pubMs = Date.parse(pubRaw);
    const pubDate = Number.isFinite(pubMs) ? new Date(pubMs).toISOString() : "";
    const sourceTag = sanitizeSourceLabel(stripHtml(readTag(block, "source")));
    const sourceFromTag = sourceTag && !isBlockedSource(sourceTag, link) ? sourceTag : "";
    const source = sourceFromTag || sourceBase;
    if (!source || isBlockedSource(source, link)) continue;
    const mediaImage =
      readAttr(block, "media:content", "url") ||
      readAttr(block, "media:thumbnail", "url") ||
      readAttr(block, "enclosure", "url");
    const inlineImage = (() => {
      const m = summaryRaw.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      return m?.[1] ? normalizeImageUrl(m[1]) : "";
    })();
    const images = prioritizeImages([mediaImage, inlineImage].filter(Boolean));
    out.push({
      id: `${category}:rss:${hashId(`${title}|${link}|${pubDate}`)}`,
      category,
      title,
      source,
      link,
      pubDate,
      summary,
      contentHtml: summary,
      images,
    });
  }
  return out;
}

async function fetchRss(url: string, category: NewsCategory, source?: string): Promise<NewsArticle[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
    const res = await fetchWithWebProxy(url, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
        "User-Agent": "tlf-trackerx/1.0",
      },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return [];
    const xml = await res.text();
    if (!xml) return [];
    return parseRssItems(xml, category, url, source);
  } catch {
    return [];
  }
}

export async function fetchNewsByCategory(category: NewsCategory, opts?: { force?: boolean }): Promise<NewsArticle[]> {
  const cached = CATEGORY_CACHE.get(category);
  if (!opts?.force && cached && cached.expiresAt > Date.now()) {
    return cached.rows;
  }
  const out: NewsArticle[] = [];
  const feeds = FEEDS[category];
  const responses = await Promise.allSettled(
    feeds.map(async (feed) => {
      if (feed.kind === "rss") return fetchRss(feed.url, category, feed.source);
      const children = await fetchReddit(feed.url);
      const rows: NewsArticle[] = [];
      for (const child of children) {
        const data = child.data;
        if (!data?.id || !data.title) continue;
        const source = sanitizeSourceLabel(data.subreddit_name_prefixed ?? "Reddit");
        const permalink = data.permalink ? `https://www.reddit.com${data.permalink}` : "";
        const direct = data.url ?? "";
        const link = direct.startsWith("http") ? direct : permalink;
        if (!link) continue;
        if (isBlockedSource(source, link)) continue;
        if (isLikelyPaywalled(link, data.title)) continue;

        const body = (data.selftext ?? "").trim();
        const summary = body ? body.slice(0, 280) : "Open to read the original linked article/discussion.";
        const images = buildImageList(child);

        rows.push({
          id: `${category}:${data.id}`,
          category,
          title: data.title.trim(),
          source,
          link,
          pubDate: data.created_utc ? new Date(data.created_utc * 1000).toISOString() : "",
          summary,
          contentHtml: body,
          images,
        });
      }
      return rows;
    })
  );
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const row of response.value) {
      out.push(row);
    }
  }

  const merged = out
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 120);

  const seen = new Set<string>();
  const deduped: NewsArticle[] = [];
  for (const row of merged) {
    const key = `${row.title.trim().toLowerCase()}|${row.link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  const finalRows = deduped
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 90);
  CATEGORY_CACHE.set(category, { expiresAt: Date.now() + NEWS_CACHE_TTL_MS, rows: finalRows });
  return finalRows;
}

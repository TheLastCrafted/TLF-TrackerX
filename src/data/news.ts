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

type HnHit = {
  objectID?: string;
  title?: string;
  story_title?: string;
  story_url?: string;
  url?: string;
  created_at?: string;
  author?: string;
};

type HnResponse = {
  hits?: HnHit[];
};

const articleImageCache = new Map<string, string | null>();

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

const FEEDS: Record<NewsCategory, string[]> = {
  crypto: [
    "https://www.reddit.com/r/CryptoCurrency/new.json?limit=40",
    "https://www.reddit.com/r/CryptoMarkets/new.json?limit=40",
  ],
  global: [
    "https://www.reddit.com/r/worldnews/new.json?limit=40",
    "https://www.reddit.com/r/geopolitics/new.json?limit=40",
  ],
  stocks: [
    "https://www.reddit.com/r/stocks/new.json?limit=40",
    "https://www.reddit.com/r/investing/new.json?limit=40",
  ],
  macro: [
    "https://www.reddit.com/r/economics/new.json?limit=40",
    "https://www.reddit.com/r/macroeconomics/new.json?limit=40",
  ],
};

function runtimeIsWeb(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

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
    const host = new URL(clean).hostname.toLowerCase();
    if (host.includes("redditstatic.com") || host.includes("redditmedia.com")) return false;
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

function extractMetaImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
    /<img[^>]+src=["']([^"']+)["'][^>]*>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const candidate = match?.[1] ? normalizeImageUrl(match[1]) : "";
    if (candidate && isUsableImageUrl(candidate)) return candidate;
  }
  return null;
}

async function fetchArticleImage(url: string): Promise<string | null> {
  if (!url || !url.startsWith("http")) return null;
  if (articleImageCache.has(url)) return articleImageCache.get(url) ?? null;
  try {
    const res = await fetchWithWebProxy(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "tlf-trackerx/1.0",
      },
    });
    if (!res.ok) {
      articleImageCache.set(url, null);
      return null;
    }
    const html = await res.text();
    const image = extractMetaImage(html);
    articleImageCache.set(url, image);
    return image;
  } catch {
    articleImageCache.set(url, null);
    return null;
  }
}

async function enrichArticleImages(rows: NewsArticle[]): Promise<void> {
  const pending = rows.filter((row) => {
    if (!row.link.startsWith("http")) return false;
    if (!row.images.length) return true;
    const topScore = imageQualityScore(row.images[0]);
    return topScore < 10;
  });
  const batchSize = 8;
  for (let i = 0; i < pending.length; i += batchSize) {
    const chunk = pending.slice(i, i + batchSize);
    const results = await Promise.all(chunk.map((row) => fetchArticleImage(row.link)));
    for (let j = 0; j < chunk.length; j += 1) {
      const image = results[j];
      if (image) {
        const existing = chunk[j].images ?? [];
        chunk[j].images = prioritizeImages([image, ...existing]);
      }
    }
  }
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
  const res = await fetchWithWebProxy(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "tlf-trackerx/1.0",
    },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as RedditListing;
  return json.data?.children ?? [];
}

async function fetchHn(query: string, category: NewsCategory): Promise<NewsArticle[]> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=30`;
  const res = await fetchWithWebProxy(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as HnResponse;
  return (json.hits ?? [])
    .map((row): NewsArticle | null => {
      const title = (row.title || row.story_title || "").trim();
      const link = (row.url || row.story_url || "").trim();
      if (!title || !link) return null;
      if (isLikelyPaywalled(link, title)) return null;
      return {
        id: `hn:${row.objectID}`,
        category,
        title,
        source: `HackerNews/${row.author ?? "user"}`,
        link,
        pubDate: row.created_at ?? "",
        summary: "Open to read linked story.",
        contentHtml: "",
        images: [] as string[],
      };
    })
    .filter((row): row is NewsArticle => Boolean(row));
}

export async function fetchNewsByCategory(category: NewsCategory): Promise<NewsArticle[]> {
  const urls = FEEDS[category];
  const responses = await Promise.allSettled(urls.map((url) => fetchReddit(url)));
  const out: NewsArticle[] = [];

  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const child of response.value) {
      const data = child.data;
      if (!data?.id || !data.title) continue;
      const source = data.subreddit_name_prefixed ?? "Reddit";
      const permalink = data.permalink ? `https://www.reddit.com${data.permalink}` : "";
      const direct = data.url ?? "";
      const link = direct.startsWith("http") ? direct : permalink;
      if (!link) continue;
      if (isLikelyPaywalled(link, data.title)) continue;

      const body = (data.selftext ?? "").trim();
      const summary = body ? body.slice(0, 280) : "Open to read the original linked article/discussion.";
      const images = buildImageList(child);

      out.push({
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
  }

  const sorted = out
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 120);

  if (!runtimeIsWeb()) {
    await enrichArticleImages(sorted);
  }

  const fallbackQuery =
    category === "crypto" ? "crypto bitcoin" :
    category === "stocks" ? "stocks earnings market" :
    category === "macro" ? "inflation fed rates macro" :
    "global economy finance";

  if (sorted.length >= 20) return sorted;

  const fallback = await fetchHn(fallbackQuery, category);
  const merged = [...sorted, ...fallback];
  const seen = new Set<string>();
  const deduped: NewsArticle[] = [];
  for (const row of merged) {
    const key = `${row.title}|${row.link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  const finalRows = deduped
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 120);
  if (!runtimeIsWeb()) {
    await enrichArticleImages(finalRows);
  }
  return finalRows;
}

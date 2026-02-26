function isWebRuntime(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function withWebProxy(url: string): string {
  if (!url) return url;
  if (!isWebRuntime()) return url;
  if (url.startsWith("/api/")) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  return `/api/http?url=${encodeURIComponent(url)}`;
}

export async function fetchWithWebProxy(input: string, init?: RequestInit): Promise<Response> {
  const target = withWebProxy(input);
  if (target === input) return fetch(input, init);
  try {
    const proxied = await fetch(target, init);
    if (![404, 405].includes(proxied.status)) return proxied;
  } catch {
    // Fallback below.
  }
  return fetch(input, init);
}

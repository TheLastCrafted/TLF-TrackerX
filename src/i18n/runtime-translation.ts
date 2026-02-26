import type { AppLanguage } from "../state/settings";

type TranslationOptions = {
  sourceLanguage?: string;
  chunkSize?: number;
};

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();
const CACHE_LIMIT = 800;

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function pruneCache() {
  if (cache.size <= CACHE_LIMIT) return;
  const overflow = cache.size - CACHE_LIMIT;
  let i = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    i += 1;
    if (i >= overflow) break;
  }
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const normalized = text.trim();
  if (normalized.length <= chunkSize) return [normalized];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    if (end < normalized.length) {
      const sentenceBreak = normalized.lastIndexOf(". ", end);
      const lineBreak = normalized.lastIndexOf("\n", end);
      const splitAt = Math.max(sentenceBreak, lineBreak);
      if (splitAt > start + 120) end = splitAt + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end;
  }
  return chunks.length ? chunks : [normalized];
}

async function tryGoogleTranslate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string | null> {
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=${encodeURIComponent(sourceLanguage)}&tl=${encodeURIComponent(targetLanguage)}` +
    `&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json) || !Array.isArray(json[0])) return null;
    const translated = (json[0] as unknown[])
      .map((row) => (Array.isArray(row) ? String(row[0] ?? "") : ""))
      .join("")
      .trim();
    return translated || null;
  } catch {
    return null;
  }
}

async function tryMyMemoryTranslate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string | null> {
  const url =
    `https://api.mymemory.translated.net/get` +
    `?q=${encodeURIComponent(text)}` +
    `&langpair=${encodeURIComponent(`${sourceLanguage}|${targetLanguage}`)}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as { responseData?: { translatedText?: string } };
    const translated = String(json.responseData?.translatedText ?? "").trim();
    return translated || null;
  } catch {
    return null;
  }
}

async function translateChunk(
  text: string,
  sourceLanguage: string,
  targetLanguage: AppLanguage
): Promise<string> {
  const key = `${sourceLanguage}:${targetLanguage}:${text}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const google = await tryGoogleTranslate(text, sourceLanguage, targetLanguage);
    const translated = google ?? (await tryMyMemoryTranslate(text, sourceLanguage, targetLanguage)) ?? text;
    cache.set(key, translated);
    pruneCache();
    inFlight.delete(key);
    return translated;
  })();

  inFlight.set(key, promise);
  return promise;
}

export async function translateRuntimeText(
  input: string,
  targetLanguage: AppLanguage,
  options?: TranslationOptions
): Promise<string> {
  const normalized = normalizeText(input);
  if (!normalized) return input;
  if (targetLanguage === "en") return input;

  const sourceLanguage = options?.sourceLanguage ?? "auto";
  const chunkSize = Math.max(350, Math.min(1200, options?.chunkSize ?? 700));
  const chunks = splitIntoChunks(normalized, chunkSize);

  if (chunks.length === 1) {
    const translated = await translateChunk(chunks[0], sourceLanguage, targetLanguage);
    return translated || input;
  }

  const translatedChunks = await Promise.all(
    chunks.map((chunk) => translateChunk(chunk, sourceLanguage, targetLanguage))
  );

  return translatedChunks
    .map((chunk, index) => chunk || chunks[index])
    .join(" ")
    .trim();
}

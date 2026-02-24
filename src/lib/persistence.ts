import * as FileSystem from "expo-file-system/legacy";

const BASE_DIR = `${FileSystem.documentDirectory ?? ""}persist`;

async function ensureBaseDir(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  const info = await FileSystem.getInfoAsync(BASE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(BASE_DIR, { intermediates: true });
  }
}

function filePath(key: string): string {
  return `${BASE_DIR}/${key}.json`;
}

export async function loadPersistedJson<T>(key: string, fallback: T): Promise<T> {
  try {
    if (!FileSystem.documentDirectory) return fallback;
    await ensureBaseDir();
    const path = filePath(key);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    const raw = await FileSystem.readAsStringAsync(path);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function savePersistedJson<T>(key: string, value: T): Promise<void> {
  try {
    if (!FileSystem.documentDirectory) return;
    await ensureBaseDir();
    const path = filePath(key);
    await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
  } catch {
    // Intentionally swallow persistence failures.
  }
}

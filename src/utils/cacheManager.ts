// Lightweight localStorage cache with TTL for front-end suggestions and plans.

type CacheEnvelope<T> = {
  value: T;
  expiresAt: number;
};

export function setCache<T>(key: string, value: T, ttlMs: number) {
  try {
    const env: CacheEnvelope<T> = { value, expiresAt: Date.now() + ttlMs };
    localStorage.setItem(key, JSON.stringify(env));
  } catch {
    // ignore storage errors (quota/disabled)
  }
}

export function getCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (Date.now() > parsed.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

export function removeCache(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
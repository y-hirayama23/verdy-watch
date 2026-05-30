function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  url: string,
  userAgent: string,
  accept: string,
  maxRetries = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          Accept: accept,
          'Accept-Language': 'ja,en;q=0.8',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Retryable status ${res.status}`);
      }
      if (!res.ok) {
        throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await sleep(Math.min(2000 * 2 ** attempt, 15_000));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchText(url: string, userAgent: string): Promise<string> {
  const res = await fetchWithRetry(url, userAgent, 'text/html,application/xhtml+xml');
  return res.text();
}

export async function fetchJson<T = unknown>(
  url: string,
  userAgent: string,
): Promise<T> {
  const res = await fetchWithRetry(url, userAgent, 'application/json');
  return res.json() as Promise<T>;
}

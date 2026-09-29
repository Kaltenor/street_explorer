import { withRequestDeadline } from "./networkRequest";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
] as const;

/** Failed or partial Overpass responses must never become an empty local cache. */
export async function fetchBoundaryData<T>(query: string, signal?: AbortSignal, timeoutMs = 40_000, hedgeDelayMs?: number): Promise<T> {
  const request = (endpoint: string, parentSignal?: AbortSignal) =>
    withRequestDeadline(async (requestSignal) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "StreetExplorer/0.35.1 (mobile walking exploration app)"
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: requestSignal
      });
      if (!response.ok) throw new Error(`Boundary service HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data?.elements) || data.remark) {
        throw new Error("Boundary service returned incomplete data");
      }
      return data as T;
    }, timeoutMs, parentSignal);

  if (hedgeDelayMs !== undefined) {
    // Give a slow primary more time without making the backup wait for its deadline.
    const group = new AbortController();
    const abort = () => group.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<T>((resolve, reject) => {
        let backupStarted = false;
        let failures = 0;
        const start = (index: 0 | 1) => {
          if (index === 1) {
            if (backupStarted || group.signal.aborted) return;
            backupStarted = true;
            clearTimeout(timer);
          }
          request(ENDPOINTS[index], group.signal).then(resolve, error => {
            if (group.signal.aborted) { reject(error); return; }
            failures++;
            if (failures === ENDPOINTS.length) reject(error);
            else if (index === 0) start(1);
          });
        };
        timer = setTimeout(() => start(1), hedgeDelayMs);
        start(0);
      });
    } finally {
      clearTimeout(timer);
      group.abort(); // Cancel the losing response, including pending body consumption.
      signal?.removeEventListener("abort", abort);
    }
  }

  let failure: unknown;
  for (const endpoint of ENDPOINTS) {
    if (signal?.aborted) throw new Error("Boundary request cancelled");
    try {
      return await request(endpoint, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      failure = error;
    }
  }
  throw failure;
}

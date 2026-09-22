import { withRequestDeadline } from "./networkRequest";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

/** Failed or partial Overpass responses must never become an empty local cache. */
export async function fetchBoundaryData<T>(query: string, signal?: AbortSignal): Promise<T> {
  let failure: unknown;
  for (const endpoint of ENDPOINTS) {
    if (signal?.aborted) throw new Error("Boundary request cancelled");
    try {
      return await withRequestDeadline(async (requestSignal) => {
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
      }, 40_000, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      failure = error;
    }
  }
  throw failure;
}

import { useEffect, useRef } from "react";

const now = () =>
  typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();

export function measurePerformance<T>(
  label: string,
  operation: () => T,
  slowThresholdMs = 16
): T {
  const startedAt = now();

  try {
    return operation();
  } finally {
    const durationMs = now() - startedAt;

    if (typeof __DEV__ !== "undefined" && __DEV__ && durationMs >= slowThresholdMs) {
      console.info(`[performance] ${label}: ${durationMs.toFixed(1)}ms`);
    }
  }
}

export async function measureAsyncPerformance<T>(
  label: string,
  operation: () => Promise<T>,
  slowThresholdMs = 50
): Promise<T> {
  const startedAt = now();

  try {
    return await operation();
  } finally {
    const durationMs = now() - startedAt;

    if (typeof __DEV__ !== "undefined" && __DEV__ && durationMs >= slowThresholdMs) {
      console.info(`[performance] ${label}: ${durationMs.toFixed(1)}ms`);
    }
  }
}

export function usePerformanceRenderCounter(
  label: string,
  reportEvery = 120
) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => {
    if (
      typeof __DEV__ !== "undefined" &&
      __DEV__ &&
      renderCountRef.current % reportEvery === 0
    ) {
      console.info(
        `[performance] ${label}: ${renderCountRef.current} renders`
      );
    }
  });
}

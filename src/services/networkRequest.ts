/** Keep the deadline alive through response consumption, not just headers. */
export async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 35_000,
  parentSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let rejectAbort: (error: Error) => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    const error = new Error(parentSignal?.aborted ? "Request cancelled" : "Request timed out");
    error.name = "AbortError";
    rejectAbort(error);
  };
  controller.signal.addEventListener("abort", onAbort, { once: true });
  parentSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    if (parentSignal?.aborted) abort();
    return await Promise.race([
      aborted,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error("Request cancelled");
        return operation(controller.signal);
      })
    ]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

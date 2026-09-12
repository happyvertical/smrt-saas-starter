/** Owns only requests started by one mounted starter shell bridge. */
export function createShellRequestLifetime() {
  const pending = new Set<AbortController>();
  let disposed = false;
  return {
    async run(
      execute: (signal: AbortSignal) => Promise<string>,
      callerSignal?: AbortSignal,
    ): Promise<string> {
      if (disposed || callerSignal?.aborted)
        return JSON.stringify({ ok: false, reason: "cancelled" });
      const controller = new AbortController();
      const signal = callerSignal
        ? AbortSignal.any([controller.signal, callerSignal])
        : controller.signal;
      pending.add(controller);
      try {
        const result = await execute(signal);
        signal.throwIfAborted();
        return result;
      } catch (error) {
        if (signal.aborted) {
          return JSON.stringify({ ok: false, reason: "cancelled" });
        }
        throw error;
      } finally {
        pending.delete(controller);
      }
    },
    dispose() {
      disposed = true;
      for (const controller of pending) controller.abort();
      pending.clear();
    },
  };
}

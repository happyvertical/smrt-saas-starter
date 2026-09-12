/** Owns only requests started by one mounted starter shell bridge. */
export function createShellRequestLifetime() {
  const pending = new Set<AbortController>();
  let disposed = false;
  return {
    async run(execute: (signal: AbortSignal) => Promise<string>): Promise<string> {
      if (disposed) return JSON.stringify({ ok: false, reason: "cancelled" });
      const controller = new AbortController();
      pending.add(controller);
      try {
        const result = await execute(controller.signal);
        controller.signal.throwIfAborted();
        return result;
      } catch (error) {
        if (controller.signal.aborted) {
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

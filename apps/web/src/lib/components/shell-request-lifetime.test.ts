import { describe, expect, it, vi } from "vitest";
import { createShellRequestLifetime } from "./shell-request-lifetime";

describe("mounted shell request lifetime", () => {
  it("aborts every pending operation and suppresses late success after unmount", async () => {
    const lifetime = createShellRequestLifetime();
    let complete!: () => void;
    const deferred = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const signals: AbortSignal[] = [];
    const acknowledge = vi.fn();
    const execute = (signal: AbortSignal) => {
      signals.push(signal);
      return deferred.then(() => {
        signal.throwIfAborted();
        acknowledge();
        return "success";
      });
    };
    const first = lifetime.run(execute);
    const second = lifetime.run(execute);
    lifetime.dispose();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    complete();
    expect(JSON.parse(await first)).toEqual({ ok: false, reason: "cancelled" });
    expect(JSON.parse(await second)).toEqual({ ok: false, reason: "cancelled" });
    expect(acknowledge).not.toHaveBeenCalled();
    await lifetime.run(execute);
    expect(signals).toHaveLength(2);
  });

  it("isolates replacement mount and preserves ordinary execution failures", async () => {
    const oldMount = createShellRequestLifetime();
    const newMount = createShellRequestLifetime();
    oldMount.dispose();
    await expect(
      newMount.run(async (signal) => {
        expect(signal.aborted).toBe(false);
        return "applied";
      }),
    ).resolves.toBe("applied");
    await expect(
      newMount.run(async () => {
        throw new Error("ordinary failure");
      }),
    ).rejects.toThrow("ordinary failure");
  });
});

describe("native caller cancellation within a mounted shell", () => {
  it("does not start already-aborted callers", async () => {
    const lifetime = createShellRequestLifetime();
    const caller = new AbortController();
    caller.abort();
    const execute = vi.fn(async () => "unexpected");
    expect(JSON.parse(await lifetime.run(execute, caller.signal))).toEqual({
      ok: false,
      reason: "cancelled",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("aborts only its invocation and suppresses late caller success", async () => {
    const lifetime = createShellRequestLifetime();
    const caller = new AbortController();
    let resolve!: () => void;
    const deferred = new Promise<void>((done) => {
      resolve = done;
    });
    const signals: AbortSignal[] = [];
    const acknowledge = vi.fn();
    const execute = async (signal: AbortSignal) => {
      signals.push(signal);
      await deferred;
      signal.throwIfAborted();
      acknowledge();
      return "applied";
    };
    const cancelled = lifetime.run(execute, caller.signal);
    const sibling = lifetime.run(execute);
    caller.abort();
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
    resolve();
    expect(JSON.parse(await cancelled)).toEqual({ ok: false, reason: "cancelled" });
    expect(await sibling).toBe("applied");
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });

  it("mount disposal cancels caller-bound work without aborting the caller's controller", async () => {
    const lifetime = createShellRequestLifetime();
    const caller = new AbortController();
    let resolve!: () => void;
    const deferred = new Promise<void>((done) => {
      resolve = done;
    });
    let operationSignal!: AbortSignal;
    const result = lifetime.run(async (signal) => {
      operationSignal = signal;
      await deferred;
      return "late success";
    }, caller.signal);
    lifetime.dispose();
    expect(operationSignal.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
    caller.abort();
    resolve();
    expect(JSON.parse(await result)).toEqual({ ok: false, reason: "cancelled" });
  });
});

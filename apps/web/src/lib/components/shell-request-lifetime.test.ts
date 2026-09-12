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

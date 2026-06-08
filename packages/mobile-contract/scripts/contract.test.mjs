import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

describe("mobile contract", () => {
  it("has a versioned contract", () => {
    const source = readFile(join(packageRoot, "src/index.ts"), "utf8");
    return source.then((text) => {
      assert.match(text, /mobileContractVersion = "\d{4}-\d{2}-\d{2}\.v\d+"/);
      assert.match(text, /interface MobileAuthStartRequest/);
      assert.match(text, /interface MobileAuthSession/);
      assert.match(text, /interface MobileSessionBootstrap/);
      assert.match(text, /type MobileDeviceCaptureSurface = "camera" \| "microphone"/);
      assert.match(text, /interface MobileDeviceCapabilities/);
      assert.match(text, /checkedAtEpochMillis\?: number/);
    });
  });

  it("generates Kotlin into the mobile app source tree", () => {
    const source = readFile(join(packageRoot, "scripts/generate-mobile-contract.mjs"), "utf8");
    return source.then((text) => {
      assert.match(text, /apps\/mobile\/shared\/src\/commonMain\/kotlin\/generated\/Contract\.kt/);
      assert.match(text, /MobileContractVersion = "2026-06-08\.v4"/);
      assert.match(text, /checkedAtEpochMillis: Long\?/);
    });
  });
});

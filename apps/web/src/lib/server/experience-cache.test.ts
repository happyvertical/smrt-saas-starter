import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantId = "00000000-0000-4000-8000-000000009999";

const mocks = vi.hoisted(() => {
  const fakeDb = { query: vi.fn() };
  return {
    fakeDb,
    clearPromptCache: vi.fn(),
    defineLanguageString: vi.fn(),
    definePrompt: vi.fn(),
    getAppDatabase: vi.fn(async () => fakeDb),
    getSmrtConfig: vi.fn(() => ({})),
    invalidateLanguageCache: vi.fn(),
    languageCreateOverride: vi.fn(),
    languageGetTenantOverride: vi.fn(),
    promptCreateOverride: vi.fn(),
    promptGetTenantOverride: vi.fn(),
    setConfig: vi.fn(),
    withActiveTenant: vi.fn(async (requestedTenantId: string | null | undefined, fn) =>
      fn(requestedTenantId ?? tenantId),
    ),
  };
});

vi.mock("@happyvertical/smrt-config", () => ({
  setConfig: mocks.setConfig,
}));

vi.mock("@happyvertical/smrt-languages", () => ({
  defineLanguageString: mocks.defineLanguageString,
  invalidateLanguageCache: mocks.invalidateLanguageCache,
  LanguageOverrideCollection: {
    create: vi.fn(async () => ({
      db: mocks.fakeDb,
      create: mocks.languageCreateOverride,
      getTenantOverride: mocks.languageGetTenantOverride,
    })),
  },
  normalizeLocale: (locale: string) => (locale.toLowerCase() === "fr-ca" ? "fr-CA" : locale),
  resolveLanguageString: vi.fn(),
}));

vi.mock("@happyvertical/smrt-prompts", () => ({
  clearPromptCache: mocks.clearPromptCache,
  definePrompt: mocks.definePrompt,
  PromptOverrideCollection: {
    create: vi.fn(async () => ({
      create: mocks.promptCreateOverride,
      getTenantOverride: mocks.promptGetTenantOverride,
    })),
  },
  resolvePrompt: vi.fn(),
}));

vi.mock("$lib/server/db", () => ({
  getAppDatabase: mocks.getAppDatabase,
}));

vi.mock("$lib/server/smrt", () => ({
  getSmrtConfig: mocks.getSmrtConfig,
}));

vi.mock("$lib/server/tenant-context", () => ({
  withActiveTenant: mocks.withActiveTenant,
}));

describe("starter experience override cache invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.languageCreateOverride.mockResolvedValue({});
    mocks.languageGetTenantOverride.mockResolvedValue(null);
    mocks.promptCreateOverride.mockResolvedValue({});
    mocks.promptGetTenantOverride.mockResolvedValue(null);
  });

  it("clears prompt resolution cache after saving a tenant prompt override", async () => {
    const { saveTenantPromptOverride } = await import("$lib/server/experience");

    await saveTenantPromptOverride(tenantId, {
      key: "starter.assistant.system",
      template: "Use the tenant subscription context.",
    });

    expect(mocks.promptCreateOverride).toHaveBeenCalledOnce();
    expect(mocks.clearPromptCache).toHaveBeenCalledOnce();
  });

  it("invalidates language resolution cache after saving a tenant language override", async () => {
    const { saveTenantLanguageOverride } = await import("$lib/server/experience");

    await saveTenantLanguageOverride(tenantId, {
      key: "starter.assistant.greeting",
      locale: "fr-CA",
      template: "Bonjour {tenantName}.",
    });

    expect(mocks.languageCreateOverride).toHaveBeenCalledOnce();
    expect(mocks.invalidateLanguageCache).toHaveBeenCalledWith(
      "starter.assistant.greeting",
      "fr-CA",
      tenantId,
      mocks.fakeDb,
    );
  });

  it("rejects language overrides outside the managed starter settings", async () => {
    const { saveTenantLanguageOverride } = await import("$lib/server/experience");

    await expect(
      saveTenantLanguageOverride(tenantId, {
        key: "starter.assistant.greeting",
        locale: "de",
        template: "Hallo {tenantName}.",
      }),
    ).rejects.toThrow('Unknown starter language setting "starter.assistant.greeting"');
    expect(mocks.languageCreateOverride).not.toHaveBeenCalled();
    expect(mocks.invalidateLanguageCache).not.toHaveBeenCalled();
  });
});

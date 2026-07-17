import { resolveLanguageString } from "@happyvertical/smrt-languages";
import { resolvePrompt } from "@happyvertical/smrt-prompts";
import { describe, expect, it } from "vitest";
import {
  loadStarterExperienceConfig,
  registerStarterExperienceDefinitions,
} from "$lib/server/experience";

describe("starter prompt and language definitions", () => {
  it("registers code-first defaults idempotently", async () => {
    await loadStarterExperienceConfig();
    registerStarterExperienceDefinitions();
    registerStarterExperienceDefinitions();

    const prompt = await resolvePrompt("starter.assistant.system", {
      variables: { tenantName: "Acme" },
    });
    expect(prompt.text).toContain("Acme");
    expect(prompt.ai.params.temperature).toBe(0.3);

    const language = await resolveLanguageString("starter.assistant.greeting", {
      locale: "en",
      vars: { tenantName: "Acme" },
    });
    expect(language).toMatchObject({
      source: "code",
      text: "Ask about Acme's subscription, usage, prompts, or MCP tools.",
    });
  });

  it("falls back through registered language defaults without a database", async () => {
    await loadStarterExperienceConfig();
    registerStarterExperienceDefinitions();

    const language = await resolveLanguageString("starter.assistant.greeting", {
      locale: "fr-CA",
      vars: { tenantName: "Acme" },
    });

    expect(language).toMatchObject({
      locale: "fr-CA",
      resolvedFromLocale: "en",
      source: "fallback",
      text: "Ask about Acme's subscription, usage, prompts, or MCP tools.",
    });
  });
});

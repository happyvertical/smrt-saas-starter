import { type SmrtConfig, setConfig } from "@happyvertical/smrt-config";
import {
  defineLanguageString,
  invalidateLanguageCache,
  LanguageOverrideCollection,
  normalizeLocale,
  type ResolvedLanguageString,
  resolveLanguageString,
} from "@happyvertical/smrt-languages";
import {
  clearPromptCache,
  definePrompt,
  PromptOverrideCollection,
  type PromptParams,
  type ResolvedPrompt,
  resolvePrompt,
} from "@happyvertical/smrt-prompts";
import { getAppDatabase } from "$lib/server/db";
import { getSmrtConfig } from "$lib/server/smrt";
import { type StarterLanguageStringSeed, starterData } from "$lib/server/starter-data";
import { withActiveTenant } from "$lib/server/tenant-context";
import starterSmrtConfig from "../../../smrt.config.mjs";

export interface PromptSetting {
  key: string;
  label: string;
  description: string;
  defaultTemplate: string;
  effectiveTemplate: string;
  previewText: string;
  profile: string;
  model: string;
  params: PromptParams;
  tenantOverrideTemplate: string;
  hasTenantOverride: boolean;
}

export interface LanguageSetting {
  key: string;
  locale: string;
  label: string;
  description: string;
  defaultTemplate: string;
  effectiveTemplate: string;
  previewText: string;
  source: ResolvedLanguageString["source"];
  resolvedFromLocale: string;
  tenantOverrideTemplate: string;
  hasTenantOverride: boolean;
}

export interface TenantCustomizationOverview {
  tenantId: string;
  tenantName: string;
  prompts: PromptSetting[];
  languages: LanguageSetting[];
}

export interface OverrideWriteResult {
  action: "saved" | "deleted" | "unchanged";
  key: string;
}

let definitionsRegistered = false;
let configLoaded = false;

export async function loadStarterExperienceConfig(): Promise<void> {
  if (!configLoaded) {
    setConfig(starterSmrtConfig as Partial<SmrtConfig>);
    configLoaded = true;
  }
}

export function registerStarterExperienceDefinitions(): void {
  if (definitionsRegistered) {
    return;
  }

  for (const prompt of starterData.prompts) {
    definePrompt({
      key: prompt.key,
      template: prompt.template,
      ai: prompt.ai,
      editable: prompt.editable,
    });
  }

  for (const languageString of starterData.languageStrings) {
    defineLanguageString({
      key: languageString.key,
      locale: languageString.locale,
      template: languageString.template,
    });
  }

  definitionsRegistered = true;
}

export async function getTenantCustomizationOverview(
  tenantId?: string | null,
): Promise<TenantCustomizationOverview> {
  await loadStarterExperienceConfig();
  registerStarterExperienceDefinitions();

  return await withActiveTenant(tenantId, async (activeTenantId) => {
    const db = await getAppDatabase();
    const tenantName = getTenantDisplayName(activeTenantId);
    const promptOverrides = await PromptOverrideCollection.create({
      ...getSmrtConfig("PromptOverride"),
      db,
    });
    const languageOverrides = await LanguageOverrideCollection.create({
      ...getSmrtConfig("LanguageOverride"),
      db,
    });

    const prompts = await Promise.all(
      starterData.prompts.map(async (prompt): Promise<PromptSetting> => {
        const [resolved, tenantOverride] = await Promise.all([
          resolveStarterPrompt(prompt.key, activeTenantId, { tenantName }, db),
          promptOverrides.getTenantOverride(prompt.key, activeTenantId),
        ]);

        return {
          key: prompt.key,
          label: prompt.label,
          description: prompt.description,
          defaultTemplate: prompt.template,
          effectiveTemplate: resolved.template,
          previewText: resolved.text,
          profile: resolved.ai.profile ?? "",
          model: resolved.ai.model ?? "",
          params: resolved.ai.params,
          tenantOverrideTemplate: tenantOverride?.template ?? "",
          hasTenantOverride: Boolean(tenantOverride),
        };
      }),
    );

    const languages = await Promise.all(
      starterData.languageSettings.map(async (setting): Promise<LanguageSetting> => {
        const definition = getLanguageDefinition(setting.key, setting.locale);
        const locale = normalizeLocale(setting.locale);
        const [resolved, tenantOverride] = await Promise.all([
          resolveLanguageString(setting.key, {
            db,
            tenantId: activeTenantId,
            locale,
            vars: { tenantName },
          }),
          languageOverrides.getTenantOverride(setting.key, locale, activeTenantId),
        ]);

        return {
          key: setting.key,
          locale,
          label: definition.label,
          description: definition.description,
          defaultTemplate: definition.template,
          effectiveTemplate: resolved.template,
          previewText: resolved.text,
          source: resolved.source,
          resolvedFromLocale: resolved.resolvedFromLocale,
          tenantOverrideTemplate: tenantOverride?.template ?? "",
          hasTenantOverride: Boolean(tenantOverride),
        };
      }),
    );

    return {
      tenantId: activeTenantId,
      tenantName,
      prompts,
      languages,
    };
  });
}

export async function resolveStarterPromptPreview(
  tenantId: string,
  key = starterData.prompts[0]?.key ?? "",
): Promise<ResolvedPrompt> {
  await loadStarterExperienceConfig();
  registerStarterExperienceDefinitions();
  const prompt = findPrompt(key);
  const db = await getAppDatabase();
  return await resolveStarterPrompt(
    prompt.key,
    tenantId,
    {
      tenantName: getTenantDisplayName(tenantId),
    },
    db,
  );
}

export async function saveTenantPromptOverride(
  tenantId: string | null | undefined,
  input: { key: string; template: string },
): Promise<OverrideWriteResult> {
  await loadStarterExperienceConfig();
  registerStarterExperienceDefinitions();
  const prompt = findPrompt(input.key);
  const template = normalizeOptionalTemplate(input.template);

  return await withActiveTenant(tenantId, async (activeTenantId) => {
    const db = await getAppDatabase();
    const collection = await PromptOverrideCollection.create({
      ...getSmrtConfig("PromptOverride"),
      db,
    });
    const existing = await collection.getTenantOverride(prompt.key, activeTenantId);

    if (!template) {
      if (existing) {
        await existing.delete();
        clearPromptCache();
        return { action: "deleted", key: prompt.key };
      }
      return { action: "unchanged", key: prompt.key };
    }

    if (existing) {
      existing.template = template;
      await existing.save();
      clearPromptCache();
      return { action: "saved", key: prompt.key };
    }

    await collection.create({
      slug: slugForOverride(activeTenantId, prompt.key),
      key: prompt.key,
      tenantId: activeTenantId,
      template,
      profile: null,
      model: null,
      params: null,
    });

    clearPromptCache();
    return { action: "saved", key: prompt.key };
  });
}

export async function saveTenantLanguageOverride(
  tenantId: string | null | undefined,
  input: { key: string; locale: string; template: string },
): Promise<OverrideWriteResult> {
  await loadStarterExperienceConfig();
  registerStarterExperienceDefinitions();
  const definition = getLanguageDefinition(input.key, input.locale);
  const locale = normalizeLocale(input.locale);
  const template = normalizeOptionalTemplate(input.template);

  return await withActiveTenant(tenantId, async (activeTenantId) => {
    const db = await getAppDatabase();
    const collection = await LanguageOverrideCollection.create({
      ...getSmrtConfig("LanguageOverride"),
      db,
    });
    const existing = await collection.getTenantOverride(definition.key, locale, activeTenantId);

    if (!template) {
      if (existing) {
        await existing.delete();
        invalidateLanguageCache(definition.key, locale, activeTenantId, collection.db);
        return { action: "deleted", key: definition.key };
      }
      return { action: "unchanged", key: definition.key };
    }

    if (existing) {
      existing.template = template;
      existing.auto_generated = false;
      existing.source_hash = null;
      existing.ai_model = null;
      await existing.save();
      invalidateLanguageCache(definition.key, locale, activeTenantId, collection.db);
      return { action: "saved", key: definition.key };
    }

    await collection.create({
      slug: slugForOverride(activeTenantId, `${definition.key}-${locale}`),
      key: definition.key,
      locale,
      tenantId: activeTenantId,
      template,
      auto_generated: false,
      source_hash: null,
      ai_model: null,
      reviewed_at: null,
      reviewed_by: null,
    });

    invalidateLanguageCache(definition.key, locale, activeTenantId, collection.db);
    return { action: "saved", key: definition.key };
  });
}

async function resolveStarterPrompt(
  key: string,
  tenantId: string,
  variables: Record<string, unknown>,
  db: Awaited<ReturnType<typeof getAppDatabase>>,
): Promise<ResolvedPrompt> {
  return await resolvePrompt(key, {
    db,
    tenantId,
    variables,
  });
}

function findPrompt(key: string) {
  const normalized = key.trim();
  const prompt = starterData.prompts.find((candidate) => candidate.key === normalized);
  if (!prompt) {
    throw new Error(`Unknown starter prompt "${key}"`);
  }
  return prompt;
}

function getLanguageDefinition(key: string, locale: string): StarterLanguageStringSeed {
  const normalizedKey = key.trim();
  const normalizedLocale = normalizeLocale(locale);
  const isManagedSetting = starterData.languageSettings.some(
    (setting) =>
      setting.key === normalizedKey && normalizeLocale(setting.locale) === normalizedLocale,
  );
  if (!isManagedSetting) {
    throw new Error(`Unknown starter language setting "${key}" for locale "${normalizedLocale}"`);
  }

  const exact = starterData.languageStrings.find(
    (definition) =>
      definition.key === normalizedKey && normalizeLocale(definition.locale) === normalizedLocale,
  );
  if (exact) {
    return exact;
  }

  const fallback = starterData.languageStrings.find(
    (definition) => definition.key === normalizedKey && normalizeLocale(definition.locale) === "en",
  );
  if (fallback) {
    return {
      ...fallback,
      locale: normalizedLocale,
      label: `${fallback.label} (${normalizedLocale})`,
    };
  }

  throw new Error(`Unknown starter language string "${key}" for locale "${locale}"`);
}

function getTenantDisplayName(tenantId: string): string {
  return tenantId === starterData.demoTenant.id ? starterData.demoTenant.name : "Current tenant";
}

function normalizeOptionalTemplate(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugForOverride(tenantId: string, key: string): string {
  return `${tenantId.slice(0, 8)}-${key}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

import type { LogLevel } from "@happyvertical/logger";
import { ObjectRegistry, type SmrtClassOptions, type SmrtObject } from "@happyvertical/smrt-core";
import "@happyvertical/smrt-subscriptions";
import { getRequestScopedDatabase as getUsersRequestScopedDatabase } from "@happyvertical/smrt-users";
import "@happyvertical/smrt-saas-objects";

const objectOverrides: Record<string, Partial<SmrtClassOptions>> = {};

function resolveLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL;
  return level === "debug" || level === "warn" || level === "error" ? level : "info";
}

function getDefaultConfig(): SmrtClassOptions {
  return {
    db: {
      url: process.env.DATABASE_URL ?? "postgresql://smrt_saas:localdev@127.0.0.1:5432/smrt_saas",
      type: "postgres",
    },
    logging: { level: resolveLogLevel() },
    metrics: { enabled: true },
    usage: { enabled: true, persist: true, estimateCosts: true },
    ai: process.env.OPENAI_API_KEY
      ? {
          type: "openai",
          apiKey: process.env.OPENAI_API_KEY,
        }
      : undefined,
  };
}

function getRequestScopedDatabase(): SmrtClassOptions["db"] | undefined {
  return getUsersRequestScopedDatabase() as unknown as SmrtClassOptions["db"] | undefined;
}

export function getSmrtConfig(className: string): SmrtClassOptions {
  const defaults = getDefaultConfig();
  const override = objectOverrides[className];
  return override ? { ...defaults, ...override } : defaults;
}

export async function getCollection<T extends SmrtObject>(className: string) {
  const config = getSmrtConfig(className);
  const requestScopedDb = objectOverrides[className]?.db ? undefined : getRequestScopedDatabase();

  return await ObjectRegistry.getCollection<T>(className, {
    ...config,
    db: requestScopedDb ?? config.db,
  });
}

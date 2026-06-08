import type { LogLevel } from "@happyvertical/logger";
import { resolveDatabase, type SmrtClassOptions } from "@happyvertical/smrt-core";
import {
  createSdkStripeBillingProvider,
  type StripeBillingProvider,
} from "@happyvertical/smrt-saas-objects";
import "@happyvertical/smrt-subscriptions";
import { enableTenancy } from "@happyvertical/smrt-tenancy";
import "@happyvertical/smrt-saas-objects";

let tenancyEnabled = false;

export interface WorkerDatabase {
  query(sql: string, ...params: unknown[]): Promise<{ rows: unknown[] }>;
  close?(): Promise<void> | void;
}

export function getWorkerSmrtConfig(): SmrtClassOptions {
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

export async function getWorkerDatabase(): Promise<WorkerDatabase> {
  const dbConfig = getWorkerSmrtConfig().db;
  if (!dbConfig) {
    throw new Error("SMRT database configuration is missing");
  }

  return (await resolveDatabase(dbConfig, {
    dbid: "smrt-saas-starter-worker",
  })) as WorkerDatabase;
}

export function ensureWorkerTenancy(): void {
  if (tenancyEnabled) {
    return;
  }

  enableTenancy();
  tenancyEnabled = true;
}

export async function getWorkerStripeBillingProvider(): Promise<StripeBillingProvider | null> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return null;
  }

  return await createSdkStripeBillingProvider({
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
    apiVersion: process.env.STRIPE_API_VERSION?.trim() || undefined,
  });
}

function resolveLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL;
  return level === "debug" || level === "warn" || level === "error" ? level : "info";
}

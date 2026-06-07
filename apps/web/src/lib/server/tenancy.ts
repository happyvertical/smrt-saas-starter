import type { RequestEvent } from "@sveltejs/kit";
import { getAppDatabase } from "$lib/server/db";
import { DEMO_TENANT_ID, DEMO_TENANT_SLUG, isUuid } from "$lib/server/starter-data";

export interface TenantResolution {
  tenantId: string | null;
}

const rootLikeHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const reservedSubdomains = new Set(["www", "api", "app", "admin"]);

export async function resolveTenant(event: RequestEvent): Promise<TenantResolution> {
  const headerTenant = event.request.headers.get("x-tenant-id");
  if (headerTenant) {
    return { tenantId: await resolveTenantKey(headerTenant) };
  }

  const host = event.url.hostname.toLowerCase();
  if (rootLikeHosts.has(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { tenantId: null };
  }

  const baseDomain = process.env.PUBLIC_BASE_DOMAIN?.toLowerCase();
  if (baseDomain && host.endsWith(`.${baseDomain}`)) {
    const candidate = host.slice(0, -baseDomain.length - 1).split(".")[0];
    return {
      tenantId:
        candidate && !reservedSubdomains.has(candidate) ? await resolveTenantKey(candidate) : null,
    };
  }

  const labels = host.split(".");
  if (labels.length < 3) {
    return { tenantId: null };
  }

  const candidate = labels[0];
  return {
    tenantId:
      candidate && !reservedSubdomains.has(candidate) ? await resolveTenantKey(candidate) : null,
  };
}

async function resolveTenantKey(value: string): Promise<string | null> {
  const candidate = value.trim();
  if (isUuid(candidate)) {
    return candidate.toLowerCase();
  }

  const slug = normalizeTenantSlug(candidate);
  if (!slug) {
    return null;
  }
  if (slug === DEMO_TENANT_SLUG) {
    return DEMO_TENANT_ID;
  }

  return await findTenantIdBySlug(slug);
}

function normalizeTenantSlug(value: string): string | null {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : null;
}

async function findTenantIdBySlug(slug: string): Promise<string | null> {
  try {
    const db = await getAppDatabase();
    const result = await db.query(
      `
        SELECT id
        FROM tenants
        WHERE slug = ? AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      slug,
    );
    const id = result.rows[0]?.id;
    return typeof id === "string" && isUuid(id) ? id : null;
  } catch (error) {
    if (isMissingTenantsTableError(error)) {
      return null;
    }
    throw error;
  }
}

function isMissingTenantsTableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as Error & { code?: string }).code;
  return (
    code === "42P01" ||
    error.message.includes('relation "tenants" does not exist') ||
    error.message.includes("no such table: tenants")
  );
}

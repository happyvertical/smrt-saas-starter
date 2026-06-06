import type { RequestEvent } from "@sveltejs/kit";

export interface TenantResolution {
  tenantId: string | null;
}

const rootLikeHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const reservedSubdomains = new Set(["www", "api", "app", "admin"]);

export async function resolveTenant(event: RequestEvent): Promise<TenantResolution> {
  const headerTenant = event.request.headers.get("x-tenant-id");
  if (headerTenant) {
    return { tenantId: normalizeTenantSlug(headerTenant) };
  }

  const host = event.url.hostname.toLowerCase();
  if (rootLikeHosts.has(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { tenantId: null };
  }

  const baseDomain = process.env.PUBLIC_BASE_DOMAIN?.toLowerCase();
  if (baseDomain && host.endsWith(`.${baseDomain}`)) {
    const candidate = host.slice(0, -baseDomain.length - 1).split(".")[0];
    return { tenantId: candidate && !reservedSubdomains.has(candidate) ? candidate : null };
  }

  const labels = host.split(".");
  if (labels.length < 3) {
    return { tenantId: null };
  }

  const candidate = labels[0];
  return { tenantId: candidate && !reservedSubdomains.has(candidate) ? candidate : null };
}

function normalizeTenantSlug(value: string): string | null {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : null;
}

import type { TenantContext } from "@happyvertical/smrt-tenancy";

declare global {
  namespace App {
    interface Locals {
      tenantId: string | null;
      tenantContext?: TenantContext | null;
      user?: unknown;
      sessionId?: string | null;
      permissions?: string[];
    }
  }
}

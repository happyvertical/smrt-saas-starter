import type { TenantContext } from "@happyvertical/smrt-tenancy";
import type { StarterMembershipContext } from "$lib/server/authz";

declare global {
  namespace App {
    interface Locals {
      tenantId: string | null;
      tenantContext?: TenantContext | null;
      membership?: StarterMembershipContext | null;
      user?: unknown;
      sessionId?: string | null;
      permissions?: string[];
    }
  }
}

import { describe, expect, it, vi } from "vitest";
import { StarterInvitation } from "../models/StarterInvitation.js";
import {
  createStarterInvitation,
  hashInvitationToken,
  redeemStarterInvitationToken,
  revokeStarterInvitation,
  StarterInvitationError,
  type StarterInvitationStore,
  validateStarterInvitationToken,
} from "../services/invitations.js";

describe("starter invitation helpers", () => {
  it("creates email tenant-owner invitations with hashed tokens", async () => {
    const store = createMemoryStore();

    const result = await createStarterInvitation(store, {
      email: " Founder@Example.com ",
      purpose: "tenant-owner",
      invitedByUserId: "user-1",
    });

    expect(result.token).toHaveLength(43);
    expect(result.invitation).toMatchObject({
      email: "founder@example.com",
      type: "email",
      purpose: "tenant-owner",
      status: "pending",
      invitedByUserId: "user-1",
      maxUses: 1,
      useCount: 0,
    });
    expect(result.invitation.tokenHash).toBe(hashInvitationToken(result.token));
    expect(result.invitation.tokenHash).not.toBe(result.token);
  });

  it("validates purpose, email, expiry, and status", async () => {
    const store = createMemoryStore();
    const { token, invitation } = await createStarterInvitation(store, {
      email: "founder@example.com",
      purpose: "tenant-owner",
    });

    await expect(
      validateStarterInvitationToken(store, token, {
        email: "founder@example.com",
        purpose: "tenant-owner",
      }),
    ).resolves.toBe(invitation);

    await expect(
      validateStarterInvitationToken(store, token, {
        purpose: "tenant-owner",
      }),
    ).resolves.toBe(invitation);

    await expect(
      validateStarterInvitationToken(store, token, { email: "other@example.com" }),
    ).rejects.toThrow("different email");

    await expect(
      validateStarterInvitationToken(store, token, { purpose: "tenant-membership" }),
    ).rejects.toThrow("cannot be used");

    invitation.status = "revoked";
    await expect(validateStarterInvitationToken(store, token)).rejects.toThrow("revoked");
  });

  it("redeems email invitations once", async () => {
    const store = createMemoryStore();
    const { token, invitation } = await createStarterInvitation(store, {
      email: "founder@example.com",
      purpose: "tenant-owner",
    });

    await expect(
      redeemStarterInvitationToken(store, token, {
        purpose: "tenant-owner",
        acceptedByUserId: "user-2",
      }),
    ).rejects.toThrow("requires an email");

    await expect(
      redeemStarterInvitationToken(store, token, {
        email: "founder@example.com",
        purpose: "tenant-owner",
        acceptedByUserId: "user-2",
      }),
    ).resolves.toBe(invitation);

    expect(invitation).toMatchObject({
      status: "accepted",
      useCount: 1,
      acceptedByUserId: "user-2",
    });
    expect(invitation.acceptedAt).toBeInstanceOf(Date);
    expect(invitation.save).toHaveBeenCalledOnce();

    await expect(validateStarterInvitationToken(store, token)).rejects.toThrow("already been used");
  });

  it("supports shareable links with max-use limits", async () => {
    const store = createMemoryStore();
    const { token, invitation } = await createStarterInvitation(store, {
      type: "link",
      purpose: "tenant-owner",
      maxUses: 2,
    });

    await redeemStarterInvitationToken(store, token, { acceptedByUserId: "user-a" });
    expect(invitation.status).toBe("pending");
    await redeemStarterInvitationToken(store, token, { acceptedByUserId: "user-b" });
    expect(invitation.status).toBe("accepted");
    await expect(validateStarterInvitationToken(store, token)).rejects.toThrow("already been used");
  });

  it("requires tenant and role details for tenant-membership invitations", async () => {
    const store = createMemoryStore();

    await expect(
      createStarterInvitation(store, {
        email: "member@example.com",
        purpose: "tenant-membership",
      }),
    ).rejects.toBeInstanceOf(StarterInvitationError);

    await expect(
      createStarterInvitation(store, {
        email: "member@example.com",
        purpose: "tenant-membership",
        targetTenantId: "tenant-1",
        roleId: "role-1",
      }),
    ).resolves.toMatchObject({
      invitation: {
        targetTenantId: "tenant-1",
        roleId: "role-1",
      },
    });
  });

  it("revokes invitations by id", async () => {
    const store = createMemoryStore();
    const { invitation } = await createStarterInvitation(store, {
      email: "founder@example.com",
      purpose: "tenant-owner",
    });

    await expect(revokeStarterInvitation(store, invitation.id ?? "")).resolves.toBe(invitation);
    expect(invitation.status).toBe("revoked");
    expect(invitation.save).toHaveBeenCalledOnce();
  });
});

function createMemoryStore(): StarterInvitationStore {
  const rows = new Map<string, StarterInvitation>();

  return {
    async create(options) {
      const invitation = new StarterInvitation({
        id: `invite-${rows.size + 1}`,
        ...options,
      });
      invitation.save = vi.fn(async () => invitation) as StarterInvitation["save"];
      rows.set(invitation.id ?? "", invitation);
      return invitation;
    },
    async findByTokenHash(tokenHash) {
      return [...rows.values()].find((invitation) => invitation.tokenHash === tokenHash) ?? null;
    },
    async get({ id }) {
      return rows.get(id) ?? null;
    },
    async list() {
      return [...rows.values()];
    },
  };
}

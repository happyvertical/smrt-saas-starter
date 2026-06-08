import { SmrtCollection } from "@happyvertical/smrt-core";
import {
  StarterInvitation,
  type StarterInvitationPurpose,
  type StarterInvitationStatus,
} from "../models/StarterInvitation.js";

export class StarterInvitationCollection extends SmrtCollection<StarterInvitation> {
  static readonly _itemClass = StarterInvitation;

  async findByTokenHash(tokenHash: string): Promise<StarterInvitation | null> {
    const invitations = await this.list({ where: { tokenHash }, limit: 1 });
    return invitations[0] ?? null;
  }

  async findPendingByEmail(email: string): Promise<StarterInvitation | null> {
    const invitations = await this.list({
      where: { email: email.trim().toLowerCase(), status: "pending", type: "email" },
      limit: 1,
    });
    return invitations[0] ?? null;
  }

  async findByStatus(status: StarterInvitationStatus): Promise<StarterInvitation[]> {
    return await this.list({ where: { status } });
  }

  async findByPurpose(purpose: StarterInvitationPurpose): Promise<StarterInvitation[]> {
    return await this.list({ where: { purpose } });
  }
}

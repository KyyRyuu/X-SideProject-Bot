import { normalize, isGroup, encode, SERVERS } from "./jid.js";

export class Group {
  constructor(sock, store) {
    this.sock = sock;
    this.store = store;
  }

  metadata(jid, force = false) {
    if (this.store) return this.store.fetchGroupMetadata(this.sock, jid, force);
    return this.sock.groupMetadata(jid);
  }

  create(subject, participants) {
    return this.sock.groupCreate(subject, participants.map(normalize));
  }

  leave(jid) {
    return this.sock.groupLeave(jid);
  }

  promote(jid, participants) {
    return this._participants(jid, participants, "promote");
  }

  demote(jid, participants) {
    return this._participants(jid, participants, "demote");
  }

  add(jid, participants) {
    return this._participants(jid, participants, "add");
  }

  remove(jid, participants) {
    return this._participants(jid, participants, "remove");
  }

  async _participants(jid, participants, action) {
    const result = await this.sock.groupParticipantsUpdate(
      jid,
      participants.map(normalize),
      action
    );
    this.store?.invalidateGroup(jid);
    return result;
  }

  updateSubject(jid, subject) {
    return this.sock.groupUpdateSubject(jid, subject);
  }

  updateDescription(jid, description) {
    return this.sock.groupUpdateDescription(jid, description);
  }

  announce(jid, announce) {
    return this.sock.groupSettingUpdate(jid, announce ? "announcement" : "not_announcement");
  }

  restrict(jid, locked) {
    return this.sock.groupSettingUpdate(jid, locked ? "locked" : "unlocked");
  }

  ephemeral(jid, seconds) {
    return this.sock.groupToggleEphemeral(jid, seconds);
  }

  memberAddMode(jid, mode) {
    return this.sock.groupMemberAddMode(jid, mode);
  }

  inviteCode(jid) {
    return this.sock.groupInviteCode(jid);
  }

  revokeInvite(jid) {
    return this.sock.groupRevokeInvite(jid);
  }

  acceptInvite(code) {
    return this.sock.groupAcceptInvite(code);
  }

  inviteInfo(code) {
    return this.sock.groupGetInviteInfo(code);
  }

  requestList(jid) {
    return this.sock.groupRequestParticipantsList(jid);
  }

  approve(jid, participants) {
    return this.sock.groupRequestParticipantsUpdate(jid, participants.map(normalize), "approve");
  }

  reject(jid, participants) {
    return this.sock.groupRequestParticipantsUpdate(jid, participants.map(normalize), "reject");
  }

  all() {
    return this.sock.groupFetchAllParticipating();
  }
}

export function adminsOf(metadata) {
  const participants = metadata?.participants || [];
  const admins = participants
    .filter((p) => p.admin === "admin" || p.admin === "superadmin")
    .map((p) => normalize(p.phoneNumber || p.jid || p.id));
  const owner = metadata?.owner
    ? normalize(metadata.owner)
    : participants.find((p) => p.admin === "superadmin");
  return {
    admins,
    owner: typeof owner === "string" ? owner : normalize(owner?.phoneNumber || owner?.id)
  };
}

export function resolveTargets(m, args = []) {
  if (m.mentionedJid?.length) return m.mentionedJid;
  if (m.quoted?.sender) return [m.quoted.sender];
  return args
    .map((a) => a.replace(/\D/g, ""))
    .filter((d) => d.length >= 7)
    .map((d) => encode(d, SERVERS.user));
}

export function createGroup(sock, store) {
  return new Group(sock, store);
}

export { isGroup };

import * as baileys from "baileys";

const {
  jidDecode,
  jidEncode,
  jidNormalizedUser,
  isJidGroup,
  isJidBroadcast,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  isJidBot,
  isJidMetaAI,
  areJidsSameUser
} = baileys;

export const SERVERS = {
  user: "s.whatsapp.net",
  lid: "lid",
  group: "g.us",
  broadcast: "broadcast",
  newsletter: "newsletter"
};

export function normalize(jid) {
  if (!jid || typeof jid !== "string") return jid;
  return jidNormalizedUser(jid) || jid;
}

export function decode(jid) {
  return jidDecode(jid);
}

export function encode(user, server = SERVERS.user) {
  return jidEncode(String(user), server);
}

export function toUser(jid) {
  return decode(jid)?.user || String(jid).split("@")[0].split(":")[0];
}

export const isGroup = (jid) => !!jid && isJidGroup(jid);
export const isBroadcast = (jid) => !!jid && isJidBroadcast(jid);
export const isNewsletter = (jid) => !!jid && isJidNewsletter(jid);
export const isStatus = (jid) => !!jid && isJidStatusBroadcast(jid);
export const isLid = (jid) => !!jid && isLidUser(jid);
export const isBot = (jid) => !!jid && isJidBot(jid);
export const isMetaAI = (jid) => !!jid && isJidMetaAI(jid);

export const isUser = (jid) => decode(jid)?.server === SERVERS.user;

export const sameUser = (a, b) => !!a && !!b && areJidsSameUser(a, b);

export async function lidToPn(sock, jid, store) {
  if (!jid) return jid;
  if (!isLid(jid)) return normalize(jid);

  try {
    const mapped = await sock?.signalRepository?.lidMapping?.getPNForLID?.(jid);
    if (mapped) return normalize(mapped);
  } catch {
    /* fall through to metadata scan */
  }

  if (store?.groupMetadata) {
    const target = normalize(jid);
    for (const metadata of store.groupMetadata.values()) {
      for (const p of metadata.participants || []) {
        if (sameUser(p.lid, target) || p.lid === target) {
          return normalize(p.phoneNumber || p.jid || p.id);
        }
      }
    }
  }

  return normalize(jid);
}

export async function pnToLid(sock, jid) {
  if (!jid || isLid(jid)) return jid;
  try {
    const mapped = await sock?.signalRepository?.lidMapping?.getLIDForPN?.(jid);
    if (mapped) return mapped;
  } catch {
    /* ignore */
  }
  return jid;
}

export default {
  SERVERS,
  normalize,
  decode,
  encode,
  toUser,
  isGroup,
  isBroadcast,
  isNewsletter,
  isStatus,
  isLid,
  isBot,
  isMetaAI,
  isUser,
  sameUser,
  lidToPn,
  pnToLid
};

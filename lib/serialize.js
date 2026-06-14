import * as baileys from "baileys";
import { normalize, isGroup, isNewsletter, isStatus, isLid, sameUser } from "./jid.js";
import { typeOf, textOf, unwrap, download as downloadMedia, MEDIA_TYPES } from "./message.js";

const { getContentType } = baileys;

function preferPn(primary, alt) {
  if (primary && isLid(primary) && alt) return normalize(alt);
  return normalize(primary);
}

function coerceContent(content) {
  if (typeof content === "string") return { text: content };
  if (Buffer.isBuffer(content)) return { document: content, mimetype: "application/octet-stream" };
  return content;
}

function serializeQuoted(sock, m, contextInfo) {
  const quotedMessage = contextInfo?.quotedMessage;
  if (!quotedMessage) return null;

  const participant = normalize(contextInfo.participant);
  const inner = unwrap(quotedMessage);
  const type = getContentType(inner);
  const fakeObj = {
    key: {
      remoteJid: m.chat,
      fromMe: sameUser(participant, sock.user?.id),
      id: contextInfo.stanzaId,
      participant
    },
    message: quotedMessage
  };

  return {
    key: fakeObj.key,
    message: inner,
    type,
    sender: participant,
    fromMe: fakeObj.key.fromMe,
    id: contextInfo.stanzaId,
    text: textOf(quotedMessage),
    mentionedJid: inner?.[type]?.contextInfo?.mentionedJid || [],
    isMedia: MEDIA_TYPES.has(type),
    fakeObj,
    download: (options) => downloadMedia(fakeObj, { sock, ...options }),
    reply: (content, options) =>
      sock.sendMessage(m.chat, coerceContent(content), { quoted: fakeObj, ...options }),
    react: (emoji) => sock.sendMessage(m.chat, { react: { text: emoji, key: fakeObj.key } }),
    delete: () => sock.sendMessage(m.chat, { delete: fakeObj.key })
  };
}

export function serialize(sock, raw, ctx = {}) {
  if (!raw?.message) return raw;

  const m = {};
  m.raw = raw;
  m.key = raw.key;
  m.id = raw.key?.id;
  m.chat = preferPn(raw.key?.remoteJid, raw.key?.remoteJidAlt);
  m.fromMe = !!raw.key?.fromMe;
  m.pushName = raw.pushName || "";
  m.messageTimestamp = Number(raw.messageTimestamp) || 0;

  m.isGroup = isGroup(m.chat);
  m.isPrivate = !m.isGroup && !isNewsletter(m.chat) && !isStatus(m.chat);
  m.isNewsletter = isNewsletter(m.chat);
  m.isStatus = isStatus(m.chat);

  m.participant = m.isGroup ? preferPn(raw.key?.participant, raw.key?.participantAlt) : m.chat;
  m.sender = m.fromMe ? normalize(sock.user?.id) : m.participant;

  m.message = unwrap(raw.message);
  m.type = getContentType(m.message);
  const node = m.message?.[m.type];
  m.contextInfo = (typeof node === "object" && node?.contextInfo) || {};
  m.mentionedJid = m.contextInfo.mentionedJid || [];
  m.expiration = m.contextInfo.expiration;

  m.text =
    typeof node === "string" ? node : textOf(raw.message);
  m.body = m.text;
  m.isMedia = MEDIA_TYPES.has(m.type);

  m.quoted = serializeQuoted(sock, m, m.contextInfo);

  m.reply = (content, options = {}) =>
    sock.sendMessage(
      m.chat,
      coerceContent(content),
      { quoted: raw, ephemeralExpiration: m.expiration, ...options }
    );

  m.send = (content, options = {}) =>
    sock.sendMessage(m.chat, coerceContent(content), { ephemeralExpiration: m.expiration, ...options });

  m.react = (emoji) => sock.sendMessage(m.chat, { react: { text: emoji, key: m.key } });

  m.download = (options) => {
    if (m.isMedia) return downloadMedia(raw, { sock, ...options });
    if (m.quoted?.isMedia) return m.quoted.download(options);
    throw new Error("No downloadable media on this message");
  };

  m.forward = (jid, options = {}) =>
    sock.sendMessage(jid, { forward: raw, ...options });

  m.delete = () => sock.sendMessage(m.chat, { delete: m.key });

  m.copy = () => structuredClone({ key: raw.key, message: raw.message });

  return m;
}

export default serialize;

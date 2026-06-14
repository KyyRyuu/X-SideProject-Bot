import { serialize } from "./serialize.js";
import { normalize, isLid, sameUser, toUser, lidToPn } from "./jid.js";

async function resolveLidFields(sock, m, store) {
  if (isLid(m.chat)) m.chat = await lidToPn(sock, m.chat, store);
  if (isLid(m.sender)) m.sender = await lidToPn(sock, m.sender, store);
  if (isLid(m.participant)) m.participant = await lidToPn(sock, m.participant, store);
  if (Array.isArray(m.mentionedJid) && m.mentionedJid.length) {
    m.mentionedJid = await Promise.all(m.mentionedJid.map((j) => lidToPn(sock, j, store)));
  }
  if (m.quoted?.sender && isLid(m.quoted.sender)) {
    m.quoted.sender = await lidToPn(sock, m.quoted.sender, store);
  }
}

function matchParticipant(participant, jid) {
  return (
    sameUser(participant.id, jid) ||
    sameUser(participant.lid, jid) ||
    sameUser(participant.phoneNumber, jid) ||
    sameUser(participant.jid, jid)
  );
}

async function groupContext(sock, m, store) {
  const metadata = await store.fetchGroupMetadata(sock, m.chat).catch(() => null);
  if (!metadata) return { metadata: null, isAdmin: false, isBotAdmin: false };

  const admins = (metadata.participants || []).filter(
    (p) => p.admin === "admin" || p.admin === "superadmin"
  );
  const botJids = [sock.user?.id, sock.user?.lid].filter(Boolean).map(normalize);

  return {
    metadata,
    isAdmin: admins.some((p) => matchParticipant(p, m.sender)),
    isBotAdmin: admins.some((p) => botJids.some((b) => matchParticipant(p, b)))
  };
}

export function createHandler(deps) {
  const { sock, settings, logger, store, db, registry, converter, group } = deps;
  const cooldowns = new Map();

  const isOwner = (jid) => {
    const digits = toUser(jid).replace(/\D/g, "");
    return settings.ownerNumber.map((n) => n.replace(/\D/g, "")).includes(digits);
  };

  /** @param {import("baileys").WAMessage} raw */
  return async function handle(raw) {
    let m;
    try {
      if (!raw?.message) return;
      m = serialize(sock, raw, { store });
      if (!m?.chat) return;

      await resolveLidFields(sock, m, store);

      if (m.fromMe && settings.behaviour.selfIgnore) return;
      if (m.isGroup && !settings.behaviour.groups) return;

      const owner = m.fromMe || isOwner(m.sender);
      if (settings.behaviour.selfMode && !owner) return;
      if (db.user(m.sender).banned && !owner) return;

      const { prefix, command, args, text } = parseCommand(m.text, settings.prefix);
      if (command === null) return;

      const plugin = registry.find(command);
      if (!plugin) return;

      const now = Date.now();
      const last = cooldowns.get(m.sender) || 0;
      if (!owner && now - last < settings.behaviour.cooldown) return;
      cooldowns.set(m.sender, now);

      const gctx = m.isGroup ? await groupContext(sock, m, store) : { metadata: null, isAdmin: false, isBotAdmin: false };

      if (plugin.group && !m.isGroup) return m.reply("This command only works in groups.");
      if (plugin.private && m.isGroup) return m.reply("This command only works in private chat.");
      if (plugin.owner && !owner) return m.reply("Owner only.");
      if (plugin.admin && !gctx.isAdmin && !owner) return m.reply("Group admins only.");
      if (plugin.botAdmin && !gctx.isBotAdmin) return m.reply("I need to be a group admin first.");

      if (settings.behaviour.autoRead) await sock.readMessages([m.key]).catch(() => {});
      if (settings.behaviour.autoTyping) await sock.sendPresenceUpdate("composing", m.chat).catch(() => {});

      logger.info(`${command} from ${m.pushName || toUser(m.sender)} in ${m.isGroup ? "group" : "private"}`);

      await plugin.run(m, {
        sock,
        m,
        args,
        text,
        command,
        prefix,
        store,
        db,
        logger,
        settings,
        registry,
        group,
        converter,
        sendButton: (content, options) => sock.sendButton(m.chat, content, { quoted: raw, ...options }),
        metadata: gctx.metadata,
        isOwner: owner,
        isAdmin: gctx.isAdmin,
        isBotAdmin: gctx.isBotAdmin
      });
    } catch (error) {
      logger.error(error, "plugin execution error");
      try {
        await m?.reply(`An error occurred:\n${error.message || error}`);
      } catch {
        /* swallow secondary failures */
      }
    }
  };
}

function parseCommand(body, prefixes) {
  const empty = { prefix: "", command: null, args: [], text: "" };
  if (!body) return empty;

  const candidates = [...prefixes].sort((a, b) => b.length - a.length);
  let used = candidates.find((p) => p && body.startsWith(p));
  if (used === undefined) {
    if (!prefixes.includes("")) return empty;
    used = "";
  }

  const rest = body.slice(used.length).trim();
  if (!rest) return empty;

  const [word, ...args] = rest.split(/\s+/);
  return { prefix: used, command: word.toLowerCase(), args, text: args.join(" ") };
}

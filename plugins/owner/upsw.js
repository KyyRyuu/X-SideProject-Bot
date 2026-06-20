import { isUser, normalize } from "../../lib/jid.js";

const STATUS_JID = "status@broadcast";

const COLORS = ["#1F8A70", "#3B5998", "#7E57C2", "#C0392B", "#E67E22", "#16A085"];

function viewerList(store, sock, sender) {
  const jids = new Set();
  const add = (j) => {
    if (!j) return;
    const n = normalize(j);
    if (isUser(n)) jids.add(n);
  };

  for (const c of store.contacts.values()) add(c.phoneNumber || c.id);
  for (const id of store.chats.keys()) add(id);

  add(sock.user?.id);
  add(sender);

  return [...jids];
}

export default {
  command: ["upsw", "uploadsw", "story", "sw"],
  tags: ["owner"],
  help: ["upsw <text> | reply media with .upsw"],
  owner: true,

  async run(m, { sock, store, text, args }) {
    const target = m.isMedia ? m : m.quoted?.isMedia ? m.quoted : null;

    const statusJidList = viewerList(store, sock, m.sender);
    if (!statusJidList.length) {
      return m.reply("No known contacts yet to show the status to. Let the bot receive a few messages first.");
    }

    let content;
    if (target) {
      const buffer = await target.download();
      const caption = text || "";
      if (target.type === "imageMessage") content = { image: buffer, caption };
      else if (target.type === "videoMessage") content = { video: buffer, caption };
      else if (target.type === "audioMessage") content = { audio: buffer, mimetype: "audio/mp4", ptt: true };
      else content = { document: buffer, mimetype: "application/octet-stream" };
    } else {
      const body = text || m.quoted?.text;
      if (!body) return m.reply("Provide text, or reply to an image / video / audio with .upsw");
      content = {
        text: body,
        backgroundColor: COLORS[Math.floor(Math.random() * COLORS.length)],
        font: 0
      };
    }

    await m.react("⏳");
    const { backgroundColor, font, ...message } = content;
    await sock.sendMessage(STATUS_JID, message, {
      statusJidList,
      ...(backgroundColor !== undefined && { backgroundColor }),
      ...(font !== undefined && { font })
    });
    await m.react("✅");
    await m.reply(`Status posted — visible to ${statusJidList.length} contact(s).`);
  }
};

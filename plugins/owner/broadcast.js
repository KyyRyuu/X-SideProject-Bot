import { sleep } from "../../lib/helper.js";

export default {
  command: ["broadcast", "bc"],
  tags: ["owner"],
  help: ["broadcast <message>"],
  owner: true,

  async run(m, { sock, store, text }) {
    if (!text) return m.reply("Provide a message to broadcast.");
    const chats = [...store.chats.keys()];
    if (!chats.length) return m.reply("No known chats yet.");

    await m.reply(`Broadcasting to ${chats.length} chats...`);
    let sent = 0;
    for (const jid of chats) {
      try {
        await sock.sendMessage(jid, { text: `*Broadcast*\n\n${text}` });
        sent++;
        await sleep(800);
      } catch {
        /* skip unreachable chats */
      }
    }
    await m.reply(`Broadcast delivered to ${sent}/${chats.length} chats.`);
  }
};

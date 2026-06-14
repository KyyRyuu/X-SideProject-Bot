export default {
  command: ["join"],
  tags: ["owner"],
  help: ["join <link>"],
  owner: true,

  async run(m, { group, text }) {
    const match = (text || "").match(/chat\.whatsapp\.com\/([0-9A-Za-z]+)/);
    if (!match) return m.reply("Provide a valid invite link.");
    const jid = await group.acceptInvite(match[1]);
    await m.reply(`Joined: ${jid}`);
  }
};

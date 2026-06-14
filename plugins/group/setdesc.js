export default {
  command: ["setdesc"],
  tags: ["group"],
  help: ["setdesc <text>"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group, text }) {
    if (!text) return m.reply("Provide the new group description.");
    await group.updateDescription(m.chat, text);
    await m.reply("Group description updated.");
  }
};

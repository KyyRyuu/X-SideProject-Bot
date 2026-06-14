export default {
  command: ["setname", "setsubject"],
  tags: ["group"],
  help: ["setname <text>"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group, text }) {
    if (!text) return m.reply("Provide the new group name.");
    await group.updateSubject(m.chat, text);
    await m.reply("Group name updated.");
  }
};

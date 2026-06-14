export default {
  command: ["leave", "logout"],
  tags: ["owner"],
  help: ["leave"],
  owner: true,
  group: true,

  async run(m, { group }) {
    await m.reply("Leaving this group. Goodbye!");
    await group.leave(m.chat);
  }
};

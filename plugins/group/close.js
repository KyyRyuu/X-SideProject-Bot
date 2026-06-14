export default {
  command: ["close", "mute", "lock"],
  tags: ["group"],
  help: ["close"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group }) {
    await group.announce(m.chat, true);
    await m.reply("Group closed. Only admins can send messages.");
  }
};

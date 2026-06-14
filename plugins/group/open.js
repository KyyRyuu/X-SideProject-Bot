export default {
  command: ["open", "unmute", "unlock"],
  tags: ["group"],
  help: ["open"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group }) {
    await group.announce(m.chat, false);
    await m.reply("Group opened. Everyone can send messages.");
  }
};

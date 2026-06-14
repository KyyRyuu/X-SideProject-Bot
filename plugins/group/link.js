export default {
  command: ["link", "grouplink"],
  tags: ["group"],
  help: ["link"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group }) {
    const code = await group.inviteCode(m.chat);
    await m.reply(`https://chat.whatsapp.com/${code}`);
  }
};

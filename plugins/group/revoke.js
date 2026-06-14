export default {
  command: ["revoke", "resetlink"],
  tags: ["group"],
  help: ["revoke"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group }) {
    const code = await group.revokeInvite(m.chat);
    await m.reply(`Invite link reset.\nhttps://chat.whatsapp.com/${code}`);
  }
};

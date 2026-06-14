export default {
  command: ["requestlist", "joinrequests"],
  tags: ["group"],
  help: ["requestlist"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group }) {
    const list = await group.requestList(m.chat);
    if (!list?.length) return m.reply("No pending join requests.");
    const body = list.map((r, i) => `${i + 1}. ${(r.jid || r.id || "").split("@")[0]}`).join("\n");
    await m.reply(`*Pending join requests (${list.length})*\n${body}`);
  }
};

import { resolveTargets } from "../../lib/group.js";

export default {
  command: ["promote"],
  tags: ["group"],
  help: ["promote @user"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group, args }) {
    const targets = resolveTargets(m, args);
    if (!targets.length) return m.reply("Tag, reply, or pass a number to promote.");
    await group.promote(m.chat, targets);
    await m.reply(`Promoted ${targets.length} member(s).`);
  }
};

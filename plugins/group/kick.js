import { resolveTargets } from "../../lib/group.js";

export default {
  command: ["kick", "remove"],
  tags: ["group"],
  help: ["kick @user"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group, args }) {
    const targets = resolveTargets(m, args);
    if (!targets.length) return m.reply("Tag, reply, or pass a number to remove.");
    await group.remove(m.chat, targets);
    await m.reply(`Removed ${targets.length} member(s).`);
  }
};

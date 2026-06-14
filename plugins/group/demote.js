import { resolveTargets } from "../../lib/group.js";

export default {
  command: ["demote"],
  tags: ["group"],
  help: ["demote @user"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group, args }) {
    const targets = resolveTargets(m, args);
    if (!targets.length) return m.reply("Tag, reply, or pass a number to demote.");
    await group.demote(m.chat, targets);
    await m.reply(`Demoted ${targets.length} member(s).`);
  }
};

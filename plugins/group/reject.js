import { resolveTargets } from "../../lib/group.js";

export default {
  command: ["reject", "rejectjoin"],
  tags: ["group"],
  help: ["reject <number|all>"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group, args }) {
    let targets;
    if ((args[0] || "").toLowerCase() === "all") {
      const list = await group.requestList(m.chat);
      targets = list.map((r) => r.jid || r.id);
    } else {
      targets = resolveTargets(m, args);
    }
    if (!targets.length) return m.reply("Nobody to reject.");
    await group.reject(m.chat, targets);
    await m.reply(`Rejected ${targets.length} request(s).`);
  }
};

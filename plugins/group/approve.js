import { resolveTargets } from "../../lib/group.js";

export default {
  command: ["approve", "acceptjoin"],
  tags: ["group"],
  help: ["approve <number|all>"],
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
    if (!targets.length) return m.reply("Nobody to approve.");
    await group.approve(m.chat, targets);
    await m.reply(`Approved ${targets.length} request(s).`);
  }
};

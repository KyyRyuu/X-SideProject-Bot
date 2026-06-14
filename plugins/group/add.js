import { resolveTargets } from "../../lib/group.js";

export default {
  command: ["add", "invite"],
  tags: ["group"],
  help: ["add <number>"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group, args }) {
    const targets = resolveTargets(m, args);
    if (!targets.length) return m.reply("Provide a number to add, e.g. .add 62812xxxx");
    const result = await group.add(m.chat, targets);
    const failed = result.filter((r) => r.status !== "200");
    if (failed.length) {
      const note = failed.map((r) => `${r.jid?.split("@")[0]}: ${r.status}`).join("\n");
      return m.reply(`Some numbers could not be added directly:\n${note}`);
    }
    await m.reply(`Added ${targets.length} member(s).`);
  }
};

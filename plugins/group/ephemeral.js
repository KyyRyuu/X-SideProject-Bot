const PRESETS = { off: 0, "24h": 86400, "7d": 604800, "90d": 7776000 };

export default {
  command: ["ephemeral", "disappear"],
  tags: ["group"],
  help: ["ephemeral <off|24h|7d|90d>"],
  group: true,
  admin: true,
  botAdmin: true,

  async run(m, { group, args }) {
    const key = (args[0] || "").toLowerCase();
    if (!(key in PRESETS)) return m.reply(`Choose one: ${Object.keys(PRESETS).join(", ")}`);
    await group.ephemeral(m.chat, PRESETS[key]);
    await m.reply(`Disappearing messages set to ${key}.`);
  }
};

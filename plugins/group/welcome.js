export default {
  command: ["welcome"],
  tags: ["group"],
  help: ["welcome <on|off>"],
  group: true,
  admin: true,

  async run(m, { db, args }) {
    const state = (args[0] || "").toLowerCase();
    if (!["on", "off"].includes(state)) return m.reply("Usage: welcome on | welcome off");
    const config = db.group(m.chat);
    config.welcome = state === "on";
    db.touch();
    await m.reply(`Welcome / goodbye messages ${config.welcome ? "enabled" : "disabled"}.`);
  }
};

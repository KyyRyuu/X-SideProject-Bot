export default {
  command: ["mode", "selfmode"],
  tags: ["owner"],
  help: ["mode <self|public>"],
  owner: true,

  async run(m, { settings, args }) {
    const mode = (args[0] || "").toLowerCase();
    if (mode === "self") settings.behaviour.selfMode = true;
    else if (mode === "public") settings.behaviour.selfMode = false;
    else return m.reply(`Current mode: ${settings.behaviour.selfMode ? "self" : "public"}\nUsage: mode self | mode public`);
    await m.reply(`Mode set to ${settings.behaviour.selfMode ? "self (owner only)" : "public"}.`);
  }
};

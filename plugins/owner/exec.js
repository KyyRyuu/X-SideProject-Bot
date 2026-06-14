import { exec } from "../../lib/helper.js";

/**
 * Owner-only shell console. This intentionally runs arbitrary shell commands
 * and is RCE by design; it is gated by `owner: true`, which the handler only
 * grants to numbers in settings.ownerNumber (or the bot's own messages). Do not
 * relax that flag.
 */
export default {
  command: ["exec", "$", "sh"],
  tags: ["owner"],
  help: ["$ <shell command>"],
  owner: true,

  async run(m, { text }) {
    if (!text) return m.reply("Provide a shell command.");
    try {
      const { stdout, stderr } = await exec(text);
      await m.reply((stdout || stderr || "(no output)").slice(0, 4000));
    } catch (error) {
      await m.reply(`Error:\n${(error.stderr || error.message || String(error)).slice(0, 4000)}`);
    }
  }
};

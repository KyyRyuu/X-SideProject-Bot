import { exec, rawSource } from "../../lib/helper.js";

/**
 * Owner-only shell console. This intentionally runs arbitrary shell commands
 * and is RCE by design; it is gated by `owner: true`, which the handler only
 * grants to numbers in settings.ownerNumber (or the bot's own messages). Do not
 * relax that flag.
 *
 * The "$" sigil also runs WITHOUT a prefix (e.g. `$ ls`); "exec"/"sh" still
 * need one.
 */
export default {
  command: ["exec", "$", "sh"],
  tags: ["owner"],
  help: ["$ <shell command>"],
  owner: true,
  noPrefix: ["$"],

  async run(m, ctx) {
    const cmd = rawSource(m.body, ctx.settings.prefix, ctx.command) || ctx.text;
    if (!cmd) return m.reply("Provide a shell command.");
    try {
      const { stdout, stderr } = await exec(cmd);
      await m.reply((stdout || stderr || "(no output)").slice(0, 4000));
    } catch (error) {
      await m.reply(`Error:\n${(error.stderr || error.message || String(error)).slice(0, 4000)}`);
    }
  }
};

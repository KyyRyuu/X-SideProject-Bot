import { resolveTargets } from "../../lib/group.js";

export default {
  command: ["ban"],
  tags: ["admin"],
  help: ["ban @user"],
  owner: true,

  async run(m, { db, args }) {
    const [target] = resolveTargets(m, args);
    if (!target) return m.reply("Tag, reply, or pass a number to ban.");
    const user = db.user(target);
    user.banned = true;
    db.touch();
    await m.reply(`Banned ${target.split("@")[0]}. They can no longer use the bot.`);
  }
};

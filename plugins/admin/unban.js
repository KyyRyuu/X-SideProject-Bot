import { resolveTargets } from "../../lib/group.js";

export default {
  command: ["unban"],
  tags: ["admin"],
  help: ["unban @user"],
  owner: true,

  async run(m, { db, args }) {
    const [target] = resolveTargets(m, args);
    if (!target) return m.reply("Tag, reply, or pass a number to unban.");
    const user = db.user(target);
    user.banned = false;
    db.touch();
    await m.reply(`Unbanned ${target.split("@")[0]}.`);
  }
};

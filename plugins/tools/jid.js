import { decode, isLid } from "../../lib/jid.js";

export default {
  command: ["jid", "id", "whoami"],
  tags: ["tools"],
  help: ["jid"],

  async run(m) {
    const target = m.quoted?.sender || m.sender;
    const lines = [
      "*JID inspector*",
      `chat       : ${m.chat}`,
      `sender     : ${m.sender}`,
      `participant: ${m.participant}`,
      `target     : ${target} ${isLid(target) ? "(lid)" : "(pn)"}`,
      `decoded    : ${JSON.stringify(decode(target) || {})}`,
      `isGroup    : ${m.isGroup}`,
      `type       : ${m.type}`
    ];
    await m.reply(lines.join("\n"));
  }
};

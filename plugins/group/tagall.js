export default {
  command: ["tagall", "everyone"],
  tags: ["group"],
  help: ["tagall [message]"],
  group: true,
  admin: true,

  async run(m, { text, metadata }) {
    const participants = metadata?.participants || [];
    if (!participants.length) return m.reply("Could not read group members.");

    const mentions = participants.map((p) => p.id);
    const body = participants
      .map((p) => `@${p.id.split("@")[0]}`)
      .join("\n");

    await m.send({ text: `${text ? `${text}\n\n` : ""}${body}`, mentions });
  }
};

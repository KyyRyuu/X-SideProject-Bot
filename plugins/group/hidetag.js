export default {
  command: ["hidetag", "h"],
  tags: ["group"],
  help: ["hidetag [message]"],
  group: true,
  admin: true,

  async run(m, { text, metadata }) {
    const mentions = (metadata?.participants || []).map((p) => p.id);
    const content = text || m.quoted?.text || "";
    await m.send({ text: content, mentions });
  }
};

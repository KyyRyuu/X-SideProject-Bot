export default {
  command: ["toimg", "toimage"],
  tags: ["utility"],
  help: ["toimg (reply sticker)"],

  async run(m, { converter }) {
    const target = m.type === "stickerMessage" ? m : m.quoted;
    if (!target || target.type !== "stickerMessage") {
      return m.reply("Reply to a (non-animated) sticker with .toimg");
    }
    await m.react("⏳");
    const webp = await target.download();
    const png = await converter.toImage(webp);
    await m.reply({ image: png, caption: "Converted to image." });
    await m.react("✅");
  }
};

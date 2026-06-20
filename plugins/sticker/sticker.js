export default {
  command: ["sticker", "s", "stiker"],
  tags: ["sticker"],
  help: ["sticker (reply image/video)"],

  async run(m, { converter, settings }) {
    const target = m.isMedia ? m : m.quoted;
    if (!target || !["imageMessage", "videoMessage"].includes(target.type)) {
      return m.reply("Reply to or send an image/video with the caption .sticker");
    }

    await m.react("⏳");
    const buffer = await target.download();
    const webp = await converter.toSticker(buffer, {
      packname: settings.sticker.packname,
      author: settings.sticker.author,
      animated: target.type === "videoMessage"
    });

    await m.reply({ sticker: webp });
    await m.react("✅");
  }
};

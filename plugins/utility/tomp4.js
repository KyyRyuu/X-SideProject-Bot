export default {
  command: ["tomp4", "tovideo", "togif"],
  tags: ["utility"],
  help: ["tomp4 (reply animated sticker)"],

  async run(m, { converter }) {
    const target = m.type === "stickerMessage" ? m : m.quoted;
    if (!target || target.type !== "stickerMessage") {
      return m.reply("Reply to an animated sticker with .tomp4");
    }
    await m.react("⏳");
    const webp = await target.download();
    const mp4 = await converter.toVideo(webp);
    await m.reply({ video: mp4, caption: "Converted to video.", gifPlayback: true });
    await m.react("✅");
  }
};

export default {
  command: ["tomp3", "toaudio"],
  tags: ["tools"],
  help: ["tomp3"],

  async run(m, { converter }) {
    const target = m.isMedia ? m : m.quoted;
    if (!target || !["videoMessage", "audioMessage"].includes(target.type)) {
      return m.reply("Reply to or send a video with the caption .tomp3");
    }

    await m.react("⏳");
    const buffer = await target.download();
    const mp3 = await converter.toMp3(buffer);

    await m.reply({ audio: mp3, mimetype: "audio/mpeg" });
    await m.react("✅");
  }
};

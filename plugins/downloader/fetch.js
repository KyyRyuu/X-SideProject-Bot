import { isUrl } from "../../lib/helper.js";

export default {
  command: ["fetch", "get", "download"],
  tags: ["downloader"],
  help: ["fetch <url>"],

  async run(m, { args }) {
    const url = args[0];
    if (!isUrl(url)) return m.reply("Provide a valid http(s) URL.");

    await m.react("⏳");
    const response = await fetch(url);
    if (!response.ok) return m.reply(`Request failed: ${response.status} ${response.statusText}`);

    const type = response.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await response.arrayBuffer());
    const name = url.split("/").pop()?.split("?")[0] || "file";

    if (type.startsWith("image/")) await m.reply({ image: buffer, caption: name });
    else if (type.startsWith("video/")) await m.reply({ video: buffer, caption: name });
    else if (type.startsWith("audio/")) await m.reply({ audio: buffer, mimetype: type });
    else await m.reply({ document: buffer, mimetype: type, fileName: name });

    await m.react("✅");
  }
};

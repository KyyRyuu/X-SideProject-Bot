import { formatRuntime, formatSize } from "../../lib/helper.js";

export default {
  command: ["runtime", "uptime", "status"],
  tags: ["main"],
  help: ["runtime"],

  async run(m, { settings, registry }) {
    const mem = process.memoryUsage();
    const lines = [
      `*${settings.botName} status*`,
      `Uptime: ${formatRuntime(process.uptime())}`,
      `Heap: ${formatSize(mem.heapUsed)} / ${formatSize(mem.heapTotal)}`,
      `RSS: ${formatSize(mem.rss)}`,
      `Plugins: ${registry.all().length}`,
      `Node: ${process.version}`
    ];
    await m.reply(lines.join("\n"));
  }
};

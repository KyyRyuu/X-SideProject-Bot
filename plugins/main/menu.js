const THUMB = "https://cdn.discordapp.my.id/cdn/887523.jpg";
const FAVICON = "https://i.top4top.io/p_3817o60m70.png";

export default {
  command: ["menu", "help", "list"],
  tags: ["main"],
  help: ["menu"],

  async run(m, { sock, registry, settings, prefix }) {
    const p = prefix || (settings.prefix.find((x) => x) ?? "");
    const groups = new Map();

    for (const plugin of registry.all()) {
      const tag = (plugin.tags && plugin.tags[0]) || "misc";
      if (!groups.has(tag)) groups.set(tag, new Set());
      const usage = plugin.help?.length ? plugin.help : [].concat(plugin.command);
      for (const entry of usage) groups.get(tag).add(entry);
    }

    const header = [
      `┌─ *${settings.botName}*`,
      `│ Owner : ${settings.ownerName}`,
      `│ Prefix: ${settings.prefix.filter(Boolean).join(" ") || "(none)"}`,
      `└─────────────`,
      ""
    ];

    const body = [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([tag, cmds]) => {
        const items = [...cmds].sort().map((c) => `│ ${p}${c}`).join("\n");
        return `┌─ *${tag.toUpperCase()}*\n${items}\n└─────────────`;
      });

    const text = [...header, ...body].join("\n");

    await sock.sendWithThumbnail(
      m.chat,
      {
        text,
        title: settings.botName,
        body: settings.ownerName,
        thumbnailUrl: THUMB,
        faviconUrl: FAVICON,
        sourceUrl: null,
        renderLargerThumbnail: true
      },
      m.raw
    );
  }
};

export default {
  command: ["ping", "p"],
  tags: ["main"],
  help: ["ping"],

  async run(m) {
    const start = process.hrtime.bigint();
    await m.react("🏓");
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    await m.reply(`Pong! ${ms.toFixed(2)} ms`);
  }
};

export default {
  command: ["button", "btn", "buttondemo"],
  tags: ["tools"],
  help: ["button"],

  async run(m, { sock, settings }) {
    await sock.sendButton(m.chat, {
      title: settings.botName,
      text: "This single interface renders every interactive button type.",
      footer: "sock.sendButton() demo",
      buttons: [
        { type: "reply", text: "Run ping", id: ".ping" },
        { type: "url", text: "Open docs", url: "https://baileys.wiki" },
        { type: "copy", text: "Copy token", copy: "SATURN-7" },
        { type: "call", text: "Call owner", phone: settings.ownerNumber[0] },
        {
          type: "list",
          text: "Open menu",
          sections: [
            {
              title: "Tools",
              rows: [
                { title: "Ping", description: "Latency check", id: ".ping" },
                { title: "Runtime", description: "Bot status", id: ".runtime" }
              ]
            }
          ]
        }
      ]
    }, { quoted: m.raw });
  }
};

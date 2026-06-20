export default {
  command: ["carousel"],
  tags: ["example"],
  help: ["carousel"],

  async run(m, { sock }) {
    await sock.sendButton(m.chat, {
      text: "Featured items",
      footer: "Swipe to browse",
      cards: [
        {
          title: "Card One",
          text: "First interactive card.",
          footer: "Saturn",
          image: "https://picsum.photos/seed/saturn1/600/400",
          buttons: [
            { type: "reply", text: "Pick one", id: ".ping" },
            { type: "url", text: "Details", url: "https://baileys.wiki" }
          ]
        },
        {
          title: "Card Two",
          text: "Second interactive card.",
          footer: "Saturn",
          image: "https://picsum.photos/seed/saturn2/600/400",
          buttons: [
            { type: "copy", text: "Copy code", copy: "TWO" },
            { type: "call", text: "Call", phone: "62812000000" }
          ]
        }
      ]
    });
  }
};

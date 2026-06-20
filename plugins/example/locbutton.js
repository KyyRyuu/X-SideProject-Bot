export default {
  command: ["locbutton", "locbtn"],
  tags: ["example"],
  help: ["locbutton"],

  async run(m, { sock }) {
    await sock.sendButton(m.chat, {
      title: "Saturn HQ",
      subtitle: "Tap below",
      text: "Location header button demo.",
      footer: "sock.sendButton location mode",
      location: { latitude: -6.2, longitude: 106.816666, name: "Jakarta", address: "Indonesia" },
      buttons: [
        { type: "reply", text: "Ping", id: ".ping" },
        { type: "reply", text: "Menu", id: ".menu" }
      ]
    });
  }
};

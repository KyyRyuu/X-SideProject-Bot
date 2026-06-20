export default {
  botName: "X - Side Project",
  ownerName: "IkyyKzy",

  ownerNumber: ["6281248845231"],

  prefix: [".", "!", "#"],

  sticker: {
    packname: "X Side",
    author: "Baileys v7"
  },

  version: null, //gausah di apa"in

  sessionName: "x-side",

  connection: {
    usePairingCode: true,
    pairingNumber: "6281246493375",
    browser: ["XBot", "Chrome", "120.0.0"],
    printQR: false,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    reconnectDelay: 2000,
    maxReconnectDelay: 30000
  },

  behaviour: {
    selfIgnore: false,
    selfMode: true, // false = semua orang bisa pake
    groups: true, // biar aktif di group
    autoRead: true,
    autoTyping: false,
    cooldown: 2000
  },

  logger: {
    level: "info",
    baileysLevel: "silent"
  },

  database: {
    adapter: "json",
    path: "./database/database.json",
    saveInterval: 5000
  }
};

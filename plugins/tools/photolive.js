import { prepareWAMessageMedia, generateWAMessageFromContent } from "baileys";

const sessions = new Map();
const SESSION_TTL = 5 * 60 * 1000; // 5 menit

function cleanupSessions() {
  const now = Date.now();
  for (const [key, val] of sessions) {
    if (now - val.timestamp > SESSION_TTL) sessions.delete(key);
  }
}

export default {
  command: ["photolive", "livephoto"],
  tags: ["tools"],
  help: ["photolive"],

  async run(m, { sock }) {
    cleanupSessions();

    const sender = m.sender;
    const session = sessions.get(sender);

    const target = m.isMedia ? m : m.quoted;
    const type = target?.type;

    if (!target || !type) {
      if (session) {
        return m.reply(
          `✅ *Step 1 selesai* — Gambar sudah disimpan.\n\n` +
          `Sekarang kirim/reply *video* dengan caption *.photolive*\n` +
          `_(sesi kadaluarsa dalam ${Math.ceil((SESSION_TTL - (Date.now() - session.timestamp)) / 60000)} menit)_`
        );
      }
      return m.reply(
        `*Live Photo — Cara pakai:*\n\n` +
        `*Step 1:* Kirim atau reply gambar dengan caption *.photolive*\n` +
        `*Step 2:* Kirim atau reply video dengan caption *.photolive*\n\n` +
        `Bot akan menggabungkan keduanya menjadi Live Photo.`
      );
    }

    if (type === "imageMessage") {
      await m.react("⏳");
      const image = await target.download();
      sessions.set(sender, { image, timestamp: Date.now() });
      await m.react("✅");
      return m.reply(
        `✅ *Gambar disimpan!*\n\n` +
        `Sekarang kirim atau reply *video* dengan caption *.photolive*\n` +
        `_(sesi otomatis hapus dalam 5 menit)_`
      );
    }

    if (type === "videoMessage") {
      if (!session) {
        return m.reply(
          `⚠️ Belum ada gambar tersimpan.\n` +
          `Kirim dulu gambar dengan *.photolive*, baru video.`
        );
      }

      await m.react("⏳");
      sessions.delete(sender);

      const videoBuffer = await target.download();

      const [imageMedia, videoMedia] = await Promise.all([
        prepareWAMessageMedia(
          { image: session.image },
          { upload: sock.waUploadToServer }
        ),
        prepareWAMessageMedia(
          { video: videoBuffer },
          { upload: sock.waUploadToServer }
        )
      ]);

      const imgMsg = generateWAMessageFromContent(
        m.chat,
        {
          imageMessage: {
            ...imageMedia.imageMessage,
            contextInfo: {
              pairedMediaType: 5,
              statusSourceType: 0
            }
          }
        },
        {}
      );

      await sock.relayMessage(m.chat, imgMsg.message, { messageId: imgMsg.key.id });

      await sock.relayMessage(
        m.chat,
        {
          videoMessage: {
            ...videoMedia.videoMessage,
            contextInfo: {
              pairedMediaType: 6,
              statusSourceType: 0
            }
          },
          messageContextInfo: {
            messageAssociation: {
              associationType: 12,
              parentMessageKey: imgMsg.key
            }
          }
        },
        {}
      );

      return m.react("✅");
    }

    if (session) {
      return m.reply(`⚠️ Tipe media tidak didukung. Kirim *video* untuk melengkapi Live Photo.`);
    }
    return m.reply(`⚠️ Tipe media tidak didukung. Kirim *gambar* dulu untuk memulai.`);
  }
};
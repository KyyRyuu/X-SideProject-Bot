import {
  downloadContentFromMessage,
  prepareWAMessageMedia,
  generateWAMessageFromContent
} from "baileys"

export default {
  command: ["stickerprem", "sprem"],
  tags: ["sticker"],
  help: ["sprem"],
  owner: true,

  async run(m, { sock, command }) {
    try {
      if (!m.quoted) {
        return m.reply("⚠️ Reply sticker!")
      }

      const isPremium = command === "sprem"

      const sticker =
        m.quoted?.fakeObj?.message?.stickerMessage ||
        m.quoted?.message?.stickerMessage ||
        m.quoted?.msg ||
        m.quoted

      const stickerMime =
        sticker?.mimetype ||
        m.quoted?.mimetype ||
        ""

      if (!/webp|sticker|application\/was/.test(stickerMime)) {
        return m.reply("⚠️ Yang direply harus sticker!")
      }

      await m.react("⚡")

      let buf

      if (m.quoted.download) {
        buf = await m.quoted.download()
      } else {
        const stream = await downloadContentFromMessage(
          sticker,
          "sticker"
        )

        const chunks = []

        for await (const chunk of stream) {
          chunks.push(chunk)
        }

        buf = Buffer.concat(chunks)
      }

      const isAnimated = sticker?.isAnimated || false

      const isLottie =
        sticker?.isLottie ||
        stickerMime === "application/was" ||
        false

      function buildExif(meta) {
        const json = Buffer.from(
          JSON.stringify(meta),
          "utf-8"
        )

        const exif = Buffer.concat([
          Buffer.from([
            0x49, 0x49, 0x2a, 0x00,
            0x08, 0x00, 0x00, 0x00,
            0x01, 0x00, 0x41, 0x57,
            0x07, 0x00
          ]),
          Buffer.alloc(4),
          Buffer.from([0x16, 0x00, 0x00, 0x00]),
          json
        ])

        exif.writeUInt32LE(json.length, 14)

        return exif
      }

      function makeChunk(type, data) {
        const pad =
          data.length % 2
            ? Buffer.from([0])
            : Buffer.alloc(0)

        const sizeBuf = Buffer.alloc(4)

        sizeBuf.writeUInt32LE(data.length, 0)

        return Buffer.concat([
          Buffer.from(type),
          sizeBuf,
          data,
          pad
        ])
      }

      function setWebpExif(buffer, meta) {
        if (
          buffer.slice(0, 4).toString() !== "RIFF" ||
          buffer.slice(8, 12).toString() !== "WEBP"
        ) {
          throw new Error("File bukan WEBP valid")
        }

        const chunks = []
        let off = 12

        while (off + 8 <= buffer.length) {
          const type = buffer
            .slice(off, off + 4)
            .toString()

          const size = buffer.readUInt32LE(off + 4)

          const end =
            off + 8 + size + (size % 2)

          if (end > buffer.length) break

          if (type !== "EXIF") {
            chunks.push(buffer.slice(off, end))
          }

          off = end
        }

        const body = Buffer.concat([
          ...chunks,
          makeChunk("EXIF", buildExif(meta))
        ])

        const header = Buffer.alloc(12)

        header.write("RIFF", 0)
        header.writeUInt32LE(body.length + 4, 4)
        header.write("WEBP", 8)

        return Buffer.concat([
          header,
          body
        ])
      }

      const meta = {
        "sticker-pack-id":
          "2be7e369-b5ce-4706-a3d4-f78805a20328",

        "sticker-pack-name":
          isPremium
            ? "PREMIUM STICKER"
            : "AI STICKER",

        "sticker-pack-publisher":
          global.author || "Swiper Fvck",

        "accessibility-text":
          isPremium
            ? "Premium Sticker"
            : "AI Sticker",

        emojis: isPremium
          ? ["⭐", "💎", "👑"]
          : ["🤖", "✨", "💫"],

        "is-ai-sticker":
          isPremium ? 0 : 1,

        "is-avatar-sticker": 0,

        "is-lottie":
          isLottie ? 1 : 0,

        premium:
          isPremium ? 1 : 0
      }

      let finalBuf = buf

      if (!isLottie) {
        finalBuf = setWebpExif(
          buf,
          meta
        )
      }

      const media =
        await prepareWAMessageMedia(
          {
            sticker: finalBuf
          },
          {
            upload:
              sock.waUploadToServer
          }
        )

      const msg =
        await generateWAMessageFromContent(
          m.chat,
          {
            messageContextInfo: {
              limitSharingV2: {
                sharingLimited: true,
                trigger: "CHAT_SETTING",
                limitSharingSettingTimestamp:
                  Date.now().toString(),
                initiatedByMe: true
              }
            },

            stickerMessage: {
              ...media.stickerMessage,
              isAnimated,
              isAvatar: false,
              isAiSticker:
                !isPremium,
              isLottie
            }
          },
          {
            quoted: m,
            userJid:
              sock.user.id
          }
        )

      await sock.relayMessage(
        m.chat,
        msg.message,
        {
          messageId:
            msg.key.id
        }
      )

      await m.react("✅")
    } catch (err) {
      console.error(err)

      await m.react("❌")

      await m.reply(
        `❌ Error: ${err.message}`
      )
    }
  }
}
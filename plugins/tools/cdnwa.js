import { prepareWAMessageMedia } from "baileys"

function expiryToWIB(url) {
  try {
    const oe = new URL(url).searchParams.get("oe")

    if (!oe) return "-"

    return new Date(
      parseInt(oe, 16) * 1000
    ).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta"
    })
  } catch {
    return "-"
  }
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B"

  const sizes = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB"
  ]

  const i = Math.floor(
    Math.log(bytes) / Math.log(1024)
  )

  return `${(
    bytes /
    Math.pow(1024, i)
  ).toFixed(2)} ${sizes[i]}`
}

export default {
  command: ["cdnwa"],
  tags: ["tools"],
  help: ["cdnwa"],

  async run(m, { sock, sendButton }) {
    try {
      const target = m.quoted || m

      if (!target.isMedia) {
        return m.reply(
          "Reply media yang ingin diupload."
        )
      }

      await m.react("⏳")

      const buffer =
        await target.download()

      const type =
        target.type?.replace(
          "Message",
          ""
        ) ||
        target.mtype?.replace(
          "Message",
          ""
        ) ||
        "document"

      const media =
        await prepareWAMessageMedia(
          {
            [type]: buffer
          },
          {
            upload:
              sock.waUploadToServer
          }
        )

      const uploaded =
        media[type] ||
        media.imageMessage ||
        media.videoMessage ||
        media.audioMessage ||
        media.documentMessage

      const url = uploaded?.url

      if (!url) {
        throw new Error(
          "Gagal mendapatkan URL media."
        )
      }

      await sendButton({
        title: "CDN WhatsApp",
        text:
          `📁 URL : ${url}\n` +
          `💾 Size : ${formatFileSize(buffer.length)}\n` +
          `📛 Expired : ${expiryToWIB(url)}`,

        buttons: [
          {
            type: "copy",
            text: "📋 Copy URL",
            copy: url
          }
        ]
      })

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
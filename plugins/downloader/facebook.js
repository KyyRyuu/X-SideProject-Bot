const URL_REGEX =
  /https?:\/\/(www\.)?(facebook\.com|fb\.watch)\/[^\s]+/i

function extractUrl(m, args) {
  return (
    args.find(v => URL_REGEX.test(v)) ||
    (m.quoted?.text?.match(URL_REGEX) || [])[0] ||
    (m.text?.match(URL_REGEX) || [])[0] ||
    null
  )
}

export default {
  command: ["facebook", "fb", "fbdl"],
  tags: ["downloader"],
  help: ["facebook <url>"],

  async run(m, { args }) {
    const url = extractUrl(m, args)

    if (!url) {
      return m.reply(
        "Masukkan URL Facebook atau reply pesan yang berisi link Facebook."
      )
    }

    try {
      await m.react("⏳")

      const res = await fetch(
        "https://www.kzy.my.id/api/download/facebook?" +
        new URLSearchParams({ url })
      )

      const json = await res.json()

      if (!json?.status || !json?.result) {
        throw new Error("Data tidak ditemukan.")
      }

      const data = json.result

      await m.send({
        video: {
          url: data.media
        },
        caption:
          `🎬 ${data.title}\n` +
          `⏱️ ${data.duration}`
      })

      await m.react("✅")
    } catch (err) {
      console.error(err)

      await m.react("❌")

      await m.reply(
        `❌ Gagal mengunduh video\n\n${err.message}`
      )
    }
  }
}
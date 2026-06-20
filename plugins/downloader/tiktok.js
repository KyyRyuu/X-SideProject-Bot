const URL_REGEX =
  /https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/[^\s"'<>]+/i

// TikTok's photo/slide CDN rejects HEAD requests (405) but serves
// GET fine, so probe with a tiny ranged GET instead of HEAD.
async function isReachable(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(8000)
    })

    return res.ok || res.status === 206
  } catch {
    return false
  }
}

function extractUrl(m, args) {
  return (
    args.find(a => URL_REGEX.test(a)) ||
    (m.quoted?.text?.match(URL_REGEX) || [])[0] ||
    (m.quoted?.caption?.match(URL_REGEX) || [])[0] ||
    (m.text?.match(URL_REGEX) || [])[0] ||
    null
  )
}

export default {
  command: [
    "tiktok",
    "tt",
    "ttdl"
  ],

  tags: ["downloader"],
  help: ["tiktok"],

  async run(m, { sock, args, prefix, command }) {
    const url = extractUrl(m, args)

    if (!url) {
      return m.reply(
        `Masukkan URL TikTok atau reply pesan berisi link.\n\nContoh:\n${prefix}${command} https://www.tiktok.com/@user/video/123456789`
      )
    }

    try {
      await m.react("⏳")

      const res = await fetch(
        "https://www.tikwm.com/api/?" +
          new URLSearchParams({
            url,
            hd: 1
          }),
        {
          signal: AbortSignal.timeout(20000)
        }
      )

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const apiData = await res.json()

      if (apiData.code !== 0) {
        throw new Error(
          apiData.msg || "API Error"
        )
      }

      const data = apiData.data

      if (!data) {
        return m.reply(
          "❌ Data tidak ditemukan. Video mungkin private atau sudah dihapus."
        )
      }

      const caption =
        `👤 Author: ${data.author?.nickname || "Unknown"}\n` +
        `📝 Judul: ${data.title || "-"}\n` +
        `❤️ Likes: ${data.digg_count?.toLocaleString() || 0}\n` +
        `💬 Komentar: ${data.comment_count?.toLocaleString() || 0}\n` +
        `🔗 Dibagikan: ${data.share_count?.toLocaleString() || 0}\n` +
        `📅 ${new Date(
          data.create_time * 1000
        ).toLocaleString("id-ID", {
          dateStyle: "medium",
          timeStyle: "short"
        })}`

      const medias = []

      if (
        data.images &&
        data.images.length > 0
      ) {
        for (const img of data.images) {
          medias.push({
            type: "image",
            url: img
          })
        }
      } else if (data.play) {
        medias.push({
          type: "video",
          url: data.play,
          quality: "HD No WM"
        })
      }

      const validMedias = []

      for (const media of medias) {
        if (await isReachable(media.url)) {
          validMedias.push(media)
        }
      }

      // Fallback: if the reachability probe filtered everything
      // out (e.g. CDN blocks our requests) but the API clearly
      // returned media, trust the API URLs instead of dropping them.
      if (
        validMedias.length === 0 &&
        medias.length > 0
      ) {
        validMedias.push(...medias)
      }

      let success = false

      if (validMedias.length >= 2) {
        const albumItems =
          validMedias.map(
            (media, index) => ({
              [
                media.type === "video"
                  ? "video"
                  : "image"
              ]: {
                url: media.url
              },

              caption:
                index === 0
                  ? `${caption}\n\n📎 Album (${validMedias.length} media)`
                  : ""
            })
          )

        try {
          await sock.sendAlbum(
            m.chat,
            albumItems,
            {
              quoted: m.raw
            }
          )

          success = true
        } catch {
          for (
            let i = 0;
            i < validMedias.length;
            i++
          ) {
            const media =
              validMedias[i]

            const isVideo =
              media.type === "video"

            await sock.sendMessage(
              m.chat,
              {
                [
                  isVideo
                    ? "video"
                    : "image"
                ]: {
                  url: media.url
                },

                caption:
                  i === 0
                    ? `${caption}\n\n${isVideo ? "🎥" : "🖼️"} ${i + 1}/${validMedias.length}`
                    : `${isVideo ? "🎥" : "🖼️"} ${i + 1}/${validMedias.length}`
              },
              {
                quoted: m.raw
              }
            )

            if (
              i <
              validMedias.length - 1
            ) {
              await new Promise(
                resolve =>
                  setTimeout(
                    resolve,
                    1500
                  )
              )
            }
          }

          success = true
        }
      } else if (
        validMedias.length === 1
      ) {
        const media =
          validMedias[0]

        const isVideo =
          media.type === "video"

        await sock.sendMessage(
          m.chat,
          {
            [
              isVideo
                ? "video"
                : "image"
            ]: {
              url: media.url
            },

            caption:
              `${caption}\n\n` +
              (isVideo
                ? `🎥 ${media.quality || "Video"}`
                : "🖼️ Gambar")
          },
          {
            quoted: m.raw
          }
        )

        success = true
      }

      const audioUrl =
        data.music ||
        data.music_info?.play

      if (audioUrl) {
        const title =
          data.music_info?.title ||
          "TikTok Audio"

        const author =
          data.music_info?.author ||
          "Unknown"

        try {
          await sock.sendMessage(
            m.chat,
            {
              audio: {
                url: audioUrl
              },
              mimetype:
                "audio/mpeg"
            },
            {
              quoted: m.raw
            }
          )

          await sock.sendMessage(
            m.chat,
            {
              document: {
                url: audioUrl
              },
              mimetype:
                "audio/mpeg",

              fileName:
                `${title}.mp3`,

              caption:
                `🎵 Audio TikTok\n\n` +
                `📌 Judul: ${title}\n` +
                `👤 Author: ${author}`
            },
            {
              quoted: m.raw
            }
          )
        } catch {
          await m.reply(
            "⚠️ Audio ditemukan tapi gagal dikirim."
          )
        }
      }

      if (!success) {
        return m.reply(
          "❌ Tidak ada media yang bisa dikirim."
        )
      }

      await m.react("✅")
    } catch (err) {
      console.error(err)

      await m.react("❌")

      return m.reply(
        `❌ Gagal mendownload\n\n${err.message}`
      )
    }
  }
}
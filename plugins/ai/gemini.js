export default {
  command: ["gemini", "gm"],
  tags: ["ai"],
  help: ["gemini"],

  async run(m, { text }) {
    if (!text) {
      return m.reply(
        "Masukkan pertanyaan!\n\nContoh:\n.gemini apa itu AI?\n.gm jelaskan fotosintesis"
      )
    }

    try {
      await m.react("⏳")

      const url = new URL(
        "https://www.kzy.my.id/api/ai/gemini"
      )
      url.searchParams.set("question", text)

      const res = await fetch(url.toString())

      if (!res.ok) {
        throw new Error(
          `Request gagal (${res.status})`
        )
      }

      const json = await res.json()

      if (!json?.status || !json?.result) {
        throw new Error(
          "Respons API tidak valid"
        )
      }

      await m.reply(json.result)

      await m.react("✅")
    } catch (err) {
      console.error(err)

      await m.react("❌")

      await m.reply(
        `❌ ${err.message}`
      )
    }
  }
};

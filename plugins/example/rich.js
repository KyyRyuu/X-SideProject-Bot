const AVATAR  = "https://cdn.ornzora.eu.cc/4d2905ce-3707-4ec0-998a-68a3d851629f-FIORA.jpg";
const IMG1    = "https://cdn.ornzora.eu.cc/d987ff9c-c16c-4f1e-a8d6-953e375f4aec-FIORA.jpg";
const IMG2    = "https://cdn.ornzora.eu.cc/db9578dd-01e4-47ba-8a14-4c20e2aa4f52-FIORA.jpg";
const THUMB   = "https://cdn.ornzora.eu.cc/0800269d-8f1e-4c7e-b38e-8684db560345-FIORA.jpg";
const PRODUCT = "https://cdn.ornzora.eu.cc/152f4f0b-02fb-4d60-aacc-fc4cfa87ccdb-FIORA.jpg";
const SITE    = "https://example.com/";
const VIDEO   = "https://cdn.ornzora.eu.cc/5c3e1109-38d3-408e-926c-588694fd9581-FIORA.mp4";

export default {
  command: ["rich"],
  tags: ["example"],
  help: ["rich [text|code|table|grid|reels|video|product|post|tip|suggest|source|all]"],

  async run(m, { sock, args, settings }) {
    const sub = (args[0] || "all").toLowerCase();

    // ── text ──────────────────────────────────────────────────────────────
    if (sub === "text") {
      return sock.sendAiRich(m.chat, {
        disclaimer: settings.botName,
        submessages: [
          {
            type: "text",
            text: `# Halo Dunia\n## NIXCODE\n\n---\n\n=={ Yellow Text }==\n\n---\n\nHyperlink trusted:\n[Google](https://google.com)\n\nHyperlink untrusted:\n[OpenAI](!https://openai.com)\n\nAuto citation:\n[](https://github.com)\n\nBold *bold*, italic _italic_, strike ~coretan~`
          }
        ],
        footer: `${settings.botName} — rich text demo`
      }, { quoted: m.raw });
    }

    // ── code ──────────────────────────────────────────────────────────────
    if (sub === "code") {
      return sock.sendAiRich(m.chat, {
        disclaimer: settings.botName,
        submessages: [
          { type: "tip", text: "Contoh syntax highlighting otomatis:" },
          {
            type: "code",
            language: "javascript",
            // Cukup isi `code` saja — tokenizer jalan otomatis
            code: `class Bot {\n\tstatic greet(name) {\n\t\treturn 'Hello, ' + name;\n\t}\n}`
          },
          { type: "tip", text: "Python:" },
          {
            type: "code",
            language: "python",
            code: `def greet(name: str) -> str:\n    return f"Hello, {name}"`
          }
        ]
      }, { quoted: m.raw });
    }

    // ── table ─────────────────────────────────────────────────────────────
    if (sub === "table") {
      return sock.sendAiRich(m.chat, {
        disclaimer: settings.botName,
        submessages: [
          { type: "tip", text: "Format nested array — baris pertama = header:" },
          {
            type: "table",
            rows: [
              ["Nama", "Role", "Status"],
              ["Alice", "Developer", "Aktif"],
              ["Bob", "Designer", "Aktif"],
              ["[Carol](https://example.com)", "Manager", "Away"]   // hyperlink dalam cell
            ]
          }
        ]
      }, { quoted: m.raw });
    }

    // ── grid / image ──────────────────────────────────────────────────────
    if (sub === "grid") {
      return sock.sendAiRich(m.chat, {
        disclaimer: settings.botName,
        submessages: [
          { type: "tip", text: "Grid gambar — bisa URL tunggal atau array:" },
          { type: "image", url: [IMG1, IMG2] }
        ]
      }, { quoted: m.raw });
    }

    // ── video ─────────────────────────────────────────────────────────────
    if (sub === "video") {
      return sock.sendAiRich(m.chat, {
        disclaimer: settings.botName,
        submessages: [
          { type: "tip", text: "Video embed (isi url saja, atau object untuk detail lengkap):" },
          { type: "video", url: VIDEO },
          { type: "tip", text: "Dengan thumbnail & durasi manual:" },
          {
            type: "video",
            url: {
              url: VIDEO,
              file_length: 1000000,
              duration: 10,
              thumbnail: THUMB
            }
          }
        ]
      }, { quoted: m.raw });
    }

    // ── reels ─────────────────────────────────────────────────────────────
    if (sub === "reels") {
      return sock.sendAiRich(m.chat, {
        disclaimer: settings.botName,
        submessages: [
          { type: "tip", text: "Horizontal scroll reels:" },
          {
            type: "reels",
            items: [
              { title: "Demo Reel 1", profile: AVATAR, thumbnail: IMG1, url: SITE, source: "IG", verified: true },
              { title: "Demo Reel 2", profile: AVATAR, thumbnail: IMG2, url: SITE, source: "IG", verified: false },
              { title: "Demo Reel 3", profile: AVATAR, thumbnail: THUMB, url: SITE, source: "IG", verified: true }
            ]
          }
        ]
      }, { quoted: m.raw });
    }

    // ── product ───────────────────────────────────────────────────────────
    if (sub === "product") {
      return sock.sendAiRich(m.chat, {
        disclaimer: settings.botName,
        submessages: [
          { type: "tip", text: "Single product:" },
          {
            type: "product",
            data: { title: "Baju Keren", brand: "NIXCODE", price: "Rp 150.000", salePrice: "Rp 99.000", url: SITE, image: PRODUCT }
          },
          { type: "tip", text: "Multiple products (HScroll):" },
          {
            type: "product",
            data: [
              { title: "Baju Keren", brand: "NIXCODE", price: "Rp 150.000", salePrice: "Rp 99.000", url: SITE, image: PRODUCT },
              { title: "Celana Gaul", brand: "NIXCODE", price: "Rp 200.000", salePrice: "Rp 120.000", url: SITE, image: IMG1 }
            ]
          }
        ]
      }, { quoted: m.raw });
    }

    // ── post ──────────────────────────────────────────────────────────────
    if (sub === "post") {
      return sock.sendAiRich(m.chat, {
        disclaimer: settings.botName,
        submessages: [
          { type: "tip", text: "Social media post cards (HScroll):" },
          {
            type: "post",
            data: [
              {
                profile: AVATAR, username: "nixel", title: "Demo Post",
                caption: "Halo dari bot!", verified: true, url: SITE,
                thumbnail: IMG1, source: "INSTAGRAM", likes: 1200, comments: 300,
                footer: "nixel.my.id", icon: AVATAR
              },
              {
                profile: AVATAR, username: "nixel2", title: "Post Kedua",
                caption: "Another post example.", verified: false, url: SITE,
                thumbnail: IMG2, source: "THREADS", likes: 800, comments: 150,
                footer: "example.com", icon: AVATAR
              }
            ]
          }
        ]
      }, { quoted: m.raw });
    }

    // ── tip ───────────────────────────────────────────────────────────────
    if (sub === "tip") {
      return sock.sendAiRich(m.chat, {
        disclaimer: settings.botName,
        submessages: [
          { type: "tip", text: "Ini adalah metadata text (tampil lebih kecil/abu-abu)." },
          { type: "text", text: "Ini teks biasa di atasnya." },
          { type: "tip", text: "Bisa dipakai sebagai label section atau catatan kaki." }
        ]
      }, { quoted: m.raw });
    }

    // ── suggest ───────────────────────────────────────────────────────────
    if (sub === "suggest") {
      return sock.sendAiRich(m.chat, {
        disclaimer: settings.botName,
        submessages: [
          { type: "text", text: "Pilih topik berikutnya:" },
          { type: "suggest", text: "Apa itu NIXCODE?" },
          { type: "suggest", text: ["Bot WhatsApp", "AI Tools", "NIXCODE", "Baileys"] }
        ]
      }, { quoted: m.raw });
    }

    // ── source ────────────────────────────────────────────────────────────
    if (sub === "source") {
      return sock.sendAiRich(m.chat, {
        disclaimer: settings.botName,
        submessages: [
          { type: "text", text: "Contoh source card (hasil pencarian):" },
          {
            type: "source",
            sources: [
              [AVATAR, "https://github.com/ValdazGT/", "GitHub"],
              [AVATAR, SITE, "Example Site"]
            ]
          }
        ]
      }, { quoted: m.raw });
    }

    // ── all ───────────────────────────────────────────────────────────────
    return sock.sendAiRich(m.chat, {
      disclaimer: settings.botName,
      sources: [
        { title: "Example", provider: "Example", providerUrl: SITE, thumbnailUrl: IMG1, faviconUrl: AVATAR }
      ],
      footer: `${settings.botName} — semua tipe rich message`,
      submessages: [
        { type: "text", text: "# Rich Response Demo\nSemua tipe dalam satu pesan.\n\nHyperlink: [Klik di sini](https://example.com)" },
        {
          type: "code",
          language: "javascript",
          code: `const msg = 'Hello';\nconsole.log(msg);`
        },
        {
          type: "table",
          rows: [
            ["Command", "Deskripsi"],
            [".rich text", "Markdown & hyperlink"],
            [".rich code", "Syntax highlight"],
            [".rich table", "Tabel"],
            [".rich grid", "Grid gambar"],
            [".rich video", "Embed video"],
            [".rich reels", "Horizontal reels"],
            [".rich product", "Product card"],
            [".rich post", "Social post"],
            [".rich tip", "Metadata text"],
            [".rich suggest", "Suggestion pills"],
            [".rich source", "Source card"]
          ]
        },
        { type: "image", url: [IMG1, IMG2] },
        {
          type: "reels",
          items: [
            { title: "Reel 1", profile: AVATAR, thumbnail: IMG1, url: SITE, source: "IG", verified: true },
            { title: "Reel 2", profile: AVATAR, thumbnail: IMG2, url: SITE, source: "IG", verified: false }
          ]
        },
        { type: "suggest", text: [".rich text", ".rich code", ".rich table"] }
      ]
    }, { quoted: m.raw });
  }
};

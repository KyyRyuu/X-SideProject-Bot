# X Side — Framework Bot WhatsApp (Baileys v7)

Framework bot WhatsApp yang **bersih, modular, dan production-ready** di atas
**Baileys `7.0.0-rc13`**. Dilengkapi plugin hot-reload, penanganan LID/PN penuh,
satu fungsi universal `sock.sendButton`, database yang bisa diganti adapter, dan
store in-memory yang hemat memori — sebagian besar memakai modul bawaan Node.js.
Dependency luar hanya tiga: `baileys` (koneksi WA), `cheerio` (parsing hasil
konversi ezgif), dan `node-webpmux` (metadata pack stiker).

> Dokumen ini dibuat agar **orang baru** cepat paham strukturnya dan tahu
> **file mana yang harus diedit** untuk setiap kebutuhan.

---

## Daftar Isi

1. [Konsep Singkat](#konsep-singkat)
2. [Alur Sebuah Pesan (penting dipahami)](#alur-sebuah-pesan)
3. [Struktur Folder & Fungsi Tiap File](#struktur-folder--fungsi-tiap-file)
4. [Kebutuhan Sistem](#kebutuhan-sistem)
5. [Instalasi & Menjalankan](#instalasi--menjalankan)
6. [Konfigurasi (settings.js)](#konfigurasi-settingsjs)
7. [Self Mode](#self-mode)
8. [Membuat Plugin / Command Baru](#membuat-plugin--command-baru)
9. [Objek `m` dan `ctx`](#objek-m-dan-ctx)
10. [Panduan Lengkap `sock.sendButton`](#panduan-lengkap-socksendbutton)
11. [Wrapper Lain (sendWithThumbnail, sendAlbum, sendStickerPack)](#wrapper-lain-libwrapperjs)
12. [Group API](#group-api)
13. [Database & Menambah Adapter](#database--menambah-adapter)
14. [Fitur Backup](#fitur-backup)
15. [Deploy ke VPS / Pterodactyl / Docker](#deploy)
16. [Troubleshooting](#troubleshooting)

---

## Konsep Singkat

- **`index.js` tipis** — hanya mengurus koneksi, event, reconnect, dan hot
  reload. Tidak ada logika fitur di sini.
- **Semua fitur = plugin** — 1 file di `plugins/` = 1 command.
- **Hot reload** — edit file di `plugins/`, langsung dipakai tanpa restart.
  Plugin error tidak akan membuat bot crash.
- **`lib/` = mesin** — tiap file punya satu tanggung jawab jelas.

Aturan praktis saat ingin mengedit:

| Mau apa | Edit file |
|---|---|
| Ganti nama bot, owner, prefix, dll | `settings.js` |
| Tambah / ubah command | `plugins/<kategori>/<nama>.js` |
| Ubah cara pesan diproses / izin | `lib/handler.js` |
| Ubah cara koneksi / login | `lib/baileys.js` |
| Ubah format tombol | `lib/button.js` |
| Ubah utilitas grup | `lib/group.js` |
| Ubah struktur data tersimpan | `lib/database.js` |

---

## Alur Sebuah Pesan

Memahami urutan ini membuat editing jauh lebih mudah:

```
WhatsApp
   │  event "messages.upsert"
   ▼
index.js ───────────────► lib/handler.js (createHandler)
                              │
                              │ 1. serialize(sock, raw)      → lib/serialize.js
                              │    (membentuk objek `m`)
                              │ 2. resolveLidFields(...)      → ubah @lid jadi PN (lib/jid.js)
                              │ 3. cek selfIgnore / selfMode / banned
                              │ 4. parseCommand(text, prefix) → pisah prefix/command/args
                              │ 5. registry.find(command)     → lib/plugins.js
                              │ 6. cek izin: group/admin/botAdmin/owner/private
                              │ 7. plugin.run(m, ctx)         → file plugin kamu
                              ▼
                         balasan ke user (m.reply / sock.sendButton / dll)
```

Kalau ada error di langkah 7, handler menangkapnya, menulis ke log, lalu
membalas pesan error — **bot tetap hidup**.

---

## Struktur Folder & Fungsi Tiap File

```
.
├── index.js              Orkestrator: koneksi, event, reconnect, hot reload
├── settings.js           SEMUA konfigurasi ada di sini
│
├── lib/
│   ├── baileys.js        Membuat socket: auth, versi, pairing, config, bindButton
│   ├── handler.js        Otak pemrosesan pesan: serialize → izin → jalankan plugin
│   ├── serialize.js      Mengubah pesan mentah jadi objek `m` yang kaya
│   ├── message.js        Deteksi tipe & teks pesan + download media
│   ├── button.js         Implementasi sock.sendButton (interactive/carousel/location)
│   ├── group.js          Semua operasi grup + resolveTargets()
│   ├── jid.js            Utilitas JID + konversi LID <-> PN
│   ├── store.js          Cache in-memory (pesan, kontak, grup) + getMessage
│   ├── database.js       Database (adapter JSON bawaan) + facade user/group/chat
│   ├── cache.js          Cache TTL + LRU (dipakai retry & group cache)
│   ├── logger.js         Logger ringan, kompatibel pino (untuk Baileys)
│   ├── reload.js         Watcher fs.watch untuk hot reload plugin
│   ├── converter.js      Konversi media via ezgif.com (stiker, toimg, togif, tomp3)
│   ├── ezgif.js          Klien ezgif.com (upload → convert → download)
│   └── helper.js         Utilitas umum: run/exec/debounce/format/sleep
│
├── plugins/
│   ├── main/    Inti (menu, ping, runtime)
│   ├── owner/   Hanya owner (exec, eval, broadcast, mode, join, leave, backup, plugins, upsw)
│   ├── group/   Manajemen grup (promote, kick, tagall, open/close, welcome, dll)
│   ├── admin/   Moderasi (ban, unban)
│   ├── sticker/ Stiker (sticker, sprem)
│   ├── tools/   Konversi media (toimg, togif, tomp3, jid, cdnwa)
│   ├── downloader/  Unduhan (fetch, tiktok, instagram, facebook, mediafire, gitclone)
│   ├── ai/      Plugin AI (gemini)
│   └── example/ Contoh tombol (button, carousel, locbutton)
│
├── src/
│   └── fetchContact.js   ContactBook: kumpulkan kontak dari address book user
│
├── sessions/             Kredensial login (otomatis, JANGAN dibagikan)
├── database/             database.json + contact.json (otomatis)
└── temp/                 Berkas sementara (backup, sticker pack)
```

### Penjelasan singkat tiap file `lib/`

- **`baileys.js`** — `createSocket()` membuat koneksi: ambil versi WA terbaru,
  load auth dari `sessions/`, set config, lalu memasang `sock.sendButton` lewat
  `bindButton(sock)`. Saat `usePairingCode` aktif, browser dipaksa
  `Browsers.ubuntu("Chrome")` (wajib agar pairing tidak gagal).
- **`handler.js`** — `createHandler(deps)` mengembalikan fungsi yang dijalankan
  untuk setiap pesan. Di sinilah cek izin, cooldown, self-mode, dan dispatch ke
  plugin. Kalau mau ubah aturan akses global, ini tempatnya.
- **`serialize.js`** — membentuk objek `m`. Kalau mau menambah field/helper baru
  di `m`, tambahkan di sini.
- **`button.js`** — semua logika tombol. Mau menambah tipe tombol baru? Edit
  fungsi `toNativeFlow`.
- **`group.js`** — kelas `Group` (promote/demote/dll) + `resolveTargets(m,args)`
  untuk menentukan target perintah grup (mention → reply → nomor).
- **`jid.js`** — `lidToPn`, `pnToLid`, `normalize`, `isGroup`, `isLid`, dll.
- **`store.js`** — penyimpanan sementara di RAM, dibatasi agar tidak bocor.
- **`database.js`** — data permanen di `database/database.json`.
- **`converter.js` / `ezgif.js`** — konversi media (stiker, toimg, togif, tomp3)
  lewat ezgif.com; `ezgif.js` adalah klien upload→convert→download-nya.
- **`cache.js` / `logger.js` / `reload.js` / `helper.js`** — utilitas pendukung;
  jarang perlu disentuh.
- **`src/fetchContact.js`** — `ContactBook`, mengumpulkan & menyimpan kontak
  dari address book user (bukan dari peserta grup) ke `database/contact.json`.

---

## Kebutuhan Sistem

- **Node.js >= 20** (memakai `fetch`, `FormData`/`Blob`, `structuredClone`,
  `fs.watch` rekursif).
- **Koneksi internet** — `sticker`, `toimg`, `togif`, dan `tomp3`/`toaudio`
  mengonversi media lewat [ezgif.com](https://ezgif.com) (`lib/ezgif.js`),
  bukan biner lokal seperti ffmpeg.
- **Tanpa biner sistem (apt).** Metadata pack stiker disisipkan dengan paket
  npm [`node-webpmux`](https://www.npmjs.com/package/node-webpmux) — cukup
  `npm install`, tidak perlu `apt install ffmpeg webp` untuk fitur ini.

---

## Instalasi & Menjalankan

```bash
npm install
```

Edit `settings.js` (minimal isi `ownerNumber` dan nomor pairing), lalu:

```bash
npm start        # produksi
npm run dev      # auto-restart saat file inti berubah (node --watch)
```

### Login pertama kali

- **Pairing code (disarankan untuk VPS)** — set di `settings.js`:
  ```js
  connection: { usePairingCode: true, pairingNumber: "6281246493375" }
  ```
  Akan muncul kode 8 digit. Di HP yang nomornya sama:
  **WhatsApp → Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor
  telepon → masukkan kode**. (Kode kedaluwarsa ±60 detik — masukkan cepat.)
- **QR** — set `usePairingCode: false` lalu scan QR di terminal.

Plugin **hot-reload otomatis** — saat mengedit file di `plugins/` tidak perlu
restart.

---

## Konfigurasi (settings.js)

```js
export default {
  botName: "X - Side Project",
  ownerName: "IkyyKzy",
  ownerNumber: ["6281248845231"],   // nomor owner, format internasional, tanpa +
  prefix: [".", "!", "#"],          // "" = mode tanpa prefix

  sticker: { packname: "X Side", author: "Baileys v7" },
  version: null,                    // null = ambil versi WA terbaru otomatis
  sessionName: "x-side",            // nama folder di sessions/

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
    selfIgnore: false,   // true = abaikan pesan dari akun bot sendiri
    selfMode: true,      // true = hanya owner & bot yang bisa pakai (lihat di bawah)
    groups: true,
    autoRead: true,
    autoTyping: false,
    cooldown: 2000       // jeda antar-command per user (ms)
  },

  logger: { level: "info", baileysLevel: "silent" },
  database: { adapter: "json", path: "./database/database.json", saveInterval: 5000 }
};
```

---

## Self Mode

Secara default `behaviour.selfMode: true`. Artinya **hanya owner dan bot sendiri**
yang bisa menjalankan command, baik di grup maupun private. Pesan dari orang lain
diabaikan diam-diam (tanpa balasan).

- Owner ditentukan dari `ownerNumber`, atau pesan yang `fromMe` (dikirim akun
  bot itu sendiri).
- Untuk membuka bot ke publik: ubah ke `selfMode: false`, atau jalankan command
  `mode public` (owner-only). `mode self` untuk mengunci lagi.

---

## Membuat Plugin / Command Baru

1 file = 1 fitur. Buat file di `plugins/<kategori>/<nama>.js`. Tag pertama
dipakai untuk pengelompokan menu.

```js
export default {
  command: ["hello", "hi"],   // string | array | RegExp
  tags: ["tools"],
  help: ["hello <nama>"],     // ditampilkan di .menu

  owner: false,               // true = hanya owner
  admin: false,               // true = hanya admin grup
  botAdmin: false,            // true = bot harus admin grup
  group: false,               // true = hanya di grup
  private: false,             // true = hanya di private

  async run(m, ctx) {
    await m.reply(`Halo ${ctx.text || m.pushName}!`);
  }
};
```

Simpan file → otomatis aktif (hot reload). Hapus file → command hilang otomatis.
Kalau ada syntax error, hanya plugin itu yang gagal; bot tetap jalan dan errornya
muncul di log.

Membuat **command baru** = cukup tambah file plugin baru seperti di atas.

---

## Objek `m` dan `ctx`

### `m` (pesan yang sudah diserialisasi)

| Field | Keterangan |
|---|---|
| `m.text` / `m.body` | Teks pesan (tipe apa pun) |
| `m.sender` | JID pengirim (sudah PN, LID otomatis di-resolve) |
| `m.chat` | JID chat (grup/private) |
| `m.pushName` | Nama tampilan pengirim |
| `m.isGroup` / `m.isPrivate` / `m.isNewsletter` / `m.isStatus` | Jenis chat |
| `m.type` | Tipe konten aktif (mis. `imageMessage`) |
| `m.isMedia` | `true` bila pesan berisi media |
| `m.mentionedJid` | Daftar user yang di-mention (sudah PN) |
| `m.quoted` | Pesan yang di-reply (punya `.text`, `.sender`, `.download()`, `.reply()`, …) |
| `m.reply(isi)` | Balas sambil mengutip pesan |
| `m.send(isi)` | Kirim ke chat tanpa mengutip |
| `m.react(emoji)` | Beri reaksi |
| `m.download()` | Unduh media pesan ini / quoted |
| `m.forward(jid)` | Teruskan pesan |
| `m.delete()` | Hapus pesan |
| `m.copy()` | Salinan struktur pesan |

`isi` bisa berupa string (teks) atau objek konten Baileys:
`{ image }`, `{ video }`, `{ sticker }`, `{ document }`, `{ audio }`, dll.

### `ctx` (argumen kedua `run`)

```
sock, m, args, text, command, prefix,
store, db, logger, settings, registry,
group, converter, sendButton,
metadata, isOwner, isAdmin, isBotAdmin
```

- `args` = array kata setelah command. `text` = `args.join(" ")`.
- `group` = instance helper grup (lihat [Group API](#group-api)).
- `sendButton(content, options)` = pintasan ke `sock.sendButton(m.chat, …)`
  yang otomatis mengutip pesan. Kamu juga boleh memanggil
  `sock.sendButton(jid, content, options)` langsung.
- `metadata` = metadata grup (jika di grup).

---

## Panduan Lengkap `sock.sendButton`

Satu fungsi untuk **semua** jenis tombol. Tersedia di socket:

```js
await sock.sendButton(jid, content, options)
```

### 1. Tombol interaktif (native flow)

```js
await sock.sendButton(m.chat, {
  title: "X Side",          // judul header (opsional)
  subtitle: "Sub judul",    // opsional
  text: "Isi pesan",        // body (alias: body / caption)
  footer: "Footer",
  buttons: [
    { type: "reply", text: "Ping", id: ".ping" },
    { type: "url",   text: "Docs", url: "https://baileys.wiki" },
    { type: "copy",  text: "Copy", copy: "SATURN-7" },
    { type: "call",  text: "Telepon", phone: "62812..." },
    { type: "list",  text: "Menu", sections: [
      { title: "Tools", rows: [
        { title: "Ping", description: "cek latensi", id: ".ping" }
      ]}
    ]},
    { type: "flow",  name: "review_and_pay", params: { /* native flow mentah */ } }
  ]
}, { quoted: m.raw });
```

Kamu juga boleh memberi tombol **mentah** (langsung format Baileys); akan
diteruskan apa adanya:

```js
buttons: [{ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Hi", id: "1" }) }]
```

### 2. Header media (gambar / video / dokumen)

```js
await sock.sendButton(m.chat, {
  image: "https://.../foto.jpg",   // Buffer atau URL
  text: "Dengan header gambar",
  footer: "X Side",
  buttons: [{ type: "reply", text: "OK", id: "ok" }]
});
```

Ganti `image` dengan `video`, atau `document` (boleh tambah `fileName`,
`mimetype`, `jpegThumbnail`). `thumbnail` memakai gambar sebagai header kecil.

### 3. Carousel (kartu geser)

```js
await sock.sendButton(m.chat, {
  text: "Pilihan",
  cards: [
    { title: "Kartu 1", text: "…", image: "https://…",
      buttons: [{ type: "reply", text: "Pilih", id: "1" }] },
    { title: "Kartu 2", text: "…", image: "https://…",
      buttons: [{ type: "url", text: "Buka", url: "https://…" }] }
  ]
});
```

### 4. Tombol dengan header lokasi

```js
await sock.sendButton(m.chat, {
  title: "Kantor",
  subtitle: "Tap di bawah",
  text: "Header lokasi",
  footer: "X Side",
  location: { latitude: -6.2, longitude: 106.8166, name: "Jakarta", address: "Indonesia" },
  buttons: [{ type: "reply", text: "Ping", id: ".ping" }]
});
```

### 5. External Ad Reply (kartu link besar)

```js
await sock.sendButton(m.chat, {
  text: "Lihat ini",
  buttons: [{ type: "reply", text: "OK", id: "ok" }],
  externalAdReply: {
    title: "Judul",
    body: "Deskripsi",
    thumbnailUrl: "https://.../thumb.jpg",   // otomatis di-fetch jadi jpegThumbnail
    sourceUrl: "https://…",
    mediaType: 1,
    renderLargerThumbnail: true
  }
});
```

### 6. Opsi tambahan

- `ai: true` → menambahkan node bot AI (badge AI pada balasan).
- `mentions: ["62812...@s.whatsapp.net"]` → mention user.
- `contextInfo: { … }` → context info mentah (digabung).
- `options.quoted` → mengutip pesan tertentu.

Mau menambah **tipe tombol baru**? Edit fungsi `toNativeFlow` di `lib/button.js`.

---

## Wrapper Lain (`lib/wrapper.js`)

Selain `sock.sendButton`, ada wrapper lain yang otomatis terpasang ke socket
(via `bindWrapper` di `lib/baileys.js`): `sock.sendWithThumbnail`,
`sock.sendAlbum`, dan `sock.sendStickerPack`.

### `sock.sendWithThumbnail(jid, data, quoted, options)`

Mengirim pesan teks dengan **kartu link-preview ber-thumbnail besar** (mirip
tampilan share link). Cocok untuk menu. Berbasis `extendedTextMessage`, jadi
**wajib ada 1 URL** (`sourceUrl`) di teks agar thumbnail tampil di WhatsApp
biasa — ini batasan WhatsApp, bukan bug.

Field `data`:

| Field | Keterangan |
|---|---|
| `text` | Isi pesan |
| `title` | Judul kartu (bold) |
| `body` | Deskripsi kecil di kartu |
| `thumbnailUrl` | URL gambar besar (di-upload otomatis sebagai thumbnail-link) |
| `faviconUrl` | URL ikon kecil (opsional) |
| `sourceUrl` | Link yang tampil di baris pertama & jadi target tap (default `https://kzy.my.id`) |
| `renderLargerThumbnail` | `true` = thumbnail besar |
| `showSourceUrl` | `false` = jangan taruh URL di body (catatan: thumbnail bisa hilang di WA biasa) |
| `mentions` | Array JID yang di-mention |

```js
await sock.sendWithThumbnail(
  m.chat,
  {
    text: "Selamat datang di menu bot!",
    title: "X Side Menu",
    body: "Pilih perintah di bawah",
    thumbnailUrl: "https://cdn.discordapp.my.id/cdn/887523.jpg",
    faviconUrl: "https://cdn.discordapp.my.id/cdn/7d621e.jpg",
    sourceUrl: `https://wa.me/${settings.ownerNumber[0]}`,
    renderLargerThumbnail: true
  },
  m.raw
);
```

> Kalau butuh gambar **tanpa URL sama sekali**, jangan pakai ini — kirim sebagai
> pesan gambar biasa: `await m.send({ image: buffer, caption: text })`.

### `sock.sendAlbum(jid, medias, options)`

Mengirim beberapa gambar/video sebagai **satu album** (digabung jadi grid).
`medias` adalah array konten Baileys (`{ image }` / `{ video }`), boleh diberi
`caption`.

```js
await sock.sendAlbum(
  m.chat,
  [
    { image: { url: "https://contoh.com/1.jpg" }, caption: "Foto 1" },
    { image: buffer2 },
    { video: { url: "https://contoh.com/clip.mp4" } }
  ],
  { quoted: m.raw }
);
```

### `sock.sendStickerPack(jid, data, options)`

Mengirim **satu paket stiker** (sticker pack) yang bisa di-add langsung oleh
penerima. Stiker non-webp dikonversi otomatis via ffmpeg, dibundel jadi ZIP,
dienkripsi, lalu di-upload.

Field `data`:

| Field | Keterangan |
|---|---|
| `cover` | Gambar sampul / tray icon (Buffer / URL / path) — wajib |
| `stickers` | Array stiker; tiap item: Buffer/URL/path, atau `{ data, emojis, label }` |
| `name` | Nama paket |
| `publisher` | Nama pembuat |
| `description` | Deskripsi paket (opsional) |
| `emojis` | Emoji default per stiker (opsional) |

```js
await sock.sendStickerPack(
  m.chat,
  {
    cover: "https://contoh.com/cover.png",
    name: "X Side Pack",
    publisher: settings.botName,
    stickers: [
      "https://contoh.com/stiker1.webp",
      { data: bufferStiker2, emojis: ["🔥"] },
      "./assets/stiker3.png"
    ]
  },
  { quoted: m.raw }
);
```

> Butuh `ffmpeg` di server bila ada stiker/cover yang belum berformat WebP.

---

## Group API


Tersedia lewat `ctx.group` di dalam plugin:

```js
await group.promote(m.chat, ["62812...@s.whatsapp.net"]);
await group.demote(jid, targets);
await group.add(jid, targets);
await group.remove(jid, targets);
await group.updateSubject(jid, "Nama Baru");
await group.updateDescription(jid, "Deskripsi");
await group.announce(jid, true);     // true = hanya admin yang bisa kirim
await group.restrict(jid, true);     // true = hanya admin yang bisa edit info
await group.ephemeral(jid, 86400);   // pesan sementara (0 = mati)
await group.inviteCode(jid);         // -> kode undangan
await group.revokeInvite(jid);
await group.acceptInvite(code);
await group.requestList(jid);        // daftar permintaan gabung
await group.approve(jid, targets);
await group.reject(jid, targets);
const meta = await group.metadata(jid);  // metadata (pakai cache)
```

Untuk menentukan target perintah grup, pakai helper:

```js
import { resolveTargets } from "../../lib/group.js";
const targets = resolveTargets(m, args); // mention → reply → nomor dari args
```

---

## Database & Menambah Adapter

Data permanen tersimpan di `database/database.json`. Akses di plugin lewat
`ctx.db`:

```js
const user = ctx.db.user(m.sender);   // otomatis dibuat: { jid, banned }
user.banned = true;
ctx.db.touch();                       // jadwalkan simpan (debounced)

const g = ctx.db.group(m.chat);       // { jid, welcome, antilink, mute }
```

> Record user default hanya `{ jid, banned }`. Tambah field sesuai kebutuhanmu
> di `lib/database.js` (method `user()`).

### Mengganti backend (Mongo/Postgres/MySQL/Redis)

Cukup implementasi 2 method, plugin tidak perlu diubah:

```js
// lib/database.js
export class RedisAdapter {
  constructor(client) { this.client = client; }
  async load() { return JSON.parse((await this.client.get("x-side:db")) || "{}"); }
  async save(data) { await this.client.set("x-side:db", JSON.stringify(data)); }
}

// di dalam createDatabase():
case "redis":
  adapter = new RedisAdapter(klienRedisMu);
  break;
```

Lalu set `database.adapter: "redis"` di `settings.js`. Pola yang sama berlaku
untuk Mongo/Postgres/MySQL — `load()` mengembalikan seluruh objek, `save(data)`
menyimpannya.

---

## Fitur Backup

Command owner untuk mengarsipkan project tanpa file sampah (memakai `tar`):

| Command | Isi arsip |
|---|---|
| `.backup` | Backup penuh: kode + `settings.js` + `sessions/` + `database/`. **Tanpa** `node_modules`, `temp`, `.git`, `*.log`, `*.tar.gz`, `*.zip` |
| `.backup code` | Hanya kode: **juga tanpa** `sessions/` dan `database/` (aman dibagikan) |

Arsip `.tar.gz` dikirim ke owner sebagai dokumen. Jika lebih dari ~95 MB, file
disimpan di `temp/` dan tidak dikirim. **Ingat:** `.backup` penuh memuat
`sessions/` yang berisi kredensial login — simpan di tempat tepercaya saja.

---

## Deploy

### VPS (systemd)

```ini
# /etc/systemd/system/x-side.service
[Unit]
Description=X Side WhatsApp Bot
After=network-online.target

[Service]
WorkingDirectory=/opt/x-side
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5
User=x-side
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now x-side
journalctl -u x-side -f
```

### Pterodactyl

- Egg Node.js 20+, Startup: `node index.js`, Install: `npm install --omit=dev`.
- Set `connection.usePairingCode: true` (tidak ada terminal untuk scan QR).
- Jadikan `sessions/` dan `database/` sebagai volume agar login & data tidak
  hilang saat rebuild.

### Docker

```dockerfile
FROM node:20-slim
# ffmpeg hanya opsional — dipakai sock.sendStickerPack untuk input non-WebP.
# Fitur sticker/toimg/togif/tomp3 lewat ezgif.com tidak butuh biner apa pun.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
CMD ["node", "index.js"]
```

Mount `sessions/` dan `database/` sebagai volume.

---

## Troubleshooting

**Pairing code keluar tapi tidak bisa connect / HP tidak dapat notifikasi.**
Pastikan `usePairingCode: true` dan `pairingNumber` benar (format internasional,
hanya angka). Bila masih gagal: hentikan bot, hapus sesi lama, jalankan lagi
untuk kode baru:

```bash
rm -rf sessions/x-side
npm start
```

Pairing memakai browser `Browsers.ubuntu("Chrome")` secara otomatis (wajib agar
diterima server WhatsApp). Masukkan kode di HP yang **nomornya sama** dengan
`pairingNumber`, lewat menu *Perangkat tertaut*.

**Bot diam saja saat dipakai orang lain.** Itu karena `selfMode: true`
(default). Ubah ke `false` atau kirim `mode public` (owner).

**Stiker / konversi gagal.** Fitur `sticker`, `toimg`, `togif`, dan
`tomp3` mengonversi via ezgif.com — pastikan server punya akses internet, dan
dependensi npm sudah ter-install (`npm install`).

**Reconnect.** Bot reconnect otomatis dengan backoff untuk disconnect yang bisa
dipulihkan, dan berhenti pada `loggedOut` / `connectionReplaced` / `forbidden` /
`multideviceMismatch`. Jika logout, hapus `sessions/<sessionName>` lalu pairing
ulang.

---

## Lisensi

MIT.

---

## Update Terbaru

Ringkasan perubahan dari versi sebelumnya:

### Konversi media pindah ke ezgif.com (pengganti ffmpeg)
- **`lib/ezgif.js` (baru)** — klien ezgif.com: alur `upload → convert → download`
  (multipart, parsing hasil dengan `cheerio`, ada timeout). Hasil reverse-engineer
  form ezgif (perlu kirim field kanonik `percentage`/`background`, bukan hanya
  varian visualnya — kalau tidak, server balas HTTP 500).
- **`lib/converter.js` ditulis ulang** — semua konversi lewat ezgif:
  - `toImage` → `webp-to-jpg` (stiker animasi diambil frame pertamanya).
  - `toVideo` → `webp-to-mp4`.
  - `toSticker` animasi → `video-to-webp` → **stiker WebP yang benar-benar
    beranimasi** (square ~400px, 12fps, ≤6s, di bawah ~1MB); gambar diam →
    `jpg/png-to-webp`.
  - `toMp3` → `mp4-to-mp3` (audio dari video).

### Fitur / command baru
- **`.tomp3` / `.toaudio`** (`plugins/tools/tomp3.js`) — ekstrak audio MP3 dari
  video lewat ezgif `mp4-to-mp3`.
- **`.togif`** menggantikan `tomp4` — stiker animasi → video.
- **`.toimg`** kini mendukung stiker animasi (mengambil frame pertama).

### Tanpa biner sistem (apt) untuk stiker
- Metadata pack stiker (EXIF) kini disisipkan dengan paket npm
  **`node-webpmux`** (murni JS), menggantikan biner `webpmux` dari `apt`.
  Mendukung WebP statis maupun animasi; bila gagal, stiker tetap terkirim tanpa
  metadata. `ffmpeg` kini hanya dipakai `sock.sendStickerPack` untuk input
  non-WebP.

### Kontak hanya dari address book user
- **`src/fetchContact.js`** — `ContactBook.sync()` tidak lagi memanen nomor dari
  peserta grup (`groupFetchAllParticipating` & `harvestGroup` dihapus). Kontak
  hanya dikumpulkan dari address book user (`contacts.upsert` /
  `messaging-history.set`) lalu `resolveLids()` mengubah @lid menjadi nomor.

### Reorganisasi plugin & lainnya
- Plugin dirapikan: `main/` (menu, ping, runtime), `sticker/` (sticker, sprem),
  `example/` (button, carousel, locbutton), plus tambahan `ai/gemini`,
  beberapa `downloader/` (tiktok, instagram, facebook, mediafire, gitclone), dan
  owner tools (`eval`, `plugins`, `upsw`).
- Dependency luar: `baileys`, `cheerio`, `node-webpmux`.
- Ditambahkan `.gitignore` (abaikan `node_modules/`, `sessions/`, runtime
  `database/*.json`, `temp/`, `Test-media/`).

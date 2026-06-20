const URL_REGEX = /https?:\/\/(www\.)?mediafire\.com\/[^\s"'<>]+/i;

function extractUrl(m, args) {
    return args.find(a => URL_REGEX.test(a))
        || (m.quoted?.text?.match(URL_REGEX) || [])[0]
        || (m.quoted?.caption?.match(URL_REGEX) || [])[0]
        || (m.text?.match(URL_REGEX) || [])[0]
        || null;
}

async function mediafireDl(mfUrl) {
    const r = await fetch(mfUrl, { headers: { 'accept-encoding': 'gzip, deflate, br, zstd' } });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const html = await r.text();
    const url = html.match(/href="(.+?)" +id="downloadButton"/)?.[1];
    if (!url) throw new Error('Gagal menemukan URL download');
    const ft_m = html.match(/class="filetype"><span>(.+?)<(?:.+?) \((.+?)\)/);
    const fileType = `${ft_m?.[1] || '(no ext)'} ${ft_m?.[2] || '(no ext)'}`;
    const d_m = html.match(/<div class="description">(.+?)<\/div>/s)?.[1];
    const descriptionExt = d_m?.match(/<p>(.+?)<\/p>/)?.[1] || '-';
    const fileSize = html.match(/File size: <span>(.+?)<\/span>/)?.[1] || '-';
    const uploaded = html.match(/Uploaded: <span>(.+?)<\/span>/)?.[1] || '-';
    const fileName = html.match(/class="filename">(.+?)<\/div>/)?.[1] || 'file';
    return { fileName, fileSize, url, uploaded, fileType, descriptionExt };
}

export default {
    command: ['mediafire', 'mf', 'mfdl'],
    tags: ['downloader'],
    help: ['mediafire <url>'],
    description: 'Download file dari Mediafire',

    async run(m, { sock, args, prefix, command }) {
        const url = extractUrl(m, args);
        if (!url) return m.reply(`Masukkan URL Mediafire atau reply pesan berisi link.\n\nContoh:\n${prefix}${command} https://www.mediafire.com/file/xxxxx/file.zip/file`);
        try {
            await m.react('⏳');
            const result = await mediafireDl(url);
            await sock.sendMessage(m.chat, {
                document: { url: result.url },
                fileName: result.fileName,
                mimetype: 'application/octet-stream',
                caption: `*MEDIAFIRE DOWNLOADER*\n\n*Nama:* ${result.fileName}\n*Size:* ${result.fileSize}\n*Type:* ${result.fileType}\n*Uploaded:* ${result.uploaded}\n\n${result.descriptionExt}`
            }, { quoted: m.raw });
            await m.react('✅');
        } catch (e) {
            await m.react('❌');
            await m.reply(`Terjadi error\n\n${e.message}`);
        }
    }
};

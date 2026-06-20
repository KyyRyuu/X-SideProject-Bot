import crypto from 'crypto';

const URL_REGEX = /https?:\/\/(www\.)?instagram\.com\/[^\s"'<>]+/i;

const CONFIG = {
    secretKeyHex: '34ac9a1aa6aaa7d69a7075611898f16a85d496b1d8f1c7aaa5640a2d93d7af80',
    appVersionTS: '1770240123231',
    userAgent: 'Mozilla/5.0 (Linux; Android 10; RMX2185 Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.7559.109 Mobile Safari/537.36',
    corsProxy: 'https://cors.yardansh.com/'
};

function extractUrl(m, args) {
    return args.find(a => URL_REGEX.test(a))
        || (m.quoted?.text?.match(URL_REGEX) || [])[0]
        || (m.quoted?.caption?.match(URL_REGEX) || [])[0]
        || (m.text?.match(URL_REGEX) || [])[0]
        || null;
}

function detectType(url = '') {
    if (/\.mp4|\.mov|\.webm|\/v\/|video/i.test(url)) return 'video';
    if (/\.mp3|\.m4a|\.aac|audio/i.test(url)) return 'audio';
    return 'image';
}

async function fastDLDownload(igUrl) {
    const isStory = igUrl.includes('/stories/');
    let cleanUrl = igUrl.split('?')[0];
    if (!cleanUrl.endsWith('/')) cleanUrl += '/';

    const homeRes = await fetch(CONFIG.corsProxy + 'https://fastdl.app/id', {
        headers: { 'User-Agent': CONFIG.userAgent }
    });
    const cookieStr = (homeRes.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');

    const msecRes = await fetch(CONFIG.corsProxy + 'https://fastdl.app/msec', {
        headers: { 'User-Agent': CONFIG.userAgent, Cookie: cookieStr }
    });
    const msecJson = await msecRes.json();
    const ts = Math.floor(msecJson.msec * 1000) - 450;

    const signatureSource = isStory
        ? JSON.stringify({ url: cleanUrl }) + ts
        : cleanUrl + ts;

    const signature = crypto
        .createHmac('sha256', Buffer.from(CONFIG.secretKeyHex, 'hex'))
        .update(signatureSource)
        .digest('hex');

    let response;
    if (isStory) {
        response = await fetch(CONFIG.corsProxy + 'https://api-wh.fastdl.app/api/v1/instagram/story', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': CONFIG.userAgent, Origin: 'https://fastdl.app', Referer: 'https://fastdl.app/id/story-saver', Cookie: cookieStr },
            body: JSON.stringify({ url: cleanUrl, ts, _ts: CONFIG.appVersionTS, _tsc: 0, _sv: 2, _s: signature })
        });
    } else {
        const params = new URLSearchParams();
        params.append('sf_url', cleanUrl);
        params.append('ts', ts);
        params.append('_ts', CONFIG.appVersionTS);
        params.append('_tsc', '0');
        params.append('_sv', '2');
        params.append('_s', signature);

        response = await fetch(CONFIG.corsProxy + 'https://api-wh.fastdl.app/api/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': CONFIG.userAgent, Origin: 'https://fastdl.app', Referer: 'https://fastdl.app/id', Cookie: cookieStr },
            body: params.toString()
        });
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return { data, isStory };
}

function parseResult({ data, isStory }) {
    const medias = [];
    let meta = {};

    if (isStory) {
        const result = data.result?.[0];
        if (!result) return { medias, meta };

        meta = {
            title: null,
            username: result.user?.username || null,
            likes: null,
            comments: null,
            taken_at: result.taken_at || null,
            thumbnail: result.image_versions2?.candidates?.[0]?.url_wrapped || null
        };

        if (result.video_versions?.length > 0) {
            const v = result.video_versions[0];
            medias.push({ type: 'video', url: v.url_wrapped || v.url });
        } else if (result.image_versions2?.candidates?.length > 0) {
            const img = result.image_versions2.candidates[0];
            medias.push({ type: 'image', url: img.url_wrapped || img.url });
        }
    } else if (Array.isArray(data)) {
        const first = data[0];
        meta = {
            title: first?.meta?.title || null,
            username: first?.meta?.username || null,
            likes: first?.meta?.like_count || null,
            comments: first?.meta?.comment_count || null,
            taken_at: first?.meta?.taken_at || null,
            thumbnail: first?.thumb || null
        };

        for (const item of data) {
            if (!item.url?.length) continue;
            const best = item.url.sort((a, b) => (b.quality || 0) - (a.quality || 0))[0];
            const url = best.url;
            const type = best.type === 'mp4' ? 'video' : best.type === 'webp' || best.type === 'jpg' ? 'image' : detectType(url);
            medias.push({ type, url });
        }
    } else if (data && typeof data === 'object') {
        meta = {
            title: data.meta?.title || null,
            username: data.meta?.username || null,
            likes: data.meta?.like_count || null,
            comments: data.meta?.comment_count || null,
            taken_at: data.meta?.taken_at || null,
            thumbnail: data.thumb || null
        };

        if (data.url?.length > 0) {
            const best = data.url.sort((a, b) => (b.quality || 0) - (a.quality || 0))[0];
            const type = best.type === 'mp4' ? 'video' : best.type === 'webp' || best.type === 'jpg' ? 'image' : detectType(best.url);
            medias.push({ type, url: best.url });
        }
    }

    return { medias, meta };
}

export default {
    command: ['instagram', 'igdl', 'ig', 'insta'],
    tags: ['downloader'],
    help: ['instagram <url>'],

    async run(m, { sock, args, prefix, command }) {
        let url = extractUrl(m, args);
        if (!url) return m.reply(
            `*── 「 INSTAGRAM DL 」 ──*\n\n` +
            `Masukkan URL Instagram atau reply pesan berisi link.\n\n` +
            `📌 *Contoh:*\n` +
            `- Reels: \`${prefix}${command} https://www.instagram.com/reel/xxxxx/\`\n` +
            `- Post: \`${prefix}${command} https://www.instagram.com/p/xxxxx/\`\n` +
            `- Story: \`${prefix}${command} https://www.instagram.com/stories/user/xxxxx/\``
        );

        url = url.split('?')[0];

        try {
            await m.react('⏳');
            const raw = await fastDLDownload(url);
            const { medias, meta } = parseResult(raw);

            if (!medias.length) return m.reply(
                '❌ Gagal mengambil media!\n\nKemungkinan:\n- Akun private\n- Konten sudah dihapus\n- Story sudah expired'
            );

            const videos = medias.filter(d => d.type === 'video');
            const images = medias.filter(d => d.type === 'image');

            let caption = '*📥 INSTAGRAM DOWNLOADER*\n\n';
            if (meta.username) caption += `👤 *User:* @${meta.username}\n`;
            if (meta.title) caption += `📝 *Caption:* ${meta.title.slice(0, 100)}${meta.title.length > 100 ? '...' : ''}\n`;
            if (meta.likes && meta.likes > 0) caption += `❤️ *Likes:* ${meta.likes.toLocaleString('id-ID')}\n`;
            caption += `📎 *Total:* ${medias.length}`;
            if (videos.length) caption += ` (🎬 ${videos.length} video)`;
            if (images.length) caption += ` (🖼️ ${images.length} foto)`;
            caption += '\n';

            if (medias.length >= 2) {
                const albumItems = medias.map((media, i) => ({
                    [media.type === 'video' ? 'video' : 'image']: { url: media.url },
                    caption: i === 0 ? caption : '',
                    ...(media.type === 'video' ? { gifPlayback: false } : {})
                }));

                try {
                    await sock.sendAlbum(m.chat, albumItems, { quoted: m.raw });
                } catch {
                    for (let i = 0; i < medias.length; i++) {
                        const media = medias[i];
                        await sock.sendMessage(m.chat, {
                            [media.type === 'video' ? 'video' : 'image']: { url: media.url },
                            caption: i === 0 ? caption : `${media.type === 'video' ? '🎬' : '🖼️'} ${i + 1}/${medias.length}`,
                            ...(media.type === 'video' ? { gifPlayback: false } : {})
                        }, { quoted: m.raw });
                        if (i < medias.length - 1) await new Promise(r => setTimeout(r, 1500));
                    }
                }
            } else {
                const media = medias[0];
                await sock.sendMessage(m.chat, {
                    [media.type === 'video' ? 'video' : 'image']: { url: media.url },
                    caption,
                    ...(media.type === 'video' ? { gifPlayback: false } : {})
                }, { quoted: m.raw });
            }

            await m.react('✅');

        } catch (error) {
            await m.react('❌');
            if (error.message?.includes('403')) {
                return m.reply('❌ Akses ditolak. Konten mungkin private atau terlindungi.');
            }
            return m.reply(`❌ Gagal mendownload!\n\nError: ${error.message}`);
        }
    }
};

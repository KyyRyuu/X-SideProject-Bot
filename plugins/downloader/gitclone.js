const URL_REGEX = /https?:\/\/(www\.)?github\.com\/[^\s"'<>]+/i;
const REPO_REGEX = /([a-zA-Z0-9][a-zA-Z0-9-]{0,38})\/([a-zA-Z0-9._-]{1,100})/i;

function extractUrl(m, args) {
    const text = args.join(' ')
        || m.quoted?.text
        || m.quoted?.caption
        || m.text
        || '';
    const match = text.match(URL_REGEX) || text.match(REPO_REGEX);
    return match ? match[0] : null;
}

export default {
    command: ['gitclone', 'git', 'clonegit'],
    tags: ['downloader'],
    help: ['gitclone <url/user/repo>'],
    description: 'Unduh repo GitHub jadi ZIP',

    async run(m, { sock, args, prefix, command }) {
        let text = extractUrl(m, args);
        if (!text?.trim()) return m.reply(`Contoh:\n${prefix}${command} nazedev/hitori\natau reply pesan berisi link GitHub`);

        const cmdRegex = new RegExp(`^(${prefix})?(gitclone|git|clonegit)\\s*`, 'i');
        text = text.replace(cmdRegex, '').trim();

        const urlRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9][a-zA-Z0-9-]{0,38})\/([a-zA-Z0-9._-]{1,100})(?:\.git)?/i;
        const repoRegex = /([a-zA-Z0-9][a-zA-Z0-9-]{0,38})\/([a-zA-Z0-9._-]{1,100})/i;
        let match = text.match(urlRegex) || text.match(repoRegex);
        if (!match) return m.reply('Tidak menemukan username/repo di pesan');

        let [, user, repo] = match;
        repo = repo.split(/[?#@]/)[0].replace(/\.git$/i, '').trim();
        if (!user || !repo) return m.reply('Username atau repo tidak valid');

        const zipUrl = `https://api.github.com/repos/${user}/${repo}/zipball`;
        const repoUrl = `https://github.com/${user}/${repo}`;

        try {
            await m.react('⏳');
            const head = await fetch(zipUrl, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!head.ok) {
                await m.reply(head.status === 404 ? 'Repo tidak ditemukan atau bersifat private' : 'Gagal memproses permintaan');
                return m.react('❌');
            }
            await sock.sendMessage(m.chat, {
                document: { url: zipUrl },
                fileName: `${repo}.zip`,
                mimetype: 'application/zip',
                caption: `*Repo:* ${user}/${repo}\n🔗 ${repoUrl}`
            }, { quoted: m.raw });
            await m.react('✅');
        } catch (e) {
            await m.reply('Gagal memproses permintaan');
            await m.react('❌');
        }
    }
};

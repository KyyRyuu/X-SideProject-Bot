import { readFile, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { run, randomId, formatSize } from "../../lib/helper.js";

/** Always-excluded paths: regenerable or pure junk. */
const JUNK = ["node_modules", "temp", ".git", "*.log", "*.tar.gz", "*.zip"];

/** Additionally excluded when a code-only backup is requested. */
const STATE = ["sessions", "database"];

/**
 * Create a compressed project backup and send it to the owner as a document.
 *
 *   .backup        full backup (code + settings + sessions + database, no junk)
 *   .backup code   code-only backup (also excludes sessions/ and database/)
 */
export default {
  command: ["backup", "bk"],
  tags: ["owner"],
  help: ["backup [code]"],
  owner: true,

  async run(m, { args }) {
    const codeOnly = (args[0] || "").toLowerCase() === "code";
    const excludes = codeOnly ? [...JUNK, ...STATE] : JUNK;

    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `saturn-backup-${stamp}.tar.gz`;
    const out = join("temp", `${randomId(8)}-${fileName}`);

    await m.react("📦");
    try {
      const tarArgs = ["-czf", out, ...excludes.flatMap((e) => ["--exclude", e]), "."];
      await run("tar", tarArgs, { cwd: process.cwd() });

      const { size } = await stat(out);
      if (size > 95 * 1024 * 1024) {
        return m.reply(`Backup is ${formatSize(size)} — too large to send over WhatsApp. It is saved at ${out}.`);
      }

      const buffer = await readFile(out);
      await m.reply({
        document: buffer,
        fileName,
        mimetype: "application/gzip",
        caption: `*${codeOnly ? "Code" : "Full"} backup*\nSize: ${formatSize(size)}\nExcluded: ${excludes.join(", ")}`
      });
      await m.react("✅");
    } catch (error) {
      await m.react("❌");
      await m.reply(`Backup failed: ${error.message || error}\n(Is \`tar\` installed on this server?)`);
    } finally {
      await unlink(out).catch(() => {});
    }
  }
};

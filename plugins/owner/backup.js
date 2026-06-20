import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const exec = promisify(execFile)

export default {
  command: ["backup"],
  tags: ["owner"],
  help: ["backup"],
  owner: true,

  async run(m, { settings }) {
    let backupPath

    try {
      await m.react("⏳")

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")

      backupPath = path.join(
        os.tmpdir(),
        `backup-${timestamp}.tar.gz`
      )

      await exec("tar", [
        "--exclude=node_modules",
        "--exclude=temp",
        "--exclude=.git",
        "--exclude=_backup_files",
        "--exclude=*.log",
        "--exclude=*.zip",
        "--exclude=*.tar.gz",
        "-czf",
        backupPath,
        "."
      ])

      const stat = await fs.stat(backupPath)
      const buffer = await fs.readFile(backupPath)

      await m.reply({
        document: buffer,
        mimetype: "application/gzip",
        fileName: `backup-${timestamp}.tar.gz`,
        caption: [
          "✅ Backup berhasil",
          "",
          `📦 Ukuran: ${(stat.size / 1024 / 1024).toFixed(2)} MB`,
          `🤖 ${settings?.botName || "Saturn"}`
        ].join("\n")
      })

      await m.react("✅")
    } catch (err) {
      console.error(err)

      await m.react("❌")

      await m.reply(
        `❌ Backup gagal\n${err.message}`
      )
    } finally {
      if (backupPath) {
        await fs.unlink(backupPath).catch(() => {})
      }
    }
  }
}
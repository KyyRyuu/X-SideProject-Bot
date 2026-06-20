import { readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join, dirname, basename, relative, sep } from "node:path";

/**
 * Owner-only plugin manager. Lets you add, remove, fetch and reload plugin
 * files at runtime — all relative to the registry's plugins/ directory.
 *
 *   .plugins + <kategori>/<nama>.js   save the REPLIED code as a new plugin
 *   .plugins - <nama>.js              delete the matching plugin file
 *   .plugins ? <nama>.js [--text]     get a plugin (document, or text with --text)
 *   .plugins *                        reload every plugin and report ok/error/total
 */

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function matchFiles(files, query, dir) {
  const q = query.replace(/\\/g, "/").toLowerCase().replace(/\.js$/, "");
  return files.filter((file) => {
    const rel = relative(dir, file).replace(/\\/g, "/").toLowerCase();
    return rel.replace(/\.js$/, "") === q || basename(rel).replace(/\.js$/, "") === q;
  });
}

export default {
  command: ["plugins", "plugin", "pl"],
  tags: ["owner"],
  help: [
    "plugins"
  ],
  owner: true,

  async run(m, { text, registry }) {
    const dir = registry.dir;
    const rel = (file) => relative(dir, file).replace(/\\/g, "/");

    const raw = (text || "").trim();
    const op = raw[0];
    let rest = raw.slice(1).trim();
    const asText = /(^|\s)--text(\s|$)/.test(rest);
    rest = rest.replace(/--text/g, "").trim();

    // ── add ────────────────────────────────────────────────────────────────
    if (op === "+") {
      if (!rest) return m.reply("Usage: .plugins + <category>/<name>.js (reply the code).");
      const code = m.quoted?.text;
      if (!code) return m.reply("Reply to the message that holds the plugin code.");

      let safe = rest.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!safe.endsWith(".js")) safe += ".js";
      if (safe.includes("..")) return m.reply("Invalid path.");

      const full = join(dir, safe);
      if (!full.startsWith(dir + sep)) return m.reply("Path escapes the plugins directory.");

      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, code);

      const ok = await registry.load(full);
      return m.reply(
        ok
          ? `Saved and loaded ${rel(full)}.`
          : `Saved ${rel(full)} but it failed to load — check the log for the error.`
      );
    }

    // ── remove ─────────────────────────────────────────────────────────────
    if (op === "-") {
      if (!rest) return m.reply("Usage: .plugins - <name>.js");
      const files = await walk(dir);
      const found = matchFiles(files, rest, dir);
      if (!found.length) return m.reply(`No plugin matches "${rest}".`);
      if (found.length > 1) {
        return m.reply(`Multiple matches — be specific:\n${found.map((f) => `• ${rel(f)}`).join("\n")}`);
      }
      const file = found[0];
      registry.unload(file);
      await unlink(file);
      return m.reply(`Deleted ${rel(file)}.`);
    }

    // ── get ────────────────────────────────────────────────────────────────
    if (op === "?") {
      if (!rest) return m.reply("Usage: .plugins ? <name>.js [--text]");
      const files = await walk(dir);
      const found = matchFiles(files, rest, dir);
      if (!found.length) return m.reply(`No plugin matches "${rest}".`);
      if (found.length > 1) {
        return m.reply(`Multiple matches — be specific:\n${found.map((f) => `• ${rel(f)}`).join("\n")}`);
      }
      const file = found[0];
      const code = await readFile(file, "utf8");

      if (asText) return m.reply(`*${rel(file)}*\n\`\`\`${code}\`\`\``);
      return m.reply({
        document: Buffer.from(code),
        fileName: basename(file),
        mimetype: "text/javascript"
      });
    }

    // ── reload all ───────────────────────────────────────────────────────────
    if (op === "*") {
      const files = await walk(dir);
      let success = 0;
      const failed = [];
      for (const file of files) {
        if (await registry.load(file)) success++;
        else failed.push(rel(file));
      }
      const lines = [
        "*Plugin reload*",
        `Total   : ${files.length}`,
        `Success : ${success}`,
        `Error   : ${failed.length}`
      ];
      if (failed.length) lines.push("", "Failed:", ...failed.map((f) => `• ${f}`));
      return m.reply(lines.join("\n"));
    }

    return m.reply(
      [
        "*Plugin Manager*",
        ".plugins + <cat>/<name>.js  — save replied code as a plugin",
        ".plugins - <name>.js        — delete a plugin",
        ".plugins ? <name>.js [--text] — get a plugin (doc, or text)",
        ".plugins *                  — reload all & report errors"
      ].join("\n")
    );
  }
};
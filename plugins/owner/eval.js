import { createRequire } from "node:module";
import { inspect } from "node:util";
import { rawSource } from "../../lib/helper.js";

/**
 * Owner-only JavaScript evaluator. RCE by design, gated by `owner: true`.
 *
 *   => <expression>   evaluate and return the value   (e.g. => 1 + 1)
 *   >  <statements>   run a block, show console + return value
 *   .eval <code>      same as ">" but requires a prefix
 *
 * `=>`, `>` also run WITHOUT a prefix (see `noPrefix`). `await` is supported,
 * and `require()` is available via createRequire.
 */

const require = createRequire(import.meta.url);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const fmt = (value) => (typeof value === "string" ? value : inspect(value, { depth: 2, colors: false }));

export default {
  command: ["=>", ">", "eval"],
  tags: ["owner"],
  help: ["=> <expression>", "> <statements>"],
  owner: true,
  noPrefix: ["=>", ">"],

  async run(m, ctx) {
    const { sock, command, settings } = ctx;
    const code = rawSource(m.body, settings.prefix, command);
    if (!code) return m.reply("Provide code to run.\nExample: => 1 + 1");

    const logs = [];
    const capture = (...parts) => logs.push(parts.map(fmt).join(" "));
    const console = { log: capture, info: capture, warn: capture, error: capture, debug: capture };

    // "=>" returns the expression value; ">"/"eval" run a statement block.
    // If "=>" gets statements (const/let/multiple lines), fall back to a block.
    const buildExpr = () => new AsyncFunction("m", "ctx", "sock", "console", "require", `return (${code});`);
    const buildBlock = () => new AsyncFunction("m", "ctx", "sock", "console", "require", code);

    try {
      let fn;
      if (command === "=>") {
        try {
          fn = buildExpr();
        } catch {
          fn = buildBlock();
        }
      } else {
        fn = buildBlock();
      }
      const result = await fn(m, ctx, sock, console, require);

      const parts = [];
      if (logs.length) parts.push(logs.join("\n"));
      if (result !== undefined) parts.push(fmt(result));
      await m.reply((parts.join("\n") || "undefined").slice(0, 4000));
    } catch (error) {
      await m.reply(`Error: ${error?.stack || error?.message || String(error)}`.slice(0, 4000));
    }
  }
};

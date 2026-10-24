import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("./package.json", "utf8"));

// Sent as ?version= on connect, so the server can tell which SDK a client runs.
const define = { __SDK_VERSION__: JSON.stringify(version) };

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    // Both builds run at once; leave the script-tag build's files alone.
    clean: ["!apinator.min.js*"],
    minify: false,
    define,
  },
  {
    // Script-tag build: <script src=".../dist/apinator.min.js"> defines a
    // global `Apinator` (the client class; see src/global.ts).
    entry: { apinator: "src/global.ts" },
    format: ["iife"],
    platform: "browser",
    outExtension: () => ({ js: ".min.js" }),
    sourcemap: true,
    clean: false,
    minify: true,
    define,
  },
]);

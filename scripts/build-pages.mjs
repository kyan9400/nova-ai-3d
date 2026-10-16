// Static GitHub Pages build: sets GH_PAGES=1, runs `next build` (output: export) and
// adds .nojekyll so Pages serves the _next/ folder. Works on Windows, macOS and Linux.
import { spawnSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const result = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: { ...process.env, GH_PAGES: "1" },
});
if (result.status !== 0) process.exit(result.status ?? 1);

if (!existsSync("out")) {
  console.error("build:pages: out/ was not created");
  process.exit(1);
}
writeFileSync("out/.nojekyll", "");
// the gh-pages branch is a built static copy: tell Vercel's Git integration not to try to deploy it
writeFileSync("out/vercel.json", JSON.stringify({ git: { deploymentEnabled: false } }) + "
");
console.log("build:pages: out/ is ready for GitHub Pages (base path /nova-ai-3d)");

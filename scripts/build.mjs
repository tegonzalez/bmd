/**
 * Build implementation for bmd.
 * Bundles CLI and web frontend using esbuild.
 * Works on both Bun and Node.js with no runtime-specific APIs.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function runEsbuild(root, args) {
  return new Promise((resolveBuild, rejectBuild) => {
    const esbuildBin = resolve(root, "node_modules/.bin/esbuild");
    const child = spawn(esbuildBin, args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });

    child.once("error", rejectBuild);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveBuild();
        return;
      }

      rejectBuild(new Error(`esbuild failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}

export async function buildWeb({ root, distWebDir }) {
  console.log("build:web start");

  mkdirSync(distWebDir, { recursive: true });

  const htmlSrc = resolve(root, "src/web/index.html");
  if (!existsSync(htmlSrc)) {
    throw new Error(`Missing browser HTML entrypoint: ${htmlSrc}`);
  }

  for (const file of readdirSync(distWebDir)) {
    rmSync(resolve(distWebDir, file), { recursive: true, force: true });
  }

  await runEsbuild(root, [
    resolve(root, "src/web/app.ts"),
    "--bundle",
    `--outdir=${distWebDir}`,
    "--format=esm",
    "--platform=browser",
    "--target=esnext",
    "--splitting",
    "--conditions=bun",
    `--alias:node:crypto=${resolve(root, "src/web/node-crypto-shim.ts")}`,
    "--external:node:fs",
    "--external:node:path",
    "--external:node:url",
    "--external:node:child_process",
    "--external:ws",
  ]);

  await runEsbuild(root, [
    resolve(root, "src/web/styles.css"),
    "--bundle",
    `--outdir=${distWebDir}`,
    "--minify",
  ]);

  const html = readFileSync(htmlSrc, "utf8").replace('src="./app.ts"', 'src="./app.js"');
  writeFileSync(join(distWebDir, "index.html"), html);

  const files = readdirSync(distWebDir);
  console.log(`build:web complete: ${files.length} files`);
}

export async function buildCli({ root, distDir, cliOut, release }) {
  console.log("build:cli start");

  mkdirSync(distDir, { recursive: true });

  const args = [
    resolve(root, "src/cli/index.ts"),
    "--bundle",
    `--outfile=${cliOut}`,
    "--platform=node",
    "--target=node18",
    "--format=esm",
    "--conditions=bun",
    "--external:*.html",
    "--external:ws",
    "--tree-shaking=true",
    '--banner:js=#!/usr/bin/env node\nimport { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);',
  ];
  if (release) args.push("--minify");

  await runEsbuild(root, args);

  chmodSync(cliOut, 0o755);

  const binDir = resolve(root, "node_modules", ".bin");
  const binLink = resolve(binDir, "bmd");
  if (existsSync(binDir)) {
    try {
      if (existsSync(binLink)) unlinkSync(binLink);
      symlinkSync(relative(binDir, cliOut), binLink);
    } catch (err) {
      console.warn(`symlink skipped: ${err.message}`);
    }
  }

  console.log("build:cli complete");
}

export async function runBuild({ root = resolve(fileURLToPath(import.meta.url), "../.."), release = false, only } = {}) {
  const distDir = resolve(root, "dist");
  const distWebDir = resolve(distDir, "web");
  const cliOut = resolve(distDir, "cli.js");

  mkdirSync(distDir, { recursive: true });

  if (only !== "cli") {
    await buildWeb({ root, distWebDir });
  }

  if (only !== "web") {
    await buildCli({ root, distDir, cliOut, release });
  }
}

function parseOnlyFlag(argv) {
  const webOnly = argv.includes("--web-only");
  const cliOnly = argv.includes("--cli-only");

  if (webOnly && cliOnly) {
    throw new Error("Use only one build target flag: --web-only or --cli-only");
  }

  if (webOnly) return "web";
  if (cliOnly) return "cli";
  return undefined;
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === scriptPath && !process.argv.includes("--check") && !process.execArgv.includes("--check")) {
  await runBuild({
    root: resolve(scriptPath, "../.."),
    release: process.env.BMD_RELEASE === "1",
    only: parseOnlyFlag(process.argv.slice(2)),
  });
}

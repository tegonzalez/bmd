/**
 * Compatibility build entrypoint for package scripts and postinstall.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as build from "./scripts/build.mjs";

const root = dirname(fileURLToPath(import.meta.url));

if (!process.argv.includes("--check") && !process.execArgv.includes("--check")) {
  await build.runBuild({
    root,
    release: process.env.BMD_RELEASE === "1",
  });
}

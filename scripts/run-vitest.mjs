import { spawn, spawnSync } from "node:child_process";

const PRECONDITION =
  "BMD Vitest compatibility requires a real Node.js executable; put Node.js 18+ on PATH or set BMD_NODE to a real node binary.";

const resolvedVitestCli = new URL("../node_modules/vitest/vitest.mjs", import.meta.url);
const isBunRuntime =
  typeof globalThis.Bun !== "undefined" || typeof process.versions.bun !== "undefined";

function failPrecondition() {
  console.error(PRECONDITION);
  process.exit(1);
}

function isRealNode(candidate) {
  const result = spawnSync(
    candidate,
    [
      "-e",
      "process.exit(typeof globalThis.Bun === 'undefined' && Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)",
    ],
    { stdio: "ignore" },
  );

  return result.status === 0;
}

function selectNodeBinary() {
  if (process.env.BMD_NODE) {
    return isRealNode(process.env.BMD_NODE) ? process.env.BMD_NODE : null;
  }

  return isBunRuntime ? null : process.execPath;
}

const nodeBinary = selectNodeBinary();

if (!nodeBinary) {
  failPrecondition();
}

const child = spawn(
  nodeBinary,
  [resolvedVitestCli.pathname, "run", ...process.argv.slice(2)],
  { stdio: "inherit" },
);

child.on("error", failPrecondition);
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

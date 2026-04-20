import { readFile, writeFile, access } from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { parse as parseYaml } from 'yaml';
import type { RuntimeAdapter, SpawnOptions, SpawnHandle } from './types.ts';

export function createNodeRuntime(): RuntimeAdapter {
  return {
    async readFile(path: string): Promise<string> {
      return readFile(path, 'utf-8');
    },

    async readFileBytes(path: string): Promise<Uint8Array> {
      const buf = await readFile(path);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },

    async writeFile(path: string, data: string | Uint8Array): Promise<number> {
      await writeFile(path, data);
      return typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
    },

    async fileExists(path: string): Promise<boolean> {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },

    spawn(cmd: string[], opts: SpawnOptions = {}): SpawnHandle {
      const child = nodeSpawn(cmd[0]!, cmd.slice(1), {
        cwd: opts.cwd,
        env: opts.env as NodeJS.ProcessEnv,
        stdio: [
          opts.stdin !== undefined ? 'pipe' : 'ignore',
          opts.stdout === 'pipe' ? 'pipe' : 'inherit',
          opts.stderr === 'pipe' ? 'pipe' : 'inherit',
        ],
      });

      if (opts.stdin !== undefined && child.stdin) {
        const buf = typeof opts.stdin === 'string'
          ? Buffer.from(opts.stdin)
          : Buffer.from(opts.stdin);
        child.stdin.end(buf);
      }

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (typeof opts.timeout === 'number' && opts.timeout > 0) {
        timeoutId = setTimeout(() => { child.kill(); }, opts.timeout);
      }

      return {
        stdout: child.stdout ? Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array> : null,
        stderr: child.stderr ? Readable.toWeb(child.stderr) as unknown as ReadableStream<Uint8Array> : null,
        exited: new Promise<number>((resolve, reject) => {
          child.once('error', reject);
          child.once('close', (code) => {
            if (timeoutId) clearTimeout(timeoutId);
            resolve(code ?? 0);
          });
        }),
        kill(signal?) { child.kill(signal as NodeJS.Signals); },
      };
    },

    async sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    parseYAML(str: string): unknown {
      return parseYaml(str);
    },
  };
}

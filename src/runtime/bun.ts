import type { RuntimeAdapter, SpawnOptions, SpawnHandle } from './types.ts';

export function createBunRuntime(): RuntimeAdapter {
  return {
    async readFile(path: string): Promise<string> {
      return Bun.file(path).text();
    },

    async readFileBytes(path: string): Promise<Uint8Array> {
      return Bun.file(path).bytes();
    },

    async writeFile(path: string, data: string | Uint8Array): Promise<number> {
      return Bun.write(path, data);
    },

    async fileExists(path: string): Promise<boolean> {
      return Bun.file(path).exists();
    },

    spawn(cmd: string[], opts: SpawnOptions = {}): SpawnHandle {
      const proc = Bun.spawn(cmd, {
        cwd: opts.cwd,
        env: opts.env,
        stdin: opts.stdin !== undefined ? new Blob([opts.stdin as BlobPart]) : undefined,
        stdout: opts.stdout ?? 'pipe',
        stderr: opts.stderr ?? 'pipe',
        timeout: opts.timeout,
      });

      return {
        stdout: proc.stdout as ReadableStream<Uint8Array> | null,
        stderr: proc.stderr as ReadableStream<Uint8Array> | null,
        exited: proc.exited,
        kill(signal?) { proc.kill(signal as number); },
      };
    },

    async sleep(ms: number): Promise<void> {
      return Bun.sleep(ms);
    },

    parseYAML(str: string): unknown {
      return Bun.YAML.parse(str);
    },
  };
}

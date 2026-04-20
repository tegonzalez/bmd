export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdin?: string | Uint8Array;
  stdout?: 'pipe' | 'inherit';
  stderr?: 'pipe' | 'inherit';
  timeout?: number;
}

export interface SpawnHandle {
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  exited: Promise<number>;
  kill(signal?: string | number): void;
}

export interface RuntimeAdapter {
  readFile(path: string): Promise<string>;
  readFileBytes(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: string | Uint8Array): Promise<number>;
  fileExists(path: string): Promise<boolean>;
  spawn(cmd: string[], opts?: SpawnOptions): SpawnHandle;
  sleep(ms: number): Promise<void>;
  parseYAML(str: string): unknown;
}

/**
 * Runtime-agnostic file I/O for CLI commands.
 * Works on both Bun and Node.js.
 */
import { readFile, access } from 'node:fs/promises';

export async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf-8');
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

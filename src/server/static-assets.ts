import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

function canonicalPath(path: string): string {
  return existsSync(path) ? realpathSync.native(path) : resolve(path);
}

function isWithinRoot(root: string, candidate: string): boolean {
  const rootRelativePath = relative(root, candidate);
  return rootRelativePath === '' || (!rootRelativePath.startsWith('..') && !isAbsolute(rootRelativePath));
}

export function resolveWebAssetRoot(runtimeDir: string, overrideRoot?: string): string {
  if (overrideRoot) return resolve(overrideRoot);

  const devPath = resolve(runtimeDir, '../../dist/web');
  const bundlePath = resolve(runtimeDir, 'web');
  return existsSync(join(devPath, 'index.html')) ? devPath : bundlePath;
}

export function resolveStaticAssetPath(webRoot: string, urlPathname: string): string | null {
  let decodedPathname: string;

  try {
    decodedPathname = decodeURIComponent(urlPathname);
  } catch {
    return null;
  }

  if (decodedPathname.includes('\\')) return null;

  const requestPath = decodedPathname === '/' ? '/index.html' : decodedPathname;
  const root = canonicalPath(webRoot);
  const candidate = resolve(root, requestPath.replace(/^\/+/, ''));

  if (!isWithinRoot(root, candidate)) return null;

  const canonicalCandidate = canonicalPath(candidate);
  if (!isWithinRoot(root, canonicalCandidate)) return null;

  return canonicalCandidate;
}

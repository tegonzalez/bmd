/**
 * Unit tests for the serve CLI command flags and definitions.
 */
import { test, expect, describe } from 'bun:test';

describe('serve command definition', () => {
  let serveCommand: any;

  test('serve command can be imported', async () => {
    const mod = await import('../../src/cli/commands/serve.ts');
    serveCommand = mod.default;
    expect(serveCommand).toBeDefined();
  });

  test('serve command has correct meta name', async () => {
    const mod = await import('../../src/cli/commands/serve.ts');
    serveCommand = mod.default;
    expect(serveCommand.meta?.name).toBe('serve');
  });

  test('serve command has a description', async () => {
    const mod = await import('../../src/cli/commands/serve.ts');
    serveCommand = mod.default;
    expect(serveCommand.meta?.description).toBeTruthy();
  });

  test('serve command has --host flag', async () => {
    const mod = await import('../../src/cli/commands/serve.ts');
    serveCommand = mod.default;
    expect(serveCommand.args?.host).toBeDefined();
    expect(serveCommand.args?.host.type).toBe('string');
  });

  test('serve command has --port flag', async () => {
    const mod = await import('../../src/cli/commands/serve.ts');
    serveCommand = mod.default;
    expect(serveCommand.args?.port).toBeDefined();
    expect(serveCommand.args?.port.type).toBe('string');
  });

  test('serve command has --open flag', async () => {
    const mod = await import('../../src/cli/commands/serve.ts');
    serveCommand = mod.default;
    expect(serveCommand.args?.open).toBeDefined();
    expect(serveCommand.args?.open.type).toBe('boolean');
  });

  test('serve command has --mode flag', async () => {
    const mod = await import('../../src/cli/commands/serve.ts');
    serveCommand = mod.default;
    expect(serveCommand.args?.mode).toBeDefined();
    expect(serveCommand.args?.mode.type).toBe('string');
  });

  test('serve command has --color-mode flag', async () => {
    const mod = await import('../../src/cli/commands/serve.ts');
    serveCommand = mod.default;
    expect(serveCommand.args?.['color-mode']!).toBeDefined();
    expect(serveCommand.args?.['color-mode']!.type).toBe('string');
  });

  test('serve command has --readonly flag', async () => {
    const mod = await import('../../src/cli/commands/serve.ts');
    serveCommand = mod.default;
    expect(serveCommand.args?.readonly).toBeDefined();
    expect(serveCommand.args?.readonly.type).toBe('boolean');
  });

  test('serve command has --unsafe-html flag', async () => {
    const mod = await import('../../src/cli/commands/serve.ts');
    serveCommand = mod.default;
    expect(serveCommand.args?.['unsafe-html']!).toBeDefined();
    expect(serveCommand.args?.['unsafe-html']!.type).toBe('boolean');
  });

  test('serve command has optional positional input arg', async () => {
    const mod = await import('../../src/cli/commands/serve.ts');
    serveCommand = mod.default;
    expect(serveCommand.args?.input).toBeDefined();
    expect(serveCommand.args?.input.required).toBe(false);
  });
});

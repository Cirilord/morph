import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runCli } from './index.js';

describe('runCli', () => {
  it('validates a schema file', async () => {
    const schemaPath = await writeSchema(`
      datasource api {
        url = env("API_URL")
      }

      generator client {
        output = "./generated/client"
      }

      type User {
        id Int
      }

      resource users {
        path = "/users"

        action list {
          method = GET
          response = User[]
        }
      }
    `);
    const io = createTestIO();

    const exitCode = await runCli(['node', 'morph', 'validate', '--schema', schemaPath], io);

    expect(exitCode).toBe(0);
    expect(io.stdoutOutput()).toContain('Schema is valid:');
    expect(io.stderrOutput()).toBe('');
  });

  it('prints diagnostics for invalid schemas', async () => {
    const schemaPath = await writeSchema(`
      datasource api {
        url = env("API_URL")
      }

      generator client {
        output = "./generated/client"
      }

      resource users {
        path = "/users"

        action list {
          method = GET
          response = MissingUser[]
        }
      }
    `);
    const io = createTestIO();

    const exitCode = await runCli(['node', 'morph', 'validate', '--schema', schemaPath], io);

    expect(exitCode).toBe(1);
    expect(io.stdoutOutput()).toBe('');
    expect(io.stderrOutput()).toContain(
      'error unknown_type: Unknown type "MissingUser" used in action "users.list" response.'
    );
  });

  it('returns an error for missing schema files', async () => {
    const io = createTestIO();

    const exitCode = await runCli(['node', 'morph', 'validate', '--schema', './missing.schema.morph'], io);

    expect(exitCode).toBe(1);
    expect(io.stdoutOutput()).toBe('');
    expect(io.stderrOutput()).toContain('error cli_error:');
  });

  it('generates client files', async () => {
    const schemaPath = await writeSchema(`
      datasource api {
        url = env("API_URL")
      }

      generator client {
        output = "./generated/client"
      }

      type User {
        id Int @map("usr_id")
        name String @map("usr_name")
      }

      resource users {
        path = "/users"

        action list {
          method = GET
          response = User[]
        }
      }
    `);
    const io = createTestIO();

    const exitCode = await runCli(['node', 'morph', 'generate', '--schema', schemaPath], io);
    const generatedDirectory = join(schemaPath, '..', 'generated', 'client');

    expect(exitCode).toBe(0);
    expect(io.stdoutOutput()).toContain('Generated Morph client:');
    expect(io.stderrOutput()).toBe('');
    await expect(readFile(join(generatedDirectory, 'types.ts'), 'utf8')).resolves.toContain('export type User = {');
    await expect(readFile(join(generatedDirectory, 'maps.ts'), 'utf8')).resolves.toContain(
      'id: { externalName: "usr_id" }'
    );
    await expect(readFile(join(generatedDirectory, 'index.ts'), 'utf8')).resolves.toContain(
      "export * from './types.js';"
    );
  });
});

async function writeSchema(source: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'morph-cli-'));
  const schemaPath = join(directory, 'schema.morph');

  await writeFile(schemaPath, source);

  return schemaPath;
}

function createTestIO() {
  let stdout = '';
  let stderr = '';

  return {
    stdout: {
      write(chunk: string) {
        stdout += chunk;
        return true;
      },
    },
    stderr: {
      write(chunk: string) {
        stderr += chunk;
        return true;
      },
    },
    stdoutOutput() {
      return stdout;
    },
    stderrOutput() {
      return stderr;
    },
  };
}

import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { runCli } from './index.js';

describe('runCli', () => {
  it('validates a schema file', async () => {
    const schemaPath = await writeSchema(`
      generator client {
        output = "./generated/client"
      }

      type User {
        id Int
      }

      resource Users {
        path = "/users"

        action List {
          path = "/"
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

  it('validates a schema file from a positional path', async () => {
    const schemaPath = await writeSchema(`
      generator client {
        output = "./generated/client"
      }

      type User {
        id Int
      }

      resource Users {
        path = "/users"

        action List {
          path = "/"
          method = GET
          response = User[]
        }
      }
    `);
    const io = createTestIO();

    const exitCode = await runCli(['node', 'morph', 'validate', schemaPath], io);

    expect(exitCode).toBe(0);
    expect(io.stdoutOutput()).toContain('Schema is valid:');
    expect(io.stderrOutput()).toBe('');
  });

  it('validates a schema file from morph config', async () => {
    const project = await writeProject({
      config: `
        export default {
          schema: './morph/schema.morph',
        };
      `,
      schema: `
        generator client {
          output = "../generated/client"
        }

        type User {
          id Int
        }

        resource Users {
          path = "/users"

          action List {
            path = "/"
            method = GET
            response = User[]
          }
        }
      `,
    });
    const io = createTestIO();

    const exitCode = await runCli(['node', 'morph', 'validate', '--config', project.configPath], io);

    expect(exitCode).toBe(0);
    expect(io.stdoutOutput()).toContain('Schema is valid:');
    expect(io.stderrOutput()).toBe('');
  });

  it('prints diagnostics for invalid schemas', async () => {
    const schemaPath = await writeSchema(`
      generator client {
        output = "./generated/client"
      }

      resource Users {
        path = "/users"

        action List {
          path = "/"
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
      'error unknown_type: Unknown type "MissingUser" used in action "Users.List" response.'
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
      generator client {
        output = "./generated/client"
      }

      type User {
        id Int @map("usr_id")
        name String @map("usr_name")
      }

      resource Users {
        path = "/users"

        action List {
          path = "/"
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

  it('generates client files from a positional schema path', async () => {
    const schemaPath = await writeSchema(`
      generator client {
        output = "./generated/client"
      }

      type User {
        id Int
      }

      resource Users {
        path = "/users"

        action List {
          path = "/"
          method = GET
          response = User[]
        }
      }
    `);
    const io = createTestIO();

    const exitCode = await runCli(['node', 'morph', 'generate', schemaPath], io);
    const generatedDirectory = join(schemaPath, '..', 'generated', 'client');

    expect(exitCode).toBe(0);
    expect(io.stdoutOutput()).toContain('Generated Morph client:');
    expect(io.stderrOutput()).toBe('');
    await expect(readFile(join(generatedDirectory, 'client.ts'), 'utf8')).resolves.toContain(
      'export class MorphClient'
    );
  });

  it('generates client files using schema and datasource from morph config', async () => {
    const project = await writeProject({
      config: `
        export default {
          datasource: {
            url: 'https://api.example.com',
          },
          schema: './morph/schema.morph',
        };
      `,
      schema: `
        generator client {
          output = "../generated/client"
        }

        type User {
          id Int
        }

        resource Users {
          path = "/users"

          action List {
            path = "/"
            method = GET
            response = User[]
          }
        }
      `,
    });
    const io = createTestIO();

    const exitCode = await runCli(['node', 'morph', 'generate', '--config', project.configPath], io);

    expect(exitCode).toBe(0);
    expect(io.stdoutOutput()).toContain('Generated Morph client:');
    expect(io.stderrOutput()).toBe('');
    await expect(readFile(join(project.directory, 'generated', 'client', 'client.ts'), 'utf8')).resolves.toContain(
      'const defaultBaseUrl = "https://api.example.com";'
    );
  });
});

async function writeSchema(source: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'morph-cli-'));
  const schemaPath = join(directory, 'schema.morph');

  await writeFile(schemaPath, source);

  return schemaPath;
}

async function writeProject(input: { config: string; schema: string }): Promise<{
  configPath: string;
  directory: string;
  schemaPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'morph-cli-'));
  const morphDirectory = join(directory, 'morph');
  const configPath = join(directory, 'morph.config.js');
  const schemaPath = join(morphDirectory, 'schema.morph');

  await mkdir(morphDirectory, { recursive: true });
  await writeFile(configPath, input.config);
  await writeFile(schemaPath, input.schema);

  return {
    configPath,
    directory,
    schemaPath,
  };
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

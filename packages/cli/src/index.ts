import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { MidlaneConfig } from '@midlane/config';
import { generateMidlaneClient } from '@midlane/generator';
import { ParseError, parseMidlaneSchema, TokenizeError, validateMidlaneSchema } from '@midlane/parser';
import { cac } from 'cac';

type CliIO = {
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
};

type ValidateOptions = {
  config?: string;
  schema?: string;
};

type SchemaPathArgument = string | undefined;
type ActionOptions<T> = T | undefined;

type GenerateOptions = {
  config?: string;
  schema?: string;
  output?: string;
};

const defaultConfigPath = 'midlane.config.js';
const defaultSchemaPath = 'midlane/schema.midlane';

export async function runCli(argv: string[], io: CliIO = process): Promise<number> {
  const cli = cac('midlane');
  let exitCode = 0;

  cli
    .command('validate [schema]', 'Validate a Midlane schema')
    .option('--config <path>', 'Path to the Midlane config file')
    .option('--schema <path>', 'Path to the schema file', {
      default: defaultSchemaPath,
    })
    .action(async (schemaPathOrOptions: SchemaPathArgument | ValidateOptions, options?: ValidateOptions) => {
      const action = normalizeAction(schemaPathOrOptions, options);

      exitCode = await validateCommand(action.schemaPath, action.options, io);
    });

  cli
    .command('generate [schema]', 'Generate a Midlane client')
    .option('--config <path>', 'Path to the Midlane config file')
    .option('--schema <path>', 'Path to the schema file', {
      default: defaultSchemaPath,
    })
    .option('--output <path>', 'Override generator output path')
    .action(async (schemaPathOrOptions: SchemaPathArgument | GenerateOptions, options?: GenerateOptions) => {
      const action = normalizeAction(schemaPathOrOptions, options);

      exitCode = await generateCommand(action.schemaPath, action.options, io);
    });

  cli.help();
  cli.parse(argv, { run: false });

  const matchedCommand = cli.matchedCommand;

  if (matchedCommand === undefined) {
    cli.outputHelp();
    return 1;
  }

  await cli.runMatchedCommand();

  return exitCode;
}

function normalizeAction<T extends object>(
  schemaPathOrOptions: SchemaPathArgument | T,
  options: ActionOptions<T>
): {
  schemaPath: SchemaPathArgument;
  options: T;
} {
  if (typeof schemaPathOrOptions === 'string' || schemaPathOrOptions === undefined) {
    return {
      schemaPath: schemaPathOrOptions,
      options: options ?? ({} as T),
    };
  }

  return {
    schemaPath: undefined,
    options: schemaPathOrOptions,
  };
}

async function validateCommand(
  schemaPathArgument: SchemaPathArgument,
  options: ValidateOptions,
  io: CliIO
): Promise<number> {
  try {
    const config = await loadConfig(options.config);
    const schemaPath = resolveSchemaPath(schemaPathArgument, options.schema, config);
    const { diagnostics } = await readAndValidateSchema(schemaPath);

    if (diagnostics.length === 0) {
      io.stdout.write(`Schema is valid: ${schemaPath}\n`);
      return 0;
    }

    for (const diagnostic of diagnostics) {
      io.stderr.write(`${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}\n`);
    }

    return diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 1 : 0;
  } catch (error) {
    io.stderr.write(`${formatCliError(error)}\n`);
    return 1;
  }
}

async function generateCommand(
  schemaPathArgument: SchemaPathArgument,
  options: GenerateOptions,
  io: CliIO
): Promise<number> {
  try {
    const config = await loadConfig(options.config);
    const schemaPath = resolveSchemaPath(schemaPathArgument, options.schema, config);
    const { schema, diagnostics } = await readAndValidateSchema(schemaPath);

    if (diagnostics.length > 0) {
      for (const diagnostic of diagnostics) {
        io.stderr.write(`${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}\n`);
      }

      return 1;
    }

    const outputPath = resolveOutputPath(
      resolveOutputBasePath(schemaPath, options.output),
      options.output ?? schema.generator?.output
    );
    const generatedFiles = generateMidlaneClient(schema, {
      datasourceUrl: config.config.datasource?.url,
    });

    await mkdir(outputPath, { recursive: true });

    for (const file of generatedFiles) {
      await writeFile(join(outputPath, file.path), file.content);
    }

    io.stdout.write(`Generated Midlane client: ${outputPath}\n`);

    return 0;
  } catch (error) {
    io.stderr.write(`${formatCliError(error)}\n`);
    return 1;
  }
}

type LoadedConfig = {
  config: MidlaneConfig;
  path?: string | undefined;
};

async function loadConfig(configPathOption: string | undefined): Promise<LoadedConfig> {
  const configPath = resolve(configPathOption ?? defaultConfigPath);

  if (configPathOption === undefined && !(await pathExists(configPath))) {
    return { config: {} };
  }

  const module = (await import(pathToFileURL(configPath).href)) as { default?: unknown };

  if (!isMidlaneConfig(module.default)) {
    throw new Error(`Midlane config "${configPath}" must export a config object as default.`);
  }

  return {
    config: module.default,
    path: configPath,
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isMidlaneConfig(value: unknown): value is MidlaneConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveSchemaPath(
  schemaPathArgument: SchemaPathArgument,
  schemaPathOption: string | undefined,
  config: LoadedConfig
): string {
  if (schemaPathOption !== undefined && schemaPathOption !== defaultSchemaPath) {
    return resolve(schemaPathOption);
  }

  if (schemaPathArgument !== undefined) {
    return resolve(schemaPathArgument);
  }

  if (config.config.schema !== undefined) {
    return resolve(config.path === undefined ? process.cwd() : dirname(config.path), config.config.schema);
  }

  return resolve(schemaPathOption ?? defaultSchemaPath);
}

async function readAndValidateSchema(schemaPath: string) {
  const source = await readFile(schemaPath, 'utf8');
  const schema = parseMidlaneSchema(source);
  const diagnostics = validateMidlaneSchema(schema);

  return { schema, diagnostics };
}

function resolveOutputBasePath(schemaPath: string, outputPathOption: string | undefined): string {
  if (outputPathOption !== undefined) {
    return process.cwd();
  }

  return dirname(schemaPath);
}

function resolveOutputPath(basePath: string, outputPath: string | undefined): string {
  if (outputPath === undefined) {
    throw new Error('Schema generator output is required.');
  }

  if (isAbsolute(outputPath)) {
    return outputPath;
  }

  return resolve(basePath, outputPath);
}

function formatCliError(error: unknown): string {
  if (error instanceof ParseError || error instanceof TokenizeError) {
    return `error invalid_schema: ${error.message}`;
  }

  if (error instanceof Error) {
    return `error cli_error: ${error.message}`;
  }

  return 'error cli_error: Unknown error.';
}

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const exitCode = await runCli(process.argv);
  process.exitCode = exitCode;
}

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMorphClient } from '@morph/generator';
import { ParseError, parseMorphSchema, TokenizeError, validateMorphSchema } from '@morph/parser';
import { cac } from 'cac';

type CliIO = {
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
};

type ValidateOptions = {
  schema?: string;
};

type GenerateOptions = {
  schema?: string;
  output?: string;
};

const defaultSchemaPath = 'schema.morph';

export async function runCli(argv: string[], io: CliIO = process): Promise<number> {
  const cli = cac('morph');
  let exitCode = 0;

  cli
    .command('validate', 'Validate a Morph schema')
    .option('--schema <path>', 'Path to the schema file', {
      default: defaultSchemaPath,
    })
    .action(async (options: ValidateOptions) => {
      exitCode = await validateCommand(options, io);
    });

  cli
    .command('generate', 'Generate a Morph client')
    .option('--schema <path>', 'Path to the schema file', {
      default: defaultSchemaPath,
    })
    .option('--output <path>', 'Override generator output path')
    .action(async (options: GenerateOptions) => {
      exitCode = await generateCommand(options, io);
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

async function validateCommand(options: ValidateOptions, io: CliIO): Promise<number> {
  const schemaPath = resolve(options.schema ?? defaultSchemaPath);

  try {
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

async function generateCommand(options: GenerateOptions, io: CliIO): Promise<number> {
  const schemaPath = resolve(options.schema ?? defaultSchemaPath);

  try {
    const { schema, diagnostics } = await readAndValidateSchema(schemaPath);

    if (diagnostics.length > 0) {
      for (const diagnostic of diagnostics) {
        io.stderr.write(`${diagnostic.severity} ${diagnostic.code}: ${diagnostic.message}\n`);
      }

      return 1;
    }

    const outputPath = resolveOutputPath(schemaPath, options.output ?? schema.generator?.output);
    const generatedFiles = generateMorphClient(schema);

    await mkdir(outputPath, { recursive: true });

    for (const file of generatedFiles) {
      await writeFile(join(outputPath, file.path), file.content);
    }

    io.stdout.write(`Generated Morph client: ${outputPath}\n`);

    return 0;
  } catch (error) {
    io.stderr.write(`${formatCliError(error)}\n`);
    return 1;
  }
}

async function readAndValidateSchema(schemaPath: string) {
  const source = await readFile(schemaPath, 'utf8');
  const schema = parseMorphSchema(source);
  const diagnostics = validateMorphSchema(schema);

  return { schema, diagnostics };
}

function resolveOutputPath(schemaPath: string, outputPath: string | undefined): string {
  if (outputPath === undefined) {
    throw new Error('Schema generator output is required.');
  }

  if (isAbsolute(outputPath)) {
    return outputPath;
  }

  return resolve(dirname(schemaPath), outputPath);
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

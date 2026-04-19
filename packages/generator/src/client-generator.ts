import type {
  ActionDeclaration,
  ApiSchema,
  EnumDeclaration,
  FieldDeclaration,
  ResourceDeclaration,
  TypeDeclaration,
  TypeRef,
} from '@morph/parser';

export type GeneratedFile = {
  path: string;
  content: string;
};

const scalarTypes = new Map([
  ['String', 'string'],
  ['Int', 'number'],
  ['Float', 'number'],
  ['Boolean', 'boolean'],
  ['DateTime', 'string'],
  ['Json', 'unknown'],
]);

export function generateMorphClient(schema: ApiSchema): GeneratedFile[] {
  return [
    {
      path: 'types.ts',
      content: generateTypes(schema),
    },
    {
      path: 'maps.ts',
      content: generateMaps(schema.types),
    },
    {
      path: 'client.ts',
      content: generateClient(schema),
    },
    {
      path: 'index.ts',
      content: generateIndex(schema.types),
    },
  ];
}

function generateClient(schema: ApiSchema): string {
  const objectTypeNames = new Set(schema.types.map((type) => type.name));
  const typeImports = collectClientTypeImports(schema);
  const mapImports = collectClientMapImports(schema, objectTypeNames);
  const imports = [
    `import type { ${typeImports.join(', ')} } from './types.js';`,
    "import { MorphEngine } from '@morph/runtime';",
    mapImports.length > 0 ? `import { ${mapImports.join(', ')} } from './maps.js';` : undefined,
  ].filter((line) => line !== undefined);

  return [
    ...imports,
    '',
    'export class MorphClient {',
    '  readonly #engine: MorphEngine;',
    '',
    '  constructor(options: MorphClientOptions) {',
    '    this.#engine = new MorphEngine(options);',
    '  }',
    ...schema.resources.flatMap((resource) => generateResourceMember(resource, '', objectTypeNames)),
    '}',
    '',
  ].join('\n');
}

function collectClientTypeImports(schema: ApiSchema): string[] {
  const imports = new Set(['MorphClientOptions']);

  for (const resource of schema.resources) {
    collectResourceTypeImports(resource, imports);
  }

  return [...imports].sort();
}

function collectResourceTypeImports(resource: ResourceDeclaration, imports: Set<string>): void {
  for (const action of resource.actions) {
    collectActionTypeImports(action, imports);
  }

  for (const nestedResource of resource.resources) {
    collectResourceTypeImports(nestedResource, imports);
  }
}

function collectActionTypeImports(action: ActionDeclaration, imports: Set<string>): void {
  for (const typeRef of [action.params, action.query, action.body, action.headers, action.response]) {
    if (typeRef !== undefined && !scalarTypes.has(typeRef.name)) {
      imports.add(typeRef.name);
    }
  }
}

function collectClientMapImports(schema: ApiSchema, objectTypeNames: Set<string>): string[] {
  const imports = new Set<string>();

  for (const resource of schema.resources) {
    collectResourceMapImports(resource, objectTypeNames, imports);
  }

  return [...imports].sort();
}

function collectResourceMapImports(
  resource: ResourceDeclaration,
  objectTypeNames: Set<string>,
  imports: Set<string>
): void {
  for (const action of resource.actions) {
    collectActionMapImports(action, objectTypeNames, imports);
  }

  for (const nestedResource of resource.resources) {
    collectResourceMapImports(nestedResource, objectTypeNames, imports);
  }
}

function collectActionMapImports(action: ActionDeclaration, objectTypeNames: Set<string>, imports: Set<string>): void {
  for (const typeRef of [action.params, action.query, action.body, action.headers, action.response]) {
    if (typeRef !== undefined && objectTypeNames.has(typeRef.name)) {
      imports.add(`${typeRef.name}Map`);
    }
  }
}

function generateResourceMember(
  resource: ResourceDeclaration,
  basePath: string,
  objectTypeNames: Set<string>
): string[] {
  const path = joinPaths(basePath, resource.path);

  return [
    '',
    `  readonly ${resource.name} = {`,
    ...resource.actions.flatMap((action) => generateActionMember(action, path, objectTypeNames, 4)),
    ...resource.resources.flatMap((nestedResource) =>
      generateNestedResourceMember(nestedResource, path, objectTypeNames, 4)
    ),
    '  };',
  ];
}

function generateNestedResourceMember(
  resource: ResourceDeclaration,
  basePath: string,
  objectTypeNames: Set<string>,
  indentSize: number
): string[] {
  const indent = ' '.repeat(indentSize);
  const path = joinPaths(basePath, resource.path);

  return [
    `${indent}${resource.name}: {`,
    ...resource.actions.flatMap((action) => generateActionMember(action, path, objectTypeNames, indentSize + 2)),
    ...resource.resources.flatMap((nestedResource) =>
      generateNestedResourceMember(nestedResource, path, objectTypeNames, indentSize + 2)
    ),
    `${indent}},`,
  ];
}

function joinPaths(basePath: string, path: string | undefined): string {
  if (path === undefined || path.length === 0) {
    return basePath;
  }

  if (basePath.length === 0) {
    return path.startsWith('/') ? path : `/${path}`;
  }

  const normalizedBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBasePath}${normalizedPath}`;
}

function generateActionMember(
  action: ActionDeclaration,
  basePath: string,
  objectTypeNames: Set<string>,
  indentSize: number
): string[] {
  const indent = ' '.repeat(indentSize);
  const bodyIndent = ' '.repeat(indentSize + 2);
  const requestIndent = ' '.repeat(indentSize + 4);
  const path = joinPaths(basePath, action.path);

  return [
    `${indent}${action.name}: async (${generateActionParameter(action)}): Promise<${generateActionReturnType(action)}> => {`,
    `${bodyIndent}return this.#engine.request<${generateActionReturnType(action)}>({`,
    `${requestIndent}method: ${stringLiteral(action.method ?? 'GET')},`,
    `${requestIndent}path: ${stringLiteral(path)},`,
    ...generateActionRequestProperties(action, objectTypeNames, requestIndent),
    `${bodyIndent}});`,
    `${indent}},`,
  ];
}

function generateActionParameter(action: ActionDeclaration): string {
  const properties = [
    action.params === undefined ? undefined : `params: ${toTsType(action.params)}`,
    action.query === undefined ? undefined : `query?: ${toTsType(action.query)}`,
    action.body === undefined ? undefined : `body: ${toTsType(action.body)}`,
    action.headers === undefined ? undefined : `headers?: ${toTsType(action.headers)}`,
  ].filter((property): property is string => property !== undefined);

  if (properties.length === 0) {
    return '';
  }

  const hasRequiredInput = action.params !== undefined || action.body !== undefined;
  const optionalMarker = hasRequiredInput ? '' : '?';

  return `options${optionalMarker}: { ${properties.join('; ')} }`;
}

function generateActionReturnType(action: ActionDeclaration): string {
  if (action.response === undefined) {
    return 'void';
  }

  return toTsType(action.response);
}

function generateActionRequestProperties(
  action: ActionDeclaration,
  objectTypeNames: Set<string>,
  indent: string
): string[] {
  const properties: string[] = [];

  if (action.params !== undefined) {
    properties.push(`${indent}params: options.params as Record<string, unknown>,`);

    if (objectTypeNames.has(action.params.name)) {
      properties.push(`${indent}paramsMapper: ${action.params.name}Map,`);
    }
  }

  if (action.query !== undefined) {
    properties.push(
      `${indent}query: options?.query === undefined ? undefined : (options.query as Record<string, unknown>),`
    );

    if (objectTypeNames.has(action.query.name)) {
      properties.push(`${indent}queryMapper: ${action.query.name}Map,`);
    }
  }

  if (action.body !== undefined) {
    properties.push(`${indent}body: options.body,`);

    if (objectTypeNames.has(action.body.name)) {
      properties.push(`${indent}bodyMapper: ${action.body.name}Map,`);
    }
  }

  if (action.headers !== undefined) {
    properties.push(
      `${indent}headers: options?.headers === undefined ? undefined : (options.headers as Record<string, unknown>),`
    );

    if (objectTypeNames.has(action.headers.name)) {
      properties.push(`${indent}headersMapper: ${action.headers.name}Map,`);
    }
  }

  if (action.response !== undefined && objectTypeNames.has(action.response.name)) {
    properties.push(`${indent}responseMapper: ${action.response.name}Map,`);
  }

  return properties;
}

function generateTypes(schema: ApiSchema): string {
  const chunks = [generateClientOptions(), ...schema.enums.map(generateEnum), ...schema.types.map(generateType)];

  return `${chunks.join('\n\n')}\n`;
}

function generateClientOptions(): string {
  return ['export type MorphClientOptions = {', '  baseUrl: string;', '  fetcher?: typeof fetch;', '};'].join('\n');
}

function generateEnum(enumDeclaration: EnumDeclaration): string {
  const values = enumDeclaration.values.map((value) => stringLiteral(value)).join(' | ');

  return `export type ${enumDeclaration.name} = ${values};`;
}

function generateType(typeDeclaration: TypeDeclaration): string {
  const fields = typeDeclaration.fields.map(
    (field) => `  ${field.name}${field.type.isOptional ? '?' : ''}: ${toTsType(field.type)};`
  );

  return [`export type ${typeDeclaration.name} = {`, ...fields, '};'].join('\n');
}

function toTsType(typeRef: TypeRef): string {
  const baseType = scalarTypes.get(typeRef.name) ?? typeRef.name;

  if (typeRef.isArray) {
    return `${baseType}[]`;
  }

  return baseType;
}

function generateMaps(types: TypeDeclaration[]): string {
  const objectTypeNames = new Set(types.map((type) => type.name));
  const mapDeclarations = types.map((type) => generateMapDeclaration(type, objectTypeNames));
  const mapEntries = types.map((type) => `  ${type.name}: ${type.name}Map,`);

  return [
    "import type { MapperObject } from '@morph/runtime';",
    '',
    ...mapDeclarations,
    '',
    'export const maps = {',
    ...mapEntries,
    '} as const;',
    '',
  ].join('\n');
}

function generateMapDeclaration(typeDeclaration: TypeDeclaration, objectTypeNames: Set<string>): string {
  const entries = typeDeclaration.fields.flatMap((field) => generateMapEntry(field, objectTypeNames));

  return [`export const ${typeDeclaration.name}Map = {`, ...entries, `} satisfies MapperObject;`].join('\n');
}

function generateMapEntry(field: FieldDeclaration, objectTypeNames: Set<string>): string[] {
  const properties = generateMapProperties(field, objectTypeNames);

  if (properties.length === 0) {
    return [];
  }

  return [`  ${field.name}: { ${properties.join(', ')} },`];
}

function generateMapProperties(field: FieldDeclaration, objectTypeNames: Set<string>): string[] {
  const properties: string[] = [];

  if (field.map !== undefined) {
    properties.push(`externalName: ${stringLiteral(field.map)}`);
  }

  if (objectTypeNames.has(field.type.name)) {
    properties.push(`type: ${field.type.name}Map`);
  }

  if (field.type.isArray && objectTypeNames.has(field.type.name)) {
    properties.push('isArray: true');
  }

  return properties;
}

function generateIndex(types: TypeDeclaration[]): string {
  const mapExports = types.map((type) => `${type.name}Map`).join(', ');

  return [
    `export { MorphClient } from './client.js';`,
    `export * from './types.js';`,
    `export { maps${mapExports.length > 0 ? `, ${mapExports}` : ''} } from './maps.js';`,
    '',
  ].join('\n');
}

function stringLiteral(value: string): string {
  return JSON.stringify(value);
}

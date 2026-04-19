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
    "import type { MapperObject } from '@morph/runtime';",
    `import type { ${typeImports.join(', ')} } from './types.js';`,
    "import { toExternal, toInternal } from '@morph/runtime';",
    mapImports.length > 0 ? `import { ${mapImports.join(', ')} } from './maps.js';` : undefined,
  ].filter((line) => line !== undefined);

  return [
    ...imports,
    '',
    'type MorphClientRequest = {',
    '  method: string;',
    '  path: string;',
    '  body?: unknown;',
    '  headers?: Record<string, unknown> | undefined;',
    '  params?: Record<string, unknown> | undefined;',
    '  query?: Record<string, unknown> | undefined;',
    '  responseMapper?: MapperObject | undefined;',
    '};',
    '',
    'export class MorphClient {',
    '  readonly #baseUrl: string;',
    '  readonly #fetcher: typeof fetch;',
    '',
    '  constructor(options: MorphClientOptions) {',
    '    this.#baseUrl = options.baseUrl;',
    '    this.#fetcher = options.fetcher ?? fetch;',
    '  }',
    ...schema.resources.flatMap((resource) => generateResourceMember(resource, '', objectTypeNames)),
    '',
    '  async #request<T>(request: MorphClientRequest): Promise<T> {',
    '    const url = this.#buildUrl(this.#buildPath(request.path, request.params), request.query);',
    '    const hasBody = request.body !== undefined;',
    '    const init: RequestInit = {',
    '      headers: this.#buildHeaders(request.headers, hasBody),',
    '      method: request.method,',
    '    };',
    '',
    '    if (hasBody) {',
    '      init.body = JSON.stringify(request.body);',
    '    }',
    '',
    '    const response = await this.#fetcher(url, init);',
    '    const data = await this.#readJson(response);',
    '',
    '    if (!response.ok) {',
    "      throw new Error('Morph request failed with status ' + response.status + '.');",
    '    }',
    '',
    '    if (request.responseMapper === undefined) {',
    '      return data as T;',
    '    }',
    '',
    '    return toInternal(request.responseMapper, data) as T;',
    '  }',
    '',
    '  #buildPath(path: string, params: Record<string, unknown> | undefined): string {',
    '    if (params === undefined) {',
    '      return path;',
    '    }',
    '',
    '    return path.replace(/:([A-Za-z0-9_]+)/g, (_match: string, key: string) => {',
    '      const value = params[key];',
    '',
    '      if (value === undefined) {',
    `        throw new Error("Missing path parameter '" + key + "'.");`,
    '      }',
    '',
    '      return encodeURIComponent(String(value));',
    '    });',
    '  }',
    '',
    '  #buildUrl(path: string, query: Record<string, unknown> | undefined): URL {',
    '    const url = new URL(path, this.#baseUrl);',
    '',
    '    if (query === undefined) {',
    '      return url;',
    '    }',
    '',
    '    for (const [key, value] of Object.entries(query)) {',
    '      this.#appendQueryValue(url, key, value);',
    '    }',
    '',
    '    return url;',
    '  }',
    '',
    '  #appendQueryValue(url: URL, key: string, value: unknown): void {',
    '    if (value === undefined) {',
    '      return;',
    '    }',
    '',
    '    if (Array.isArray(value)) {',
    '      for (const item of value) {',
    '        this.#appendQueryValue(url, key, item);',
    '      }',
    '',
    '      return;',
    '    }',
    '',
    '    url.searchParams.append(key, String(value));',
    '  }',
    '',
    '  #buildHeaders(headers: Record<string, unknown> | undefined, hasBody: boolean): Headers {',
    '    const result = new Headers();',
    '',
    '    if (hasBody) {',
    "      result.set('content-type', 'application/json');",
    '    }',
    '',
    '    if (headers === undefined) {',
    '      return result;',
    '    }',
    '',
    '    for (const [key, value] of Object.entries(headers)) {',
    '      if (value !== undefined) {',
    '        result.set(key, String(value));',
    '      }',
    '    }',
    '',
    '    return result;',
    '  }',
    '',
    '  async #readJson(response: Response): Promise<unknown> {',
    '    const text = await response.text();',
    '',
    '    if (text.length === 0) {',
    '      return undefined;',
    '    }',
    '',
    '    return JSON.parse(text) as unknown;',
    '  }',
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
    `${bodyIndent}return this.#request<${generateActionReturnType(action)}>({`,
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
    properties.push(
      `${indent}params: ${toExternalExpression('options.params', action.params, objectTypeNames, true)},`
    );
  }

  if (action.query !== undefined) {
    properties.push(
      `${indent}query: options?.query === undefined ? undefined : ${toExternalExpression(
        'options.query',
        action.query,
        objectTypeNames,
        true
      )},`
    );
  }

  if (action.body !== undefined) {
    properties.push(`${indent}body: ${toExternalExpression('options.body', action.body, objectTypeNames, false)},`);
  }

  if (action.headers !== undefined) {
    properties.push(
      `${indent}headers: options?.headers === undefined ? undefined : ${toExternalExpression(
        'options.headers',
        action.headers,
        objectTypeNames,
        true
      )},`
    );
  }

  if (action.response !== undefined && objectTypeNames.has(action.response.name)) {
    properties.push(`${indent}responseMapper: ${action.response.name}Map,`);
  }

  return properties;
}

function toExternalExpression(
  accessor: string,
  typeRef: TypeRef,
  objectTypeNames: Set<string>,
  castToRecord: boolean
): string {
  if (!objectTypeNames.has(typeRef.name)) {
    return accessor;
  }

  const expression = `toExternal(${typeRef.name}Map, ${accessor})`;

  if (castToRecord) {
    return `(${expression} as Record<string, unknown>)`;
  }

  return expression;
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

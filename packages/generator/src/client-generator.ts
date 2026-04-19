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
  return [
    "import type { MorphClientOptions } from './types.js';",
    '',
    'export class MorphClient {',
    '  readonly #baseUrl: string;',
    '',
    '  constructor(options: MorphClientOptions) {',
    '    this.#baseUrl = options.baseUrl;',
    '  }',
    ...schema.resources.flatMap(generateResourceMember),
    '}',
    '',
  ].join('\n');
}

function generateResourceMember(resource: ResourceDeclaration): string[] {
  return [
    '',
    `  readonly ${resource.name} = {`,
    ...resource.actions.flatMap(generateActionMember),
    ...resource.resources.flatMap(generateNestedResourceMember),
    '  };',
  ];
}

function generateNestedResourceMember(resource: ResourceDeclaration): string[] {
  return [`    ${resource.name}: {`, ...resource.actions.flatMap(generateActionMember), '    },'];
}

function generateActionMember(action: ActionDeclaration): string[] {
  return [
    `    ${action.name}: async () => {`,
    "      throw new Error('Morph client requests are not implemented yet.');",
    '    },',
  ];
}

function generateTypes(schema: ApiSchema): string {
  const chunks = [generateClientOptions(), ...schema.enums.map(generateEnum), ...schema.types.map(generateType)];

  return `${chunks.join('\n\n')}\n`;
}

function generateClientOptions(): string {
  return ['export type MorphClientOptions = {', '  baseUrl: string;', '};'].join('\n');
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

export type MapperObject = Record<string, MapperField>;

export type MapperField = {
  externalName?: string;
  type?: MapperObject;
  isArray?: boolean;
};

export type MappableObject = Record<string, unknown>;

export function toExternal(mapper: MapperObject, value: unknown): unknown {
  return mapObject(value, mapper, 'external');
}

export function toInternal(mapper: MapperObject, value: unknown): unknown {
  return mapObject(value, mapper, 'internal');
}

type Direction = 'external' | 'internal';

function mapObject(value: unknown, mapper: MapperObject, direction: Direction): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => mapObject(item, mapper, direction));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const result: MappableObject = {};
  const lookup = direction === 'external' ? createExternalLookup(mapper) : createInternalLookup(mapper);

  for (const [sourceKey, sourceValue] of Object.entries(value)) {
    if (sourceValue === undefined) {
      continue;
    }

    const field = lookup[sourceKey];
    const targetKey = field?.targetKey ?? sourceKey;
    const fieldMapper = field?.mapper;

    result[targetKey] = mapFieldValue(sourceValue, fieldMapper, direction);
  }

  return result;
}

function mapFieldValue(value: unknown, field: MapperField | undefined, direction: Direction): unknown {
  if (field?.type === undefined) {
    return value;
  }

  if (field.isArray === true) {
    if (!Array.isArray(value)) {
      return value;
    }

    return value.map((item) => mapObject(item, field.type as MapperObject, direction));
  }

  return mapObject(value, field.type, direction);
}

type MapperLookup = Record<
  string,
  {
    mapper: MapperField;
    targetKey: string;
  }
>;

function createExternalLookup(mapper: MapperObject): MapperLookup {
  const lookup: MapperLookup = {};

  for (const [internalName, field] of Object.entries(mapper)) {
    lookup[internalName] = {
      mapper: field,
      targetKey: field.externalName ?? internalName,
    };
  }

  return lookup;
}

function createInternalLookup(mapper: MapperObject): MapperLookup {
  const lookup: MapperLookup = {};

  for (const [internalName, field] of Object.entries(mapper)) {
    lookup[field.externalName ?? internalName] = {
      mapper: field,
      targetKey: internalName,
    };
  }

  return lookup;
}

function isPlainObject(value: unknown): value is MappableObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

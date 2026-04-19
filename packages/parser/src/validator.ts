import type {
  ActionDeclaration,
  ApiSchema,
  EnumDeclaration,
  FieldDeclaration,
  ResourceDeclaration,
  TypeDeclaration,
  TypeRef,
} from './ast.js';
import type { Diagnostic, DiagnosticCode } from './diagnostic.js';

const scalarTypes = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json']);
const bodylessMethods = new Set(['GET', 'HEAD']);

export function validateMorphSchema(schema: ApiSchema): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declaredTypes = collectDeclaredTypes(schema, diagnostics);
  const typeDeclarations = new Map(schema.types.map((type) => [type.name, type]));

  validateGenerator(schema, diagnostics);
  validateTypes(schema.types, diagnostics, declaredTypes);
  validateEnums(schema.enums, diagnostics);
  validateResources(schema.resources, diagnostics, declaredTypes, typeDeclarations, [], '');

  return diagnostics;
}

function collectDeclaredTypes(schema: ApiSchema, diagnostics: Diagnostic[]): Set<string> {
  const declaredTypes = new Set<string>(scalarTypes);
  const typeNames = new Set<string>();
  const enumNames = new Set<string>();

  for (const type of schema.types) {
    if (typeNames.has(type.name)) {
      diagnostics.push(error('duplicate_type', `Duplicate type "${type.name}".`));
      continue;
    }

    typeNames.add(type.name);
    declaredTypes.add(type.name);
  }

  for (const enumDeclaration of schema.enums) {
    if (enumNames.has(enumDeclaration.name)) {
      diagnostics.push(error('duplicate_enum', `Duplicate enum "${enumDeclaration.name}".`));
      continue;
    }

    enumNames.add(enumDeclaration.name);
    declaredTypes.add(enumDeclaration.name);
  }

  return declaredTypes;
}

function validateGenerator(schema: ApiSchema, diagnostics: Diagnostic[]): void {
  if (schema.generator === undefined) {
    diagnostics.push(error('missing_generator', 'Missing generator declaration.'));
    return;
  }

  if (schema.generator.output === undefined) {
    diagnostics.push(error('missing_generator_output', `Generator "${schema.generator.name}" is missing output.`));
  }
}

function validateTypes(types: TypeDeclaration[], diagnostics: Diagnostic[], declaredTypes: Set<string>): void {
  for (const type of types) {
    validateUniqueNames(
      type.fields,
      (field) => field.name,
      (fieldName) => error('duplicate_type_field', `Duplicate field "${fieldName}" in type "${type.name}".`),
      diagnostics
    );

    for (const field of type.fields) {
      validateTypeRef(field.type, diagnostics, declaredTypes, `type "${type.name}" field "${field.name}"`);
    }
  }
}

function validateEnums(enums: EnumDeclaration[], diagnostics: Diagnostic[]): void {
  for (const enumDeclaration of enums) {
    validateUniqueNames(
      enumDeclaration.values,
      (value) => value,
      (value) => error('duplicate_enum_value', `Duplicate value "${value}" in enum "${enumDeclaration.name}".`),
      diagnostics
    );
  }
}

function validateResources(
  resources: ResourceDeclaration[],
  diagnostics: Diagnostic[],
  declaredTypes: Set<string>,
  typeDeclarations: Map<string, TypeDeclaration>,
  parentPath: string[],
  parentHttpPath: string
): void {
  validateUniqueNames(
    resources,
    (resource) => resource.name,
    (resourceName) =>
      error('duplicate_resource', `Duplicate resource "${resourceName}" in ${formatResourceScope(parentPath)}.`),
    diagnostics
  );

  for (const resource of resources) {
    const resourcePath = [...parentPath, resource.name];
    const resourceHttpPath = joinPaths(parentHttpPath, resource.path);

    if (resource.path === undefined) {
      diagnostics.push(
        error('missing_resource_path', `Resource "${formatResourcePath(resourcePath)}" is missing path.`)
      );
    }

    validateUniqueNames(
      resource.actions,
      (action) => action.name,
      (actionName) =>
        error(
          'duplicate_action',
          `Duplicate action "${actionName}" in resource "${formatResourcePath(resourcePath)}".`
        ),
      diagnostics
    );

    for (const action of resource.actions) {
      validateAction(action, diagnostics, declaredTypes, typeDeclarations, resourcePath, resourceHttpPath);
    }

    validateResources(resource.resources, diagnostics, declaredTypes, typeDeclarations, resourcePath, resourceHttpPath);
  }
}

function validateAction(
  action: ActionDeclaration,
  diagnostics: Diagnostic[],
  declaredTypes: Set<string>,
  typeDeclarations: Map<string, TypeDeclaration>,
  resourcePath: string[],
  resourceHttpPath: string
): void {
  const actionPath = `${formatResourcePath(resourcePath)}.${action.name}`;
  const httpPath = action.path === undefined ? resourceHttpPath : joinPaths(resourceHttpPath, action.path);

  if (action.path === undefined) {
    diagnostics.push(error('missing_action_path', `Action "${actionPath}" is missing path.`));
  }

  if (action.method === undefined) {
    diagnostics.push(error('missing_action_method', `Action "${actionPath}" is missing method.`));
  }

  if (action.response === undefined) {
    diagnostics.push(error('missing_action_response', `Action "${actionPath}" is missing response.`));
  }

  if (action.method !== undefined && bodylessMethods.has(action.method) && action.body !== undefined) {
    diagnostics.push(error('body_not_allowed', `Action "${actionPath}" uses body with ${action.method}.`));
  }

  validateOptionalTypeRef(action.params, diagnostics, declaredTypes, `action "${actionPath}" params`);
  validateOptionalTypeRef(action.query, diagnostics, declaredTypes, `action "${actionPath}" query`);
  validateOptionalTypeRef(action.body, diagnostics, declaredTypes, `action "${actionPath}" body`);
  validateOptionalTypeRef(action.headers, diagnostics, declaredTypes, `action "${actionPath}" headers`);
  validateOptionalTypeRef(action.response, diagnostics, declaredTypes, `action "${actionPath}" response`);
  if (action.path !== undefined) {
    validatePathParams(action, diagnostics, typeDeclarations, actionPath, httpPath);
  }
}

function validatePathParams(
  action: ActionDeclaration,
  diagnostics: Diagnostic[],
  typeDeclarations: Map<string, TypeDeclaration>,
  actionPath: string,
  httpPath: string
): void {
  const pathParams = extractPathParams(httpPath);

  if (pathParams.length === 0) {
    if (action.params !== undefined) {
      diagnostics.push(
        error('path_param_unused_field', `Action "${actionPath}" defines params but path "${httpPath}" has no params.`)
      );
    }

    return;
  }

  if (action.params === undefined) {
    diagnostics.push(error('missing_action_params', `Action "${actionPath}" path "${httpPath}" requires params.`));
    return;
  }

  const paramsType = typeDeclarations.get(action.params.name);

  if (paramsType === undefined) {
    return;
  }

  const pathParamsByName = new Map(pathParams.map((pathParam) => [pathParam.name, pathParam]));
  const fieldsByName = new Map(paramsType.fields.map((field) => [field.name, field]));

  for (const pathParam of pathParams) {
    const field = fieldsByName.get(pathParam.name);

    if (field === undefined) {
      diagnostics.push(
        error(
          'path_param_missing_field',
          `Path parameter "${pathParam.name}" in action "${actionPath}" is missing in params type "${paramsType.name}".`
        )
      );
      continue;
    }

    validatePathParamOptionality(pathParam, field, diagnostics, actionPath, paramsType.name);
  }

  for (const field of paramsType.fields) {
    if (!pathParamsByName.has(field.name)) {
      diagnostics.push(
        error(
          'path_param_unused_field',
          `Field "${field.name}" in params type "${paramsType.name}" is not used in action "${actionPath}" path "${httpPath}".`
        )
      );
    }
  }
}

type PathParam = {
  name: string;
  isOptional: boolean;
};

function extractPathParams(path: string): PathParam[] {
  const params: PathParam[] = [];
  const pattern = /:([A-Za-z0-9_]+)(\?)?/g;

  for (const match of path.matchAll(pattern)) {
    const name = match[1];

    if (name !== undefined) {
      params.push({
        name,
        isOptional: match[2] === '?',
      });
    }
  }

  return params;
}

function validatePathParamOptionality(
  pathParam: PathParam,
  field: FieldDeclaration,
  diagnostics: Diagnostic[],
  actionPath: string,
  paramsTypeName: string
): void {
  if (pathParam.isOptional === field.type.isOptional) {
    return;
  }

  if (pathParam.isOptional) {
    diagnostics.push(
      error(
        'path_param_optionality_mismatch',
        `Path parameter "${pathParam.name}" in action "${actionPath}" is optional, but field "${field.name}" in params type "${paramsTypeName}" is required.`
      )
    );
    return;
  }

  diagnostics.push(
    error(
      'path_param_optionality_mismatch',
      `Path parameter "${pathParam.name}" in action "${actionPath}" is required, but field "${field.name}" in params type "${paramsTypeName}" is optional.`
    )
  );
}

function validateOptionalTypeRef(
  typeRef: TypeRef | undefined,
  diagnostics: Diagnostic[],
  declaredTypes: Set<string>,
  usage: string
): void {
  if (typeRef === undefined) {
    return;
  }

  validateTypeRef(typeRef, diagnostics, declaredTypes, usage);
}

function validateTypeRef(typeRef: TypeRef, diagnostics: Diagnostic[], declaredTypes: Set<string>, usage: string): void {
  if (!declaredTypes.has(typeRef.name)) {
    diagnostics.push(error('unknown_type', `Unknown type "${typeRef.name}" used in ${usage}.`));
  }
}

function validateUniqueNames<T>(
  values: T[],
  getName: (value: T) => string,
  createDiagnostic: (name: string) => Diagnostic,
  diagnostics: Diagnostic[]
): void {
  const seen = new Set<string>();

  for (const value of values) {
    const name = getName(value);

    if (seen.has(name)) {
      diagnostics.push(createDiagnostic(name));
      continue;
    }

    seen.add(name);
  }
}

function formatResourceScope(resourcePath: string[]): string {
  if (resourcePath.length === 0) {
    return 'root scope';
  }

  return `resource "${formatResourcePath(resourcePath)}"`;
}

function formatResourcePath(resourcePath: string[]): string {
  return resourcePath.join('.');
}

function joinPaths(basePath: string, path: string | undefined): string {
  if (path === undefined || path.length === 0 || path === '/') {
    return basePath;
  }

  if (basePath.length === 0) {
    return path.startsWith('/') ? path : `/${path}`;
  }

  const normalizedBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${normalizedBasePath}${normalizedPath}`;
}

function error(code: DiagnosticCode, message: string): Diagnostic {
  return {
    code,
    severity: 'error',
    message,
  };
}

import { describe, expect, it } from 'vitest';

import { parseMorphSchema } from './parser.js';
import { validateMorphSchema } from './validator.js';

describe('validateMorphSchema', () => {
  it('accepts a valid schema', () => {
    const schema = parseMorphSchema(`
      generator client {
        output = "./generated/client"
      }

      enum UserStatus {
        ACTIVE
        BLOCKED
      }

      type User {
        id Int @map("usr_id")
        name String
        status UserStatus
      }

      type ListUsersQuery {
        search String?
      }

      type UserParams {
        id Int
        slug String?
      }

      resource users {
        path = "/users"

        action getBySlug {
          method = GET
          path = "/:id/:slug?"
          params = UserParams
          response = User
        }
      }
    `);

    expect(validateMorphSchema(schema)).toEqual([]);
  });

  it('reports missing root declarations and required properties', () => {
    const schema = parseMorphSchema(`
      resource users {
        action list {
        }
      }
    `);

    expect(validateMorphSchema(schema)).toEqual([
      {
        code: 'missing_generator',
        severity: 'error',
        message: 'Missing generator declaration.',
      },
      {
        code: 'missing_resource_path',
        severity: 'error',
        message: 'Resource "users" is missing path.',
      },
      {
        code: 'missing_action_path',
        severity: 'error',
        message: 'Action "users.list" is missing path.',
      },
      {
        code: 'missing_action_method',
        severity: 'error',
        message: 'Action "users.list" is missing method.',
      },
      {
        code: 'missing_action_response',
        severity: 'error',
        message: 'Action "users.list" is missing response.',
      },
    ]);
  });

  it('reports duplicate declarations and members', () => {
    const schema = parseMorphSchema(`
      generator client {
        output = "./generated/client"
      }

      enum Role {
        ADMIN
        ADMIN
      }

      enum Role {
        USER
      }

      type User {
        id Int
        id String
      }

      type User {
        name String
      }

      resource users {
        path = "/users"

        action list {
          path = "/"
          method = GET
          response = User[]
        }

        action list {
          path = "/"
          method = GET
          response = User[]
        }

        resource posts {
          path = "/posts"
        }

        resource posts {
          path = "/posts"
        }
      }
    `);

    expect(validateMorphSchema(schema).map((diagnostic) => diagnostic.code)).toEqual([
      'duplicate_type',
      'duplicate_enum',
      'duplicate_type_field',
      'duplicate_enum_value',
      'duplicate_action',
      'duplicate_resource',
    ]);
  });

  it('reports unknown referenced types and bodyless method bodies', () => {
    const schema = parseMorphSchema(`
      generator client {
        output = "./generated/client"
      }

      type User {
        id MissingId
      }

      resource users {
        path = "/users"

        action list {
          path = "/"
          method = GET
          query = MissingQuery
          body = MissingBody
          response = MissingResponse[]
        }
      }
    `);

    expect(validateMorphSchema(schema)).toEqual([
      {
        code: 'unknown_type',
        severity: 'error',
        message: 'Unknown type "MissingId" used in type "User" field "id".',
      },
      {
        code: 'body_not_allowed',
        severity: 'error',
        message: 'Action "users.list" uses body with GET.',
      },
      {
        code: 'unknown_type',
        severity: 'error',
        message: 'Unknown type "MissingQuery" used in action "users.list" query.',
      },
      {
        code: 'unknown_type',
        severity: 'error',
        message: 'Unknown type "MissingBody" used in action "users.list" body.',
      },
      {
        code: 'unknown_type',
        severity: 'error',
        message: 'Unknown type "MissingResponse" used in action "users.list" response.',
      },
    ]);
  });

  it('validates action path params against params type fields', () => {
    const schema = parseMorphSchema(`
      generator client {
        output = "./generated/client"
      }

      type User {
        id Int
      }

      type MissingNameParams {
        id Int
      }

      type ExtraNameParams {
        id Int
        name String
      }

      type OptionalMismatchParams {
        id Int
        name String?
      }

      type RequiredMismatchParams {
        id Int
        name String
      }

      resource users {
        path = "/users"

        action missingParams {
          path = "/:id"
          method = GET
          response = User
        }

        action missingField {
          path = "/:id/:name"
          method = GET
          params = MissingNameParams
          response = User
        }

        action unusedField {
          path = "/:id"
          method = GET
          params = ExtraNameParams
          response = User
        }

        action optionalMismatch {
          path = "/:id/:name"
          method = GET
          params = OptionalMismatchParams
          response = User
        }

        action requiredMismatch {
          path = "/:id/:name?"
          method = GET
          params = RequiredMismatchParams
          response = User
        }

        action noPathParams {
          path = "/"
          method = GET
          params = ExtraNameParams
          response = User
        }
      }
    `);

    expect(validateMorphSchema(schema)).toEqual([
      {
        code: 'missing_action_params',
        severity: 'error',
        message: 'Action "users.missingParams" path "/users/:id" requires params.',
      },
      {
        code: 'path_param_missing_field',
        severity: 'error',
        message: 'Path parameter "name" in action "users.missingField" is missing in params type "MissingNameParams".',
      },
      {
        code: 'path_param_unused_field',
        severity: 'error',
        message:
          'Field "name" in params type "ExtraNameParams" is not used in action "users.unusedField" path "/users/:id".',
      },
      {
        code: 'path_param_optionality_mismatch',
        severity: 'error',
        message:
          'Path parameter "name" in action "users.optionalMismatch" is required, but field "name" in params type "OptionalMismatchParams" is optional.',
      },
      {
        code: 'path_param_optionality_mismatch',
        severity: 'error',
        message:
          'Path parameter "name" in action "users.requiredMismatch" is optional, but field "name" in params type "RequiredMismatchParams" is required.',
      },
      {
        code: 'path_param_unused_field',
        severity: 'error',
        message: 'Action "users.noPathParams" defines params but path "/users" has no params.',
      },
    ]);
  });
});

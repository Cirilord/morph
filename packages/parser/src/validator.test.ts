import { describe, expect, it } from 'vitest';

import { parseMidlaneSchema } from './parser.js';
import { validateMidlaneSchema } from './validator.js';

describe('validateMidlaneSchema', () => {
  it('accepts a valid schema', () => {
    const schema = parseMidlaneSchema(`
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

      resource Users {
        path = "/users"

        action GetBySlug {
          method = GET
          path = "/:id/:slug?"
          params = UserParams
          response = User
        }
      }
    `);

    expect(validateMidlaneSchema(schema)).toEqual([]);
  });

  it('reports missing root declarations and required properties', () => {
    const schema = parseMidlaneSchema(`
      resource Users {
        action List {
        }
      }
    `);

    expect(validateMidlaneSchema(schema)).toEqual([
      {
        code: 'missing_generator',
        severity: 'error',
        message: 'Missing generator declaration.',
      },
      {
        code: 'missing_resource_path',
        severity: 'error',
        message: 'Resource "Users" is missing path.',
      },
      {
        code: 'missing_action_path',
        severity: 'error',
        message: 'Action "Users.List" is missing path.',
      },
      {
        code: 'missing_action_method',
        severity: 'error',
        message: 'Action "Users.List" is missing method.',
      },
      {
        code: 'missing_action_response',
        severity: 'error',
        message: 'Action "Users.List" is missing response.',
      },
    ]);
  });

  it('reports duplicate declarations and members', () => {
    const schema = parseMidlaneSchema(`
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

      resource Users {
        path = "/users"

        action List {
          path = "/"
          method = GET
          response = User[]
        }

        action List {
          path = "/"
          method = GET
          response = User[]
        }

        resource Posts {
          path = "/posts"
        }

        resource Posts {
          path = "/posts"
        }
      }
    `);

    expect(validateMidlaneSchema(schema).map((diagnostic) => diagnostic.code)).toEqual([
      'duplicate_type',
      'duplicate_enum',
      'duplicate_type_field',
      'duplicate_enum_value',
      'duplicate_action',
      'duplicate_resource',
    ]);
  });

  it('requires PascalCase resource and action names', () => {
    const schema = parseMidlaneSchema(`
      generator client {
        output = "./generated/client"
      }

      type User {
        id Int
      }

      resource users {
        path = "/users"

        action list {
          path = "/"
          method = GET
          response = User[]
        }
      }
    `);

    expect(validateMidlaneSchema(schema)).toEqual([
      {
        code: 'invalid_resource_name',
        severity: 'error',
        message: 'Resource "users" must use PascalCase, for example "Users".',
      },
      {
        code: 'invalid_action_name',
        severity: 'error',
        message: 'Action "users.list" must use PascalCase, for example "List".',
      },
    ]);
  });

  it('reports unknown referenced types and bodyless method bodies', () => {
    const schema = parseMidlaneSchema(`
      generator client {
        output = "./generated/client"
      }

      type User {
        id MissingId
      }

      resource Users {
        path = "/users"

        action List {
          path = "/"
          method = GET
          query = MissingQuery
          body = MissingBody
          response = MissingResponse[]
        }
      }
    `);

    expect(validateMidlaneSchema(schema)).toEqual([
      {
        code: 'unknown_type',
        severity: 'error',
        message: 'Unknown type "MissingId" used in type "User" field "id".',
      },
      {
        code: 'body_not_allowed',
        severity: 'error',
        message: 'Action "Users.List" uses body with GET.',
      },
      {
        code: 'unknown_type',
        severity: 'error',
        message: 'Unknown type "MissingQuery" used in action "Users.List" query.',
      },
      {
        code: 'unknown_type',
        severity: 'error',
        message: 'Unknown type "MissingBody" used in action "Users.List" body.',
      },
      {
        code: 'unknown_type',
        severity: 'error',
        message: 'Unknown type "MissingResponse" used in action "Users.List" response.',
      },
    ]);
  });

  it('validates action path params against params type fields', () => {
    const schema = parseMidlaneSchema(`
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

      resource Users {
        path = "/users"

        action MissingParams {
          path = "/:id"
          method = GET
          response = User
        }

        action MissingField {
          path = "/:id/:name"
          method = GET
          params = MissingNameParams
          response = User
        }

        action UnusedField {
          path = "/:id"
          method = GET
          params = ExtraNameParams
          response = User
        }

        action OptionalMismatch {
          path = "/:id/:name"
          method = GET
          params = OptionalMismatchParams
          response = User
        }

        action RequiredMismatch {
          path = "/:id/:name?"
          method = GET
          params = RequiredMismatchParams
          response = User
        }

        action NoPathParams {
          path = "/"
          method = GET
          params = ExtraNameParams
          response = User
        }
      }
    `);

    expect(validateMidlaneSchema(schema)).toEqual([
      {
        code: 'missing_action_params',
        severity: 'error',
        message: 'Action "Users.MissingParams" path "/users/:id" requires params.',
      },
      {
        code: 'path_param_missing_field',
        severity: 'error',
        message: 'Path parameter "name" in action "Users.MissingField" is missing in params type "MissingNameParams".',
      },
      {
        code: 'path_param_unused_field',
        severity: 'error',
        message:
          'Field "name" in params type "ExtraNameParams" is not used in action "Users.UnusedField" path "/users/:id".',
      },
      {
        code: 'path_param_optionality_mismatch',
        severity: 'error',
        message:
          'Path parameter "name" in action "Users.OptionalMismatch" is required, but field "name" in params type "OptionalMismatchParams" is optional.',
      },
      {
        code: 'path_param_optionality_mismatch',
        severity: 'error',
        message:
          'Path parameter "name" in action "Users.RequiredMismatch" is optional, but field "name" in params type "RequiredMismatchParams" is required.',
      },
      {
        code: 'path_param_unused_field',
        severity: 'error',
        message: 'Action "Users.NoPathParams" defines params but path "/users" has no params.',
      },
    ]);
  });
});

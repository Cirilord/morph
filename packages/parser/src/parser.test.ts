import { describe, expect, it } from 'vitest';

import { parseMorphSchema } from './parser.js';

describe('parseMorphSchema', () => {
  it('parses the first Morph schema shape', () => {
    const schema = parseMorphSchema(`
      datasource api {
        url = env("API_URL")
      }

      generator client {
        output = "./generated/client"
      }

      type User {
        id Int @map("usr_id")
        name String @map("usr_name")
        email String? @map("usr_mail")
      }

      type ListUsersQuery {
        search String? @map("q")
        page Int? @map("page_num")
      }

      resource users {
        path = "/users"

        action list {
          method = GET
          query = ListUsersQuery
          response = User[]
        }
      }
    `);

    expect(schema.datasource).toEqual({
      kind: 'datasource',
      name: 'api',
      url: { kind: 'env', name: 'API_URL' },
    });
    expect(schema.generator).toEqual({
      kind: 'generator',
      name: 'client',
      output: './generated/client',
    });
    expect(schema.types).toHaveLength(2);
    expect(schema.types[0]?.fields).toEqual([
      {
        kind: 'field',
        name: 'id',
        type: { name: 'Int', isArray: false, isOptional: false },
        map: 'usr_id',
      },
      {
        kind: 'field',
        name: 'name',
        type: { name: 'String', isArray: false, isOptional: false },
        map: 'usr_name',
      },
      {
        kind: 'field',
        name: 'email',
        type: { name: 'String', isArray: false, isOptional: true },
        map: 'usr_mail',
      },
    ]);
    expect(schema.resources[0]).toEqual({
      kind: 'resource',
      name: 'users',
      path: '/users',
      resources: [],
      actions: [
        {
          kind: 'action',
          name: 'list',
          method: 'GET',
          query: { name: 'ListUsersQuery', isArray: false, isOptional: false },
          response: { name: 'User', isArray: true, isOptional: false },
        },
      ],
    });
  });

  it('parses nested resources and enums', () => {
    const schema = parseMorphSchema(`
      enum UserStatus {
        ACTIVE
        BLOCKED
      }

      resource users {
        path = "/users"

        resource posts {
          path = "/:userId/posts"

          action list {
            method = GET
            response = Post[]
          }
        }
      }
    `);

    expect(schema.enums[0]).toEqual({
      kind: 'enum',
      name: 'UserStatus',
      values: ['ACTIVE', 'BLOCKED'],
    });
    expect(schema.resources[0]?.resources[0]).toMatchObject({
      kind: 'resource',
      name: 'posts',
      path: '/:userId/posts',
    });
  });
});

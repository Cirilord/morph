import { describe, expect, it } from 'vitest';

import { parseMorphSchema } from './parser.js';

describe('parseMorphSchema', () => {
  it('rejects datasource declarations', () => {
    expect(() =>
      parseMorphSchema(`
        datasource api {
          url = env("API_URL")
        }
      `)
    ).toThrow('Unknown top-level declaration "datasource"');
  });

  it('parses the first Morph schema shape', () => {
    const schema = parseMorphSchema(`
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

      resource Users {
        path = "/users"

        action List {
          path = "/"
          method = GET
          query = ListUsersQuery
          response = User[]
        }
      }
    `);

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
      name: 'Users',
      path: '/users',
      resources: [],
      actions: [
        {
          kind: 'action',
          name: 'List',
          method: 'GET',
          path: '/',
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

      resource Users {
        path = "/users"

        resource Posts {
          path = "/:userId/posts"

          action List {
            path = "/"
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
      name: 'Posts',
      path: '/:userId/posts',
    });
  });
});

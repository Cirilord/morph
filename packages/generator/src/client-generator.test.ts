import { parseMorphSchema } from '@morph/parser';
import { describe, expect, it } from 'vitest';

import { generateMorphClient } from './client-generator.js';

describe('generateMorphClient', () => {
  it('generates types, maps, client, and index files', () => {
    const schema = parseMorphSchema(`
      datasource api {
        url = env("API_URL")
      }

      generator client {
        output = "./generated/client"
      }

      enum UserStatus {
        ACTIVE
        BLOCKED
      }

      type User {
        id Int @map("usr_id")
        name String @map("usr_name")
        status UserStatus
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

    expect(generateMorphClient(schema)).toEqual([
      {
        path: 'types.ts',
        content: [
          'export type MorphClientOptions = {',
          '  baseUrl: string;',
          '  fetcher?: typeof fetch;',
          '};',
          '',
          'export type UserStatus = "ACTIVE" | "BLOCKED";',
          '',
          'export type User = {',
          '  id: number;',
          '  name: string;',
          '  status: UserStatus;',
          '};',
          '',
          'export type ListUsersQuery = {',
          '  search?: string;',
          '  page?: number;',
          '};',
          '',
        ].join('\n'),
      },
      {
        path: 'maps.ts',
        content: [
          "import type { MapperObject } from '@morph/runtime';",
          '',
          'export const UserMap = {',
          '  id: { externalName: "usr_id" },',
          '  name: { externalName: "usr_name" },',
          '} satisfies MapperObject;',
          'export const ListUsersQueryMap = {',
          '  search: { externalName: "q" },',
          '  page: { externalName: "page_num" },',
          '} satisfies MapperObject;',
          '',
          'export const maps = {',
          '  User: UserMap,',
          '  ListUsersQuery: ListUsersQueryMap,',
          '} as const;',
          '',
        ].join('\n'),
      },
      {
        path: 'client.ts',
        content: [
          "import type { ListUsersQuery, MorphClientOptions, User } from './types.js';",
          "import { MorphEngine } from '@morph/runtime';",
          "import { ListUsersQueryMap, UserMap } from './maps.js';",
          '',
          'export class MorphClient {',
          '  readonly #engine: MorphEngine;',
          '',
          '  constructor(options: MorphClientOptions) {',
          '    this.#engine = new MorphEngine(options);',
          '  }',
          '',
          '  readonly users = {',
          '    list: async (options?: { query?: ListUsersQuery }): Promise<User[]> => {',
          '      return this.#engine.request<User[]>({',
          '        method: "GET",',
          '        path: "/users",',
          '        query: options?.query === undefined ? undefined : (options.query as Record<string, unknown>),',
          '        queryMapper: ListUsersQueryMap,',
          '        responseMapper: UserMap,',
          '      });',
          '    },',
          '  };',
          '}',
          '',
        ].join('\n'),
      },
      {
        path: 'index.ts',
        content: [
          "export { MorphClient } from './client.js';",
          "export * from './types.js';",
          "export { maps, UserMap, ListUsersQueryMap } from './maps.js';",
          '',
        ].join('\n'),
      },
    ]);
  });
});

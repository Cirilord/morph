import { parseMorphSchema } from '@morph/parser';
import { describe, expect, it } from 'vitest';

import { generateMorphClient } from './client-generator.js';

describe('generateMorphClient', () => {
  it('generates types, maps, client, and index files', () => {
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
        name String @map("usr_name")
        status UserStatus
      }

      type ListUsersQuery {
        search String? @map("q")
        page Int? @map("page_num")
      }

      type UserIdParams {
        id Int
        name String?
      }

      type AuthHeaders {
        token String @map("authorization")
      }

      type CreateUserBody {
        name String @map("usr_name")
      }

      resource users {
        path = "/users"

        action list {
          path = "/"
          method = GET
          headers = AuthHeaders
          query = ListUsersQuery
          response = User[]
        }

        action getById {
          path = "/:id/:name?"
          method = GET
          params = UserIdParams
          response = User
        }

        action create {
          path = "/"
          method = POST
          headers = AuthHeaders
          body = CreateUserBody
          response = User
        }
      }
    `);

    expect(generateMorphClient(schema, { datasourceUrl: 'https://api.example.com' })).toEqual([
      {
        path: 'types.ts',
        content: [
          'export type MorphClientOptions = {',
          '  baseUrl?: string;',
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
          'export type UserIdParams = {',
          '  id: number;',
          '  name?: string;',
          '};',
          '',
          'export type AuthHeaders = {',
          '  token: string;',
          '};',
          '',
          'export type CreateUserBody = {',
          '  name: string;',
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
          'export const UserIdParamsMap = {',
          '} satisfies MapperObject;',
          'export const AuthHeadersMap = {',
          '  token: { externalName: "authorization" },',
          '} satisfies MapperObject;',
          'export const CreateUserBodyMap = {',
          '  name: { externalName: "usr_name" },',
          '} satisfies MapperObject;',
          '',
          'export const maps = {',
          '  User: UserMap,',
          '  ListUsersQuery: ListUsersQueryMap,',
          '  UserIdParams: UserIdParamsMap,',
          '  AuthHeaders: AuthHeadersMap,',
          '  CreateUserBody: CreateUserBodyMap,',
          '} as const;',
          '',
        ].join('\n'),
      },
      {
        path: 'client.ts',
        content: [
          "import type { AuthHeaders, CreateUserBody, ListUsersQuery, MorphClientOptions, User, UserIdParams } from './types.js';",
          "import { MorphEngine } from '@morph/runtime';",
          "import { AuthHeadersMap, CreateUserBodyMap, ListUsersQueryMap, UserMap } from './maps.js';",
          '',
          'const defaultBaseUrl = "https://api.example.com";',
          '',
          'export class MorphClient {',
          '  readonly #engine: MorphEngine;',
          '',
          '  constructor(options: MorphClientOptions = {}) {',
          '    this.#engine = new MorphEngine({',
          '      ...options,',
          '      baseUrl: options.baseUrl ?? defaultBaseUrl,',
          '    });',
          '  }',
          '',
          '  readonly users = {',
          '    list: async (options?: { query?: ListUsersQuery; headers?: AuthHeaders }): Promise<User[]> => {',
          '      return this.#engine.request<User[]>({',
          '        method: "GET",',
          '        path: "/users",',
          '        query: options?.query === undefined ? undefined : (options.query as Record<string, unknown>),',
          '        queryMapper: ListUsersQueryMap,',
          '        headers: options?.headers === undefined ? undefined : (options.headers as Record<string, unknown>),',
          '        headersMapper: AuthHeadersMap,',
          '        responseMapper: UserMap,',
          '      });',
          '    },',
          '    getById: async (options: { params: UserIdParams }): Promise<User> => {',
          '      return this.#engine.request<User>({',
          '        method: "GET",',
          '        path: "/users/:id/:name?",',
          '        params: options.params as Record<string, unknown>,',
          '        responseMapper: UserMap,',
          '      });',
          '    },',
          '    create: async (options: { body: CreateUserBody; headers?: AuthHeaders }): Promise<User> => {',
          '      return this.#engine.request<User>({',
          '        method: "POST",',
          '        path: "/users",',
          '        body: options.body,',
          '        bodyMapper: CreateUserBodyMap,',
          '        headers: options?.headers === undefined ? undefined : (options.headers as Record<string, unknown>),',
          '        headersMapper: AuthHeadersMap,',
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
          "export { maps, UserMap, ListUsersQueryMap, UserIdParamsMap, AuthHeadersMap, CreateUserBodyMap } from './maps.js';",
          '',
        ].join('\n'),
      },
    ]);
  });
});

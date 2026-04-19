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
          "import type { MapperObject } from '@morph/runtime';",
          "import type { ListUsersQuery, MorphClientOptions, User } from './types.js';",
          "import { toExternal, toInternal } from '@morph/runtime';",
          "import { ListUsersQueryMap, UserMap } from './maps.js';",
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
          '',
          '  readonly users = {',
          '    list: async (options?: { query?: ListUsersQuery }): Promise<User[]> => {',
          '      return this.#request<User[]>({',
          '        method: "GET",',
          '        path: "/users",',
          '        query: options?.query === undefined ? undefined : (toExternal(ListUsersQueryMap, options.query) as Record<string, unknown>),',
          '        responseMapper: UserMap,',
          '      });',
          '    },',
          '  };',
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

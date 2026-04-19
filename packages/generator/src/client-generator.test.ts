import { parseMorphSchema } from '@morph/parser';
import { describe, expect, it } from 'vitest';

import { generateMorphClient } from './client-generator.js';

describe('generateMorphClient', () => {
  it('generates types, maps, and index files', () => {
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
    `);

    expect(generateMorphClient(schema)).toEqual([
      {
        path: 'types.ts',
        content: [
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
        path: 'index.ts',
        content: [
          "export * from './types.js';",
          "export { maps, UserMap, ListUsersQueryMap } from './maps.js';",
          '',
        ].join('\n'),
      },
    ]);
  });
});

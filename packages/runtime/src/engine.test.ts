import { describe, expect, it } from 'vitest';

import { MidlaneEngine } from './engine.js';
import type { MapperObject } from './mapper.js';

describe('MidlaneEngine', () => {
  const userMapper: MapperObject = {
    id: { externalName: 'usr_id' },
    name: { externalName: 'usr_name' },
  };

  const queryMapper: MapperObject = {
    search: { externalName: 'q' },
    page: { externalName: 'page_num' },
  };

  it('maps query and response data around fetch requests', async () => {
    const fetcher = async (url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      expect(String(url)).toBe('https://api.example.com/users?q=joao&page_num=1');
      expect(init?.method).toBe('GET');

      return Response.json([{ usr_id: 1, usr_name: 'Joao' }]);
    };

    const engine = new MidlaneEngine({
      baseUrl: 'https://api.example.com',
      fetcher,
    });

    await expect(
      engine.request({
        method: 'GET',
        path: '/users',
        query: {
          search: 'joao',
          page: 1,
        },
        queryMapper,
        responseMapper: userMapper,
      })
    ).resolves.toEqual([{ id: 1, name: 'Joao' }]);
  });

  it('maps params, headers, and body before fetch requests', async () => {
    const bodyMapper: MapperObject = {
      name: { externalName: 'usr_name' },
    };
    const headersMapper: MapperObject = {
      requestId: { externalName: 'x-request-id' },
    };
    const fetcher = async (url: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      const headers = init?.headers;

      expect(String(url)).toBe('https://api.example.com/users/123');
      expect(init?.body).toBe(JSON.stringify({ usr_name: 'Ana' }));
      expect(headers).toBeInstanceOf(Headers);
      expect((headers as Headers).get('content-type')).toBe('application/json');
      expect((headers as Headers).get('x-request-id')).toBe('abc');

      return Response.json({ usr_id: 123, usr_name: 'Ana' });
    };

    const engine = new MidlaneEngine({
      baseUrl: 'https://api.example.com',
      fetcher,
    });

    await expect(
      engine.request({
        method: 'POST',
        path: '/users/:id',
        body: {
          name: 'Ana',
        },
        bodyMapper,
        headers: {
          requestId: 'abc',
        },
        headersMapper,
        params: {
          id: 123,
        },
        responseMapper: userMapper,
      })
    ).resolves.toEqual({ id: 123, name: 'Ana' });
  });

  it('omits optional path parameter segments when values are missing', async () => {
    const fetcher = async (url: URL | RequestInfo): Promise<Response> => {
      expect(String(url)).toBe('https://api.example.com/users/123');

      return Response.json({ usr_id: 123, usr_name: 'Ana' });
    };

    const engine = new MidlaneEngine({
      baseUrl: 'https://api.example.com',
      fetcher,
    });

    await expect(
      engine.request({
        method: 'GET',
        path: '/users/:id/:name?',
        params: {
          id: 123,
        },
        responseMapper: userMapper,
      })
    ).resolves.toEqual({ id: 123, name: 'Ana' });
  });

  it('keeps optional path parameter segments when values are present', async () => {
    const fetcher = async (url: URL | RequestInfo): Promise<Response> => {
      expect(String(url)).toBe('https://api.example.com/users/123/ana');

      return Response.json({ usr_id: 123, usr_name: 'Ana' });
    };

    const engine = new MidlaneEngine({
      baseUrl: 'https://api.example.com',
      fetcher,
    });

    await expect(
      engine.request({
        method: 'GET',
        path: '/users/:id/:name?',
        params: {
          id: 123,
          name: 'ana',
        },
        responseMapper: userMapper,
      })
    ).resolves.toEqual({ id: 123, name: 'Ana' });
  });

  it('throws on failed responses', async () => {
    const engine = new MidlaneEngine({
      baseUrl: 'https://api.example.com',
      fetcher: async () => new Response(JSON.stringify({ error: 'Nope' }), { status: 500 }),
    });

    await expect(
      engine.request({
        method: 'GET',
        path: '/users',
      })
    ).rejects.toThrow('Midlane request failed with status 500.');
  });
});

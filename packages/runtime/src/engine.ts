import type { MapperObject } from './mapper.js';
import { toExternal, toInternal } from './mapper.js';

export type MorphEngineOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
};

export type MorphEngineRequest = {
  method: string;
  path: string;
  body?: unknown;
  bodyMapper?: MapperObject | undefined;
  headers?: Record<string, unknown> | undefined;
  headersMapper?: MapperObject | undefined;
  params?: Record<string, unknown> | undefined;
  paramsMapper?: MapperObject | undefined;
  query?: Record<string, unknown> | undefined;
  queryMapper?: MapperObject | undefined;
  responseMapper?: MapperObject | undefined;
};

export class MorphEngine {
  readonly #baseUrl: string;
  readonly #fetcher: typeof fetch;

  constructor(options: MorphEngineOptions) {
    this.#baseUrl = options.baseUrl;
    this.#fetcher = options.fetcher ?? fetch;
  }

  async request<T>(request: MorphEngineRequest): Promise<T> {
    const params = this.#mapRecord(request.params, request.paramsMapper);
    const query = this.#mapRecord(request.query, request.queryMapper);
    const headers = this.#mapRecord(request.headers, request.headersMapper);
    const body = this.#mapValue(request.body, request.bodyMapper);
    const url = this.#buildUrl(this.#buildPath(request.path, params), query);
    const hasBody = body !== undefined;
    const init: RequestInit = {
      headers: this.#buildHeaders(headers, hasBody),
      method: request.method,
    };

    if (hasBody) {
      init.body = JSON.stringify(body);
    }

    const response = await this.#fetcher(url, init);
    const data = await this.#readJson(response);

    if (!response.ok) {
      throw new Error(`Morph request failed with status ${response.status}.`);
    }

    return this.#mapResponse<T>(data, request.responseMapper);
  }

  #mapRecord(
    value: Record<string, unknown> | undefined,
    mapper: MapperObject | undefined
  ): Record<string, unknown> | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (mapper === undefined) {
      return value;
    }

    return toExternal(mapper, value) as Record<string, unknown>;
  }

  #mapValue(value: unknown, mapper: MapperObject | undefined): unknown {
    if (value === undefined || mapper === undefined) {
      return value;
    }

    return toExternal(mapper, value);
  }

  #mapResponse<T>(value: unknown, mapper: MapperObject | undefined): T {
    if (mapper === undefined) {
      return value as T;
    }

    return toInternal(mapper, value) as T;
  }

  #buildPath(path: string, params: Record<string, unknown> | undefined): string {
    if (params === undefined) {
      return path;
    }

    return path.replace(/:([A-Za-z0-9_]+)/g, (_match: string, key: string) => {
      const value = params[key];

      if (value === undefined) {
        throw new Error(`Missing path parameter '${key}'.`);
      }

      return encodeURIComponent(String(value));
    });
  }

  #buildUrl(path: string, query: Record<string, unknown> | undefined): URL {
    const url = new URL(path, this.#baseUrl);

    if (query === undefined) {
      return url;
    }

    for (const [key, value] of Object.entries(query)) {
      this.#appendQueryValue(url, key, value);
    }

    return url;
  }

  #appendQueryValue(url: URL, key: string, value: unknown): void {
    if (value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.#appendQueryValue(url, key, item);
      }

      return;
    }

    url.searchParams.append(key, String(value));
  }

  #buildHeaders(headers: Record<string, unknown> | undefined, hasBody: boolean): Headers {
    const result = new Headers();

    if (hasBody) {
      result.set('content-type', 'application/json');
    }

    if (headers === undefined) {
      return result;
    }

    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        result.set(key, String(value));
      }
    }

    return result;
  }

  async #readJson(response: Response): Promise<unknown> {
    const text = await response.text();

    if (text.length === 0) {
      return undefined;
    }

    return JSON.parse(text) as unknown;
  }
}

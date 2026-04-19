import type {
  ActionDeclaration,
  ApiSchema,
  DatasourceDeclaration,
  EnumDeclaration,
  FieldDeclaration,
  GeneratorDeclaration,
  HttpMethod,
  ResourceDeclaration,
  TypeDeclaration,
  TypeRef,
  ValueExpression,
} from './ast.js';
import { type Punctuation, type Token, tokenize } from './tokenizer.js';

const httpMethods = new Set<string>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export class ParseError extends Error {
  constructor(
    message: string,
    readonly token: Token
  ) {
    super(`${message} at ${token.line}:${token.column}`);
    this.name = 'ParseError';
  }
}

export function parseMorphSchema(source: string): ApiSchema {
  return new Parser(tokenize(source)).parseSchema();
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parseSchema(): ApiSchema {
    const schema: ApiSchema = {
      kind: 'schema',
      types: [],
      enums: [],
      resources: [],
    };

    while (!this.is('eof')) {
      const keyword = this.expectIdentifier('Expected top-level declaration');

      switch (keyword) {
        case 'datasource':
          schema.datasource = this.parseDatasource();
          break;
        case 'generator':
          schema.generator = this.parseGenerator();
          break;
        case 'type':
          schema.types.push(this.parseType());
          break;
        case 'enum':
          schema.enums.push(this.parseEnum());
          break;
        case 'resource':
          schema.resources.push(this.parseResource());
          break;
        default:
          throw this.error(`Unknown top-level declaration "${keyword}"`);
      }
    }

    return schema;
  }

  private parseDatasource(): DatasourceDeclaration {
    const name = this.expectIdentifier('Expected datasource name');
    let url: ValueExpression | undefined;

    this.expectPunctuation('{');
    while (!this.consumePunctuation('}')) {
      const key = this.expectIdentifier('Expected datasource property');
      this.expectPunctuation('=');

      switch (key) {
        case 'url':
          url = this.parseValueExpression();
          break;
        default:
          throw this.error(`Unknown datasource property "${key}"`);
      }
    }

    return {
      kind: 'datasource',
      name,
      ...(url === undefined ? {} : { url }),
    };
  }

  private parseGenerator(): GeneratorDeclaration {
    const name = this.expectIdentifier('Expected generator name');
    let output: string | undefined;

    this.expectPunctuation('{');
    while (!this.consumePunctuation('}')) {
      const key = this.expectIdentifier('Expected generator property');
      this.expectPunctuation('=');

      switch (key) {
        case 'output':
          output = this.expectString('Expected generator output string');
          break;
        default:
          throw this.error(`Unknown generator property "${key}"`);
      }
    }

    return {
      kind: 'generator',
      name,
      ...(output === undefined ? {} : { output }),
    };
  }

  private parseType(): TypeDeclaration {
    const name = this.expectIdentifier('Expected type name');
    const fields: FieldDeclaration[] = [];

    this.expectPunctuation('{');
    while (!this.consumePunctuation('}')) {
      const fieldName = this.expectIdentifier('Expected field name');
      const type = this.parseTypeRef();
      const field: FieldDeclaration = {
        kind: 'field',
        name: fieldName,
        type,
      };

      while (this.consumePunctuation('@')) {
        const attribute = this.expectIdentifier('Expected field attribute name');

        switch (attribute) {
          case 'map':
            this.expectPunctuation('(');
            field.map = this.expectString('Expected @map string value');
            this.expectPunctuation(')');
            break;
          default:
            throw this.error(`Unknown field attribute "@${attribute}"`);
        }
      }

      fields.push(field);
    }

    return { kind: 'type', name, fields };
  }

  private parseEnum(): EnumDeclaration {
    const name = this.expectIdentifier('Expected enum name');
    const values: string[] = [];

    this.expectPunctuation('{');
    while (!this.consumePunctuation('}')) {
      values.push(this.expectIdentifier('Expected enum value'));
    }

    return { kind: 'enum', name, values };
  }

  private parseResource(): ResourceDeclaration {
    const name = this.expectIdentifier('Expected resource name');
    const resource: ResourceDeclaration = {
      kind: 'resource',
      name,
      actions: [],
      resources: [],
    };

    this.expectPunctuation('{');
    while (!this.consumePunctuation('}')) {
      const key = this.expectIdentifier('Expected resource property');

      switch (key) {
        case 'path':
          this.expectPunctuation('=');
          resource.path = this.expectString('Expected resource path string');
          break;
        case 'action':
          resource.actions.push(this.parseAction());
          break;
        case 'resource':
          resource.resources.push(this.parseResource());
          break;
        default:
          throw this.error(`Unknown resource property "${key}"`);
      }
    }

    return resource;
  }

  private parseAction(): ActionDeclaration {
    const name = this.expectIdentifier('Expected action name');
    const action: ActionDeclaration = {
      kind: 'action',
      name,
    };

    this.expectPunctuation('{');
    while (!this.consumePunctuation('}')) {
      const key = this.expectIdentifier('Expected action property');
      this.expectPunctuation('=');

      switch (key) {
        case 'method':
          action.method = this.parseHttpMethod();
          break;
        case 'path':
          action.path = this.expectString('Expected action path string');
          break;
        case 'params':
          action.params = this.parseTypeRef();
          break;
        case 'query':
          action.query = this.parseTypeRef();
          break;
        case 'body':
          action.body = this.parseTypeRef();
          break;
        case 'headers':
          action.headers = this.parseTypeRef();
          break;
        case 'response':
          action.response = this.parseTypeRef();
          break;
        default:
          throw this.error(`Unknown action property "${key}"`);
      }
    }

    return action;
  }

  private parseTypeRef(): TypeRef {
    const name = this.expectIdentifier('Expected type reference');
    let isArray = false;

    if (this.consumePunctuation('[')) {
      this.expectPunctuation(']');
      isArray = true;
    }

    const isOptional = this.consumePunctuation('?');

    return { name, isArray, isOptional };
  }

  private parseValueExpression(): ValueExpression {
    if (this.peek().type === 'string') {
      return {
        kind: 'string',
        value: this.expectString('Expected string value'),
      };
    }

    const callee = this.expectIdentifier('Expected value expression');

    if (callee !== 'env') {
      throw this.error(`Unknown value expression "${callee}"`);
    }

    this.expectPunctuation('(');
    const name = this.expectString('Expected env variable name');
    this.expectPunctuation(')');

    return { kind: 'env', name };
  }

  private parseHttpMethod(): HttpMethod {
    const method = this.expectIdentifier('Expected HTTP method');

    if (!httpMethods.has(method)) {
      throw this.error(`Unknown HTTP method "${method}"`);
    }

    return method as HttpMethod;
  }

  private expectIdentifier(message: string): string {
    const token = this.peek();

    if (token.type !== 'identifier') {
      throw this.error(message);
    }

    this.position += 1;
    return token.value;
  }

  private expectString(message: string): string {
    const token = this.peek();

    if (token.type !== 'string') {
      throw this.error(message);
    }

    this.position += 1;
    return token.value;
  }

  private expectPunctuation(value: Punctuation): void {
    if (!this.consumePunctuation(value)) {
      throw this.error(`Expected "${value}"`);
    }
  }

  private consumePunctuation(value: Punctuation): boolean {
    const token = this.peek();

    if (token.type !== 'punctuation' || token.value !== value) {
      return false;
    }

    this.position += 1;
    return true;
  }

  private is(type: Token['type']): boolean {
    return this.peek().type === type;
  }

  private peek(): Token {
    const token = this.tokens[this.position];

    if (token !== undefined) {
      return token;
    }

    const lastToken = this.tokens.at(-1);

    if (lastToken === undefined) {
      throw new Error('Parser cannot read from an empty token list');
    }

    return lastToken;
  }

  private error(message: string): ParseError {
    return new ParseError(message, this.peek());
  }
}

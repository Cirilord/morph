export type Token =
  | {
      type: 'identifier';
      value: string;
      line: number;
      column: number;
    }
  | {
      type: 'string';
      value: string;
      line: number;
      column: number;
    }
  | {
      type: 'punctuation';
      value: Punctuation;
      line: number;
      column: number;
    }
  | {
      type: 'eof';
      value: '';
      line: number;
      column: number;
    };

export type Punctuation = '{' | '}' | '(' | ')' | '=' | '@' | '[' | ']' | '?';

const punctuation = new Set<string>(['{', '}', '(', ')', '=', '@', '[', ']', '?']);

export class TokenizeError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number
  ) {
    super(`${message} at ${line}:${column}`);
    this.name = 'TokenizeError';
  }
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  const current = () => source[index];
  const next = () => source[index + 1];

  const advance = () => {
    const char = source[index];
    index += 1;

    if (char === '\n') {
      line += 1;
      column = 1;
      return;
    }

    column += 1;
  };

  while (index < source.length) {
    const char = current();

    if (char === undefined) {
      break;
    }

    if (/\s/.test(char)) {
      advance();
      continue;
    }

    if (char === '/' && next() === '/') {
      while (index < source.length && current() !== '\n') {
        advance();
      }
      continue;
    }

    if (char === '#') {
      while (index < source.length && current() !== '\n') {
        advance();
      }
      continue;
    }

    if (char === '"') {
      tokens.push(readString(source, index, line, column));

      advance();
      while (index < source.length && current() !== '"') {
        if (current() === '\\') {
          advance();
        }
        advance();
      }

      if (current() !== '"') {
        throw new TokenizeError('Unterminated string', line, column);
      }

      advance();
      continue;
    }

    if (isIdentifierStart(char)) {
      const start = index;
      const tokenLine = line;
      const tokenColumn = column;

      while (index < source.length && isIdentifierPart(current())) {
        advance();
      }

      tokens.push({
        type: 'identifier',
        value: source.slice(start, index),
        line: tokenLine,
        column: tokenColumn,
      });
      continue;
    }

    if (punctuation.has(char)) {
      tokens.push({
        type: 'punctuation',
        value: char as Punctuation,
        line,
        column,
      });
      advance();
      continue;
    }

    throw new TokenizeError(`Unexpected character "${char}"`, line, column);
  }

  tokens.push({ type: 'eof', value: '', line, column });

  return tokens;
}

function readString(source: string, start: number, line: number, column: number): Token {
  let value = '';
  let index = start + 1;

  while (index < source.length && source[index] !== '"') {
    const char = source[index];

    if (char === '\\') {
      const escaped = source[index + 1];

      if (escaped === undefined) {
        break;
      }

      value += decodeEscape(escaped);
      index += 2;
      continue;
    }

    value += char;
    index += 1;
  }

  return {
    type: 'string',
    value,
    line,
    column,
  };
}

function decodeEscape(char: string): string {
  switch (char) {
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    default:
      return char;
  }
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char);
}

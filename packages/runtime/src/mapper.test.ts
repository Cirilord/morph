import { describe, expect, it } from 'vitest';

import type { MapperObject } from './mapper.js';
import { toExternal, toInternal } from './mapper.js';

describe('mapper', () => {
  const userMapper: MapperObject = {
    id: { externalName: 'usr_id' },
    name: { externalName: 'usr_name' },
    email: { externalName: 'usr_mail' },
  };

  it('maps internal object fields to external names', () => {
    expect(
      toExternal(userMapper, {
        id: 1,
        name: 'Joao',
        email: 'joao@example.com',
      })
    ).toEqual({
      usr_id: 1,
      usr_name: 'Joao',
      usr_mail: 'joao@example.com',
    });
  });

  it('maps external object fields to internal names', () => {
    expect(
      toInternal(userMapper, {
        usr_id: 1,
        usr_name: 'Joao',
        usr_mail: 'joao@example.com',
      })
    ).toEqual({
      id: 1,
      name: 'Joao',
      email: 'joao@example.com',
    });
  });

  it('preserves fields without mapping metadata', () => {
    expect(
      toExternal(
        {
          id: { externalName: 'usr_id' },
          active: {},
        },
        {
          id: 1,
          active: true,
          extra: 'kept',
        }
      )
    ).toEqual({
      usr_id: 1,
      active: true,
      extra: 'kept',
    });
  });

  it('omits undefined values', () => {
    expect(
      toExternal(userMapper, {
        id: 1,
        name: undefined,
      })
    ).toEqual({
      usr_id: 1,
    });
  });

  it('maps nested objects', () => {
    const postMapper: MapperObject = {
      id: { externalName: 'post_id' },
      author: {
        externalName: 'usr',
        type: userMapper,
      },
    };

    expect(
      toExternal(postMapper, {
        id: 10,
        author: {
          id: 1,
          name: 'Joao',
          email: 'joao@example.com',
        },
      })
    ).toEqual({
      post_id: 10,
      usr: {
        usr_id: 1,
        usr_name: 'Joao',
        usr_mail: 'joao@example.com',
      },
    });
  });

  it('maps arrays of nested objects', () => {
    const feedMapper: MapperObject = {
      users: {
        externalName: 'items',
        type: userMapper,
        isArray: true,
      },
    };

    expect(
      toInternal(feedMapper, {
        items: [
          {
            usr_id: 1,
            usr_name: 'Joao',
            usr_mail: 'joao@example.com',
          },
          {
            usr_id: 2,
            usr_name: 'Ana',
            usr_mail: 'ana@example.com',
          },
        ],
      })
    ).toEqual({
      users: [
        {
          id: 1,
          name: 'Joao',
          email: 'joao@example.com',
        },
        {
          id: 2,
          name: 'Ana',
          email: 'ana@example.com',
        },
      ],
    });
  });

  it('maps top-level arrays', () => {
    expect(
      toExternal(userMapper, [
        {
          id: 1,
          name: 'Joao',
        },
        {
          id: 2,
          name: 'Ana',
        },
      ])
    ).toEqual([
      {
        usr_id: 1,
        usr_name: 'Joao',
      },
      {
        usr_id: 2,
        usr_name: 'Ana',
      },
    ]);
  });

  it('returns non-object values unchanged', () => {
    expect(toExternal(userMapper, null)).toBeNull();
    expect(toExternal(userMapper, 'value')).toBe('value');
    expect(toInternal(userMapper, 1)).toBe(1);
  });
});

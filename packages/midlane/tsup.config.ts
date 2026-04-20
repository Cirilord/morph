import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/config.ts', 'src/runtime.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    noExternal: [/^@midlane\//],
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    clean: false,
    noExternal: [/^@midlane\//, 'cac'],
  },
]);

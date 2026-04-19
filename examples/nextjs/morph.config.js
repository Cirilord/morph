import { defineConfig } from '@morph/config';

export default defineConfig({
  datasource: {
    url: 'https://jsonplaceholder.typicode.com',
  },
  schema: 'morph/schema.morph',
});

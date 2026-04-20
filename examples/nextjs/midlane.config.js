import { defineConfig } from 'midlane/config';

export default defineConfig({
  datasource: {
    url: 'https://jsonplaceholder.typicode.com',
  },
  schema: 'midlane/schema.midlane',
});

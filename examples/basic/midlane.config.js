import { defineConfig } from '@midlane/config';

export default defineConfig({
  datasource: {
    url: process.env.API_URL ?? 'https://legacy-api.example.com',
  },
  schema: 'midlane/schema.midlane',
});

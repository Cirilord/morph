export type MidlaneConfig = {
  datasource?: {
    url?: string | undefined;
  };
  schema?: string | undefined;
};

export function defineConfig(config: MidlaneConfig): MidlaneConfig {
  return config;
}

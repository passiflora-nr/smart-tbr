declare module "vitest" {
  export interface ProvidedContext {
    astroBaseUrl: string;
    supabaseUrl: string;
    supabaseKey: string;
    supabaseDbUrl: string;
  }
}

export {};

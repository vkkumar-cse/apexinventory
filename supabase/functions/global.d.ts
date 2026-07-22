// Global definitions for Deno Edge Functions to satisfy IDE typescript checking
declare namespace Deno {
  export interface ServeOptions {
    port?: number;
    hostname?: string;
    onListen?: (params: { port: number; hostname: string }) => void;
  }
  export function serve(
    handler: (request: Request, info: any) => Response | Promise<Response>
  ): void;
  export function serve(
    options: ServeOptions,
    handler: (request: Request, info: any) => Response | Promise<Response>
  ): void;

  export const env: {
    get(key: string): string | undefined;
  };
}

declare module "https://*" {
  export const createClient: any;
}

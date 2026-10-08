// The Cloudflare Workers runtime resolves this module at deploy time.
// Keep this narrow until a generated Wrangler environment typing is introduced.
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}

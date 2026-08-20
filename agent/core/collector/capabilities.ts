/** Sanitized capability manifest sent by the Scrapling Worker. */
export type PageApiSchema = { api: string; fields: string[] };
export type PageCapability = { page: string; tabs: Array<{ name: string; apis: string[]; schemas: PageApiSchema[] }> };

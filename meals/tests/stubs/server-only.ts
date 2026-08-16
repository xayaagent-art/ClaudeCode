// The real `server-only` package throws outside a React Server Component
// environment. Under vitest we exercise these modules directly in Node, so the
// import is aliased to this no-op (see vitest.config.ts).
export {};

// Optional observability dependencies. They are dynamically imported only
// when the relevant env vars are set and may not be installed in every
// deployment, so we declare them as ambient `any` modules to keep the
// type-check green without forcing the packages into the dependency tree.
declare module '@sentry/node';
declare module '@opentelemetry/sdk-node';
declare module '@opentelemetry/auto-instrumentations-node';

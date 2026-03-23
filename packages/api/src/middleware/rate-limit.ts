export function rateLimit() {
  return async (_c: unknown, next: () => Promise<void>) => {
    await next();
  };
}

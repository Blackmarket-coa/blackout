export function authMiddleware() {
  return async (_c: unknown, next: () => Promise<void>) => {
    await next();
  };
}

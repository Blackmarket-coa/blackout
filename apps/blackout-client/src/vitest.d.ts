declare module 'vitest' {
  export const describe: (...args: any[]) => any;
  export const it: (...args: any[]) => any;
  export const expect: any;
  export const beforeEach: (...args: any[]) => any;
  export const vi: any;
}

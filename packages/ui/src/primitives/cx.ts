// Tiny className joiner shared by the web primitives. Filters out falsy
// values so callers can pass conditional classes inline.
export const cx = (
    ...parts: Array<string | false | null | undefined>
): string => parts.filter(Boolean).join(' ');

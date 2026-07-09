/** Join truthy class names (local twin of the ui package's private cx). */
export function cx(...classes: Array<string | false | null | undefined>): string {
    return classes.filter(Boolean).join(' ');
}

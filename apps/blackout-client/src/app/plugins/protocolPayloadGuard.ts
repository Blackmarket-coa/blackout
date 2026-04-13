const collectShape = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map((entry) => collectShape(entry));
    }

    if (value && typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>)
            .sort()
            .reduce<Record<string, unknown>>((shape, key) => {
                shape[key] = collectShape((value as Record<string, unknown>)[key]);
                return shape;
            }, {});
    }

    return typeof value;
};

const cloneValue = <T>(value: T): T => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value)) as T;
};

export const assertPluginDoesNotMutatePayloadShape = <TPayload>(
    payload: TPayload,
    operation: (input: TPayload) => unknown
): void => {
    const beforeSnapshot = cloneValue(payload);
    const beforeShape = collectShape(beforeSnapshot);

    operation(payload);

    const afterSnapshot = cloneValue(payload);
    const afterShape = collectShape(afterSnapshot);

    if (JSON.stringify(beforeShape) !== JSON.stringify(afterShape)) {
        throw new Error(
            '[plugins.protocol] Plugin mutated Matrix protocol payload shape. Use presentation adapters only.'
        );
    }
};

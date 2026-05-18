import { useEffect } from 'react';

/**
 * Module-level registry that lets feature components publish a modal
 * opener to a global namespace consumed by the dev/audit bridge in
 * AppShell (`window.__openModal` / `window.__closeModal`).
 *
 * Features mount and unmount through React; the registry lives outside
 * the React tree so the AppShell-side bridge can look up an opener
 * without needing to know which feature is currently mounted.
 *
 * Args are optional and untyped on purpose — each modal documents what
 * shape (if any) it accepts. Features should treat the args object as
 * advisory and fall back to audit-friendly defaults when missing.
 */

export type ModalOpener = (args?: Record<string, unknown>) => void;

type RegistryEntry = {
    open: ModalOpener;
    close?: () => void;
};

const registry = new Map<string, RegistryEntry>();

export const registerModalOpener = (
    name: string,
    open: ModalOpener,
    close?: () => void
): (() => void) => {
    if (registry.has(name) && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(
            `modalOpenerRegistry: opener for "${name}" registered twice — last writer wins.`
        );
    }
    registry.set(name, { open, close });
    return () => {
        const current = registry.get(name);
        if (current?.open === open) {
            registry.delete(name);
        }
    };
};

export const getModalOpener = (name: string): ModalOpener | undefined =>
    registry.get(name)?.open;

export const getModalCloser = (name: string): (() => void) | undefined =>
    registry.get(name)?.close;

/**
 * Hook form for components that want to publish an opener for the
 * duration of their mount. The latest opener wins; unmount cleans up.
 */
export const useRegisterModalOpener = (
    name: string,
    open: ModalOpener,
    close?: () => void
): void => {
    useEffect(() => registerModalOpener(name, open, close), [name, open, close]);
};

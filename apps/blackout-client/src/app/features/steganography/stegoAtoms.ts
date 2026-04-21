import { atomWithStorage } from 'jotai/utils';
import {
    DEFAULT_STEGO_ENTERPRISE_POLICY_STATE,
    type StegoEnterprisePolicyState,
} from './stegoPolicyLifecycle';

export interface StegoPassphraseEntry {
    id: string;
    label: string;
    passphrase: string;
}

export interface StegoAdvancedOptions {
    multiCarrierRouting: boolean;
    expiryRemoteBurn: boolean;
    policyAudit: boolean;
}

export interface StegoSettingsState {
    enabled: boolean;
    savedPassphrases: StegoPassphraseEntry[];
    advancedEntitled: boolean;
    advancedOptions: StegoAdvancedOptions;
}

export const stegoSettingsAtom = atomWithStorage<StegoSettingsState>(
    'blackout.settings.steganography.v1',
    {
        enabled: true,
        savedPassphrases: [],
        advancedEntitled: false,
        advancedOptions: {
            multiCarrierRouting: false,
            expiryRemoteBurn: false,
            policyAudit: false,
        },
    }
);

export const stegoEnterprisePolicyAtom = atomWithStorage<StegoEnterprisePolicyState>(
    'blackout.settings.steganography.enterprise-policy.v1',
    DEFAULT_STEGO_ENTERPRISE_POLICY_STATE
);

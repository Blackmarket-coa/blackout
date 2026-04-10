import { atomWithStorage } from 'jotai/utils';

export interface StegoPassphraseEntry {
    id: string;
    label: string;
    passphrase: string;
}

export interface StegoSettingsState {
    enabled: boolean;
    savedPassphrases: StegoPassphraseEntry[];
}

export const stegoSettingsAtom = atomWithStorage<StegoSettingsState>(
    'blackout.settings.steganography.v1',
    {
        enabled: true,
        savedPassphrases: [],
    },
);

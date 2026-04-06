import type { ThemeOption } from './settingsAtoms';

export const themePreviews: Array<{
    value: ThemeOption;
    label: string;
    swatches: [string, string, string];
}> = [
    { value: 'dark_canopy', label: 'Dark canopy', swatches: ['#0A0A0A', '#163520', '#9FE2BF'] },
    { value: 'light_grove', label: 'Light grove', swatches: ['#FAFAFA', '#E6F4EA', '#2B5D34'] },
    { value: 'amoled_night', label: 'AMOLED night', swatches: ['#000000', '#111111', '#9FE2BF'] },
    {
        value: 'storybook_meadow',
        label: 'Storybook meadow',
        swatches: ['#FFFDF7', '#EFE8D8', '#5A8D76'],
    },
    {
        value: 'adventure_spectrum',
        label: 'Adventure spectrum',
        swatches: ['#161B2C', '#1D2440', '#FFCC59'],
    },
];

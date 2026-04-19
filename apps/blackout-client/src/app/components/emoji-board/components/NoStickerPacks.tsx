import React from 'react';
import { Box, toRem, config, Icons, Icon, Text } from 'folds';

type NoStickerPacksProps = {
    mode?: 'sticker' | 'gif';
};

export function NoStickerPacks({ mode = 'sticker' }: NoStickerPacksProps) {
    const isGif = mode === 'gif';
    return (
        <Box
            style={{ padding: `${toRem(60)} ${config.space.S500}` }}
            alignItems="Center"
            justifyContent="Center"
            direction="Column"
            gap="300"
        >
            <Icon size="600" src={isGif ? Icons.Photo : Icons.Sticker} />
            <Box direction="Inherit">
                <Text align="Center">{isGif ? 'No GIF Packs!' : 'No Sticker Packs!'}</Text>
                <Text priority="300" align="Center" size="T200">
                    {isGif
                        ? 'Add GIF stickers from user, room or space settings.'
                        : 'Add stickers from user, room or space settings.'}
                </Text>
            </Box>
        </Box>
    );
}

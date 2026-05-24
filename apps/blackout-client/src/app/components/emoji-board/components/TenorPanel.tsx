import React, { ChangeEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import { Box, Input, Icon, Icons, Scroll, Spinner, Text, config, toRem } from 'folds';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '../../../hooks/useDebounce';
import { mobileOrTablet } from '../../../utils/user-agent';
import {
    fetchTenorFeatured,
    searchTenor,
    TenorDisabledError,
    type TenorPickerItem,
} from '../../../features/room/tenorClient';
import {
    TenorAttributionStyle,
    TenorEmptyStyle,
    TenorGridStyle,
    TenorTileImgStyle,
    TenorTileStyle,
} from './TenorPanel.css';

/**
 * Online GIF picker backed by the Tenor v2 API proxy at
 * `/v1/integrations/tenor`. Renders inside the existing EmojiBoard Gif
 * tab. When the server is not configured (TENOR_API_KEY unset), the
 * panel renders nothing so the surrounding EmojiBoard can fall back to
 * its "No GIF Packs!" empty state.
 *
 * The grid uses the small `tinygif` preview for thumbnails; the
 * full-size `gif` URL is passed to `onSelect` only when the user picks
 * an item.
 */

const PAGE_LIMIT = 24;
const SEARCH_DEBOUNCE_MS = 300;

export type TenorPanelProps = {
    onSelect: (item: TenorPickerItem, query: string) => void;
    onDisabled?: () => void;
};

type LoadState =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'loaded'; items: TenorPickerItem[]; next: string | null; query: string }
    | { kind: 'error' }
    | { kind: 'disabled' };

export function TenorPanel({ onSelect, onDisabled }: TenorPanelProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [state, setState] = useState<LoadState>({ kind: 'idle' });
    // Track the latest in-flight request so debounced fast typing doesn't
    // race ahead of slower earlier responses.
    const requestSeqRef = useRef(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    const runLoad = useCallback(
        async (nextQuery: string) => {
            const seq = ++requestSeqRef.current;
            setState({ kind: 'loading' });
            try {
                const result =
                    nextQuery.trim().length === 0
                        ? await fetchTenorFeatured({ limit: PAGE_LIMIT })
                        : await searchTenor(nextQuery, { limit: PAGE_LIMIT });
                if (seq !== requestSeqRef.current) return;
                setState({
                    kind: 'loaded',
                    items: result.items,
                    next: result.next,
                    query: nextQuery,
                });
            } catch (err) {
                if (seq !== requestSeqRef.current) return;
                if (err instanceof TenorDisabledError) {
                    setState({ kind: 'disabled' });
                    onDisabled?.();
                    return;
                }
                // eslint-disable-next-line no-console
                console.warn('tenor: load failed', err);
                setState({ kind: 'error' });
            }
        },
        [onDisabled]
    );

    // Initial featured load.
    useEffect(() => {
        runLoad('');
    }, [runLoad]);

    const debouncedSearch = useDebounce(
        useCallback(
            (value: string) => {
                runLoad(value);
            },
            [runLoad]
        ),
        { wait: SEARCH_DEBOUNCE_MS }
    );

    const handleChange: ChangeEventHandler<HTMLInputElement> = useCallback(
        (evt) => {
            const value = evt.target.value;
            setQuery(value);
            debouncedSearch(value);
        },
        [debouncedSearch]
    );

    const handleLoadMore = useCallback(async () => {
        if (state.kind !== 'loaded' || !state.next) return;
        const seq = ++requestSeqRef.current;
        try {
            const result =
                state.query.trim().length === 0
                    ? await fetchTenorFeatured({ limit: PAGE_LIMIT, pos: state.next })
                    : await searchTenor(state.query, { limit: PAGE_LIMIT, pos: state.next });
            if (seq !== requestSeqRef.current) return;
            setState((prev) =>
                prev.kind === 'loaded'
                    ? {
                          ...prev,
                          items: [...prev.items, ...result.items],
                          next: result.next,
                      }
                    : prev
            );
        } catch {
            // ignore — keep showing what we have
        }
    }, [state]);

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
            handleLoadMore();
        }
    }, [handleLoadMore]);

    // If the server says it's disabled, render nothing so the parent's
    // existing empty state (NoStickerPacks for the Gif mode) shows.
    if (state.kind === 'disabled') return null;

    return (
        <Box direction="Column" grow="Yes" style={{ height: '100%', minHeight: 0 }}>
            <Box style={{ padding: config.space.S300, paddingBottom: 0 }}>
                <Input
                    variant="SurfaceVariant"
                    size="400"
                    placeholder={t('Features.GifPicker.search_placeholder')}
                    aria-label={t('Features.GifPicker.search_placeholder')}
                    maxLength={80}
                    value={query}
                    onChange={handleChange}
                    autoFocus={!mobileOrTablet()}
                    after={<Icon src={Icons.Search} size="50" />}
                />
            </Box>
            <Box grow="Yes" style={{ position: 'relative', minHeight: 0 }}>
                <Scroll ref={scrollRef} onScroll={handleScroll} size="400" hideTrack>
                    <TenorGrid state={state} query={query} onSelect={onSelect} />
                </Scroll>
            </Box>
            <Text className={TenorAttributionStyle} size="T200">
                {t('Features.GifPicker.attribution')}
            </Text>
        </Box>
    );
}

type TenorGridProps = {
    state: LoadState;
    query: string;
    onSelect: (item: TenorPickerItem, query: string) => void;
};

function TenorGrid({ state, query, onSelect }: TenorGridProps) {
    const { t } = useTranslation();
    if (state.kind === 'loading') {
        return (
            <Box
                alignItems="Center"
                justifyContent="Center"
                style={{ padding: toRem(60) }}
                aria-live="polite"
                aria-label="Loading GIFs"
            >
                <Spinner size="400" variant="Secondary" />
            </Box>
        );
    }
    if (state.kind === 'error') {
        return (
            <Box className={TenorEmptyStyle} direction="Column" gap="200">
                <Icon size="600" src={Icons.Warning} />
                <Text size="T200">{t('Features.GifPicker.load_error')}</Text>
            </Box>
        );
    }
    if (state.kind === 'loaded' && state.items.length === 0) {
        return (
            <Box className={TenorEmptyStyle} direction="Column" gap="200">
                <Icon size="600" src={Icons.Photo} />
                <Text size="T200">
                    {t('Features.GifPicker.no_results', { query: state.query })}
                </Text>
            </Box>
        );
    }
    if (state.kind === 'loaded') {
        return (
            <div className={TenorGridStyle} role="grid" aria-label="GIF results">
                {state.items.map((item) => (
                    <TenorTile
                        key={item.id}
                        item={item}
                        onSelect={() => onSelect(item, query)}
                    />
                ))}
            </div>
        );
    }
    return null;
}

type TenorTileProps = {
    item: TenorPickerItem;
    onSelect: () => void;
};

function TenorTile({ item, onSelect }: TenorTileProps) {
    return (
        <button
            type="button"
            className={TenorTileStyle}
            onClick={onSelect}
            aria-label={item.description}
            title={item.description}
        >
            <img
                src={item.preview.url}
                alt=""
                loading="lazy"
                className={TenorTileImgStyle}
                width={item.preview.width}
                height={item.preview.height}
            />
        </button>
    );
}

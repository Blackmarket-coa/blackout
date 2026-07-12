import React, { ChangeEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import { Box, Input, Icon, Icons, Scroll, Spinner, Text, config, toRem } from 'folds';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '../../../hooks/useDebounce';
import { mobileOrTablet } from '../../../utils/user-agent';
import {
    fetchFeaturedGifs,
    searchGifs,
    GifDisabledError,
    GIF_PROVIDER_LABELS,
    type GifPickerItem,
    type GifProvider,
} from '../../../features/room/gifClient';
import { readGifRecents } from '../../../features/room/gifRecents';
import {
    TenorAttributionStyle,
    TenorEmptyStyle,
    TenorGridStyle,
    TenorTileImgStyle,
    TenorTileStyle,
} from './TenorPanel.css';

/**
 * Online GIF picker backed by the provider-agnostic proxies at
 * `/v1/integrations/{giphy,tenor}` (Giphy preferred, Tenor fallback —
 * see `gifClient.ts`). Renders inside the existing EmojiBoard Gif tab.
 * When no provider is configured server-side (both API keys unset), the
 * panel renders nothing so the surrounding EmojiBoard can fall back to
 * its "No GIF Packs!" empty state.
 *
 * The grid uses the small preview rendition for thumbnails; the
 * full-size `gif` URL is passed to `onSelect` only when the user picks
 * an item.
 */

const PAGE_LIMIT = 24;
const SEARCH_DEBOUNCE_MS = 300;

export type TenorPanelProps = {
    onSelect: (item: GifPickerItem, query: string) => void;
    onDisabled?: () => void;
};

type LoadState =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'loaded'; items: GifPickerItem[]; next: string | null; query: string }
    | { kind: 'error' }
    | { kind: 'disabled' };

export function TenorPanel({ onSelect, onDisabled }: TenorPanelProps) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [state, setState] = useState<LoadState>({ kind: 'idle' });
    const [provider, setProvider] = useState<GifProvider>('giphy');
    // Read once per panel open — the panel unmounts on select, so the
    // next open picks up the newly recorded recent.
    const [recents] = useState<GifPickerItem[]>(() => readGifRecents());
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
                        ? await fetchFeaturedGifs({ limit: PAGE_LIMIT })
                        : await searchGifs(nextQuery, { limit: PAGE_LIMIT });
                if (seq !== requestSeqRef.current) return;
                setProvider(result.provider);
                setState({
                    kind: 'loaded',
                    items: result.items,
                    next: result.next,
                    query: nextQuery,
                });
            } catch (err) {
                if (seq !== requestSeqRef.current) return;
                if (err instanceof GifDisabledError) {
                    setState({ kind: 'disabled' });
                    onDisabled?.();
                    return;
                }
                // eslint-disable-next-line no-console
                console.warn('gif picker: load failed', err);
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
                    ? await fetchFeaturedGifs({ limit: PAGE_LIMIT, pos: state.next })
                    : await searchGifs(state.query, { limit: PAGE_LIMIT, pos: state.next });
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
                    placeholder={t('Features.GifPicker.search_placeholder', {
                        provider: GIF_PROVIDER_LABELS[provider],
                    })}
                    aria-label={t('Features.GifPicker.search_placeholder', {
                        provider: GIF_PROVIDER_LABELS[provider],
                    })}
                    maxLength={80}
                    value={query}
                    onChange={handleChange}
                    autoFocus={!mobileOrTablet()}
                    after={<Icon src={Icons.Search} size="50" />}
                />
            </Box>
            <Box grow="Yes" style={{ position: 'relative', minHeight: 0 }}>
                <Scroll ref={scrollRef} onScroll={handleScroll} size="400" hideTrack>
                    {recents.length > 0 && query.trim().length === 0 && (
                        <Box direction="Column" gap="100">
                            <Text
                                size="L400"
                                style={{
                                    padding: config.space.S300,
                                    paddingBottom: 0,
                                }}
                            >
                                {t('Features.GifPicker.recents')}
                            </Text>
                            <div
                                className={TenorGridStyle}
                                role="grid"
                                aria-label={t('Features.GifPicker.recents')}
                            >
                                {recents.map((item) => (
                                    <TenorTile
                                        key={`recent-${item.provider}-${item.id}`}
                                        item={item}
                                        onSelect={() => onSelect(item, '')}
                                    />
                                ))}
                            </div>
                        </Box>
                    )}
                    <TenorGrid state={state} query={query} onSelect={onSelect} />
                </Scroll>
            </Box>
            <Text className={TenorAttributionStyle} size="T200">
                {t('Features.GifPicker.attribution', { provider: GIF_PROVIDER_LABELS[provider] })}
            </Text>
        </Box>
    );
}

type TenorGridProps = {
    state: LoadState;
    query: string;
    onSelect: (item: GifPickerItem, query: string) => void;
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
    item: GifPickerItem;
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

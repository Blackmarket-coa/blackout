import { ChangeEventHandler } from 'react';
import { ComponentProps } from 'react';
import { Context } from 'react';
import { default as default_2 } from 'react';
import { ElementType } from 'react';
import { EventEmitter } from 'events';
import { getNormalizedLanguageKeys } from 'matrix-web-i18n';
import { HTMLAttributes } from 'react';
import { HTMLProps } from 'react';
import { I18nApi as I18nApi_2 } from '@element-hq/element-web-module-api';
import { JSX } from 'react';
import { JSXElementConstructor } from 'react';
import { KEY_SEPARATOR } from 'matrix-web-i18n';
import { KeyboardEventHandler } from 'react';
import { ListRange } from 'react-virtuoso';
import { MouseEventHandler } from 'react';
import { normalizeLanguageKey } from 'matrix-web-i18n';
import { PropsWithChildren } from 'react';
import { ReactElement } from 'react';
import { ReactNode } from 'react';
import { RefObject } from 'react';
import { Translations } from '@element-hq/element-web-module-api';
import { Variables } from '@element-hq/element-web-module-api';
import { VirtuosoMockContext } from 'react-virtuoso';
import { VirtuosoProps } from 'react-virtuoso';

/**
 * AudioPlayer component displays an audio player with play/pause controls, seek bar, and media information.
 * The component expects a view model that provides the current state of the audio playback,
 *
 * @example
 * ```tsx
 * <AudioPlayerView vm={audioPlayerViewModel} />
 * ```
 */
export declare function AudioPlayerView({ vm }: Readonly<AudioPlayerViewProps>): JSX.Element;

declare interface AudioPlayerViewActions {
    /**
     * Handles key down events for the audio player.
     */
    onKeyDown: KeyboardEventHandler<HTMLDivElement>;
    /**
     * Toggles the play/pause state of the audio player.
     */
    togglePlay: MouseEventHandler<HTMLButtonElement>;
    /**
     * Handles changes to the seek bar.
     */
    onSeekbarChange: ChangeEventHandler<HTMLInputElement>;
}

/**
 * The view model for the audio player.
 */
export declare type AudioPlayerViewModel = ViewModel<AudioPlayerViewSnapshot> & AudioPlayerViewActions;

declare interface AudioPlayerViewProps {
    /**
     * The view model for the audio player.
     */
    vm: AudioPlayerViewModel;
}

export declare interface AudioPlayerViewSnapshot {
    /**
     * The playback state of the audio player.
     */
    playbackState: PlaybackState;
    /**
     * Name of the media being played.
     * @default Fallback to "timeline|m.audio|unnamed_audio" string if not provided.
     */
    mediaName?: string;
    /**
     * Size of the audio file in bytes.
     * Hided if not provided.
     */
    sizeBytes?: number;
    /**
     * The duration of the audio clip in seconds.
     */
    durationSeconds: number;
    /**
     * The percentage of the audio that has been played.
     * Ranges from 0 to 100.
     */
    percentComplete: number;
    /**
     * The number of seconds that have been played.
     */
    playedSeconds: number;
    /**
     * Indicates if there was an error downloading the audio.
     */
    error: boolean;
}

/**
 * A component to display an avatar with a title next to it in a grey box.
 *
 * @example
 * ```tsx
 * <AvatarWithDetails title="Room Name" details="10 participants" className="custom-class" />
 * ```
 */
export declare function AvatarWithDetails<C extends default_2.ElementType = "div">({ as, className, details, avatar, title, ...props }: PropsWithChildren<AvatarWithDetailsProps<C>>): JSX.Element;

declare type AvatarWithDetailsProps<C extends ElementType> = {
    /**
     * The HTML tag.
     * @default "div"
     */
    as?: C;
    /**
     * The CSS class name.
     */
    className?: string;
    /**
     * The title/label next to the avatar. Usually the user or room name.
     */
    title: string;
    /**
     * A label with details to display under the avatar title.
     * Commonly used to display the number of participants in a room.
     */
    details: default_2.ReactNode;
    /** The avatar to display. */
    avatar: default_2.ReactNode;
} & ComponentProps<C>;

/**
 * A banner component used for displaying user-facing information above the message composer.
 *
 * @example
 * ```tsx
 *   <Banner  onClose={onCloseHandler} />
 * ```
 */
export declare function Banner({ type, children, avatar, className, actions, onClose, ...props }: PropsWithChildren<BannerProps & HTMLAttributes<HTMLDivElement>>): ReactElement;

declare interface BannerProps {
    /**
     * The type of the status banner.
     */
    type?: "success" | "info" | "critical";
    /**
     * The banner avatar.
     */
    avatar?: default_2.ReactNode;
    /**
     * Actions presented to the user in the right-hand side of the banner alongside the dismiss button.
     */
    actions?: ReactNode;
    /**
     * Called when the user presses the "dismiss" button.
     */
    onClose?: MouseEventHandler<HTMLButtonElement>;
}

export declare abstract class BaseViewModel<T, P> implements ViewModel<T> {
    protected subs: ViewModelSubscriptions;
    protected snapshot: Snapshot<T>;
    protected props: P;
    protected disposables: Disposables;
    protected constructor(props: P, initialSnapshot: T);
    subscribe: (listener: () => void) => (() => void);
    /**
     * Returns the current snapshot of the view model.
     */
    getSnapshot: () => T;
    /**
     * Relinquish any resources held by this view-model.
     */
    dispose(): void;
    /**
     * Whether this view-model has been disposed.
     */
    get isDisposed(): boolean;
}

/**
 * A flex child helper
 */
export declare function Box({ as, flex, shrink, grow, className, children, ...props }: default_2.PropsWithChildren<BoxProps>): JSX.Element;

declare type BoxProps = {
    /**
     * The type of the HTML element
     * @default div
     */
    as?: string;
    /**
     * The CSS class name.
     */
    className?: string;
    /**
     * the on click event callback
     */
    onClick?: (e: default_2.MouseEvent) => void;
    /**
     * The flex space to use
     * @default null
     */
    flex?: string | null;
    /**
     * The flex shrink factor
     * @default null
     */
    shrink?: string | null;
    /**
     * The flex grow factor
     * @default null
     */
    grow?: string | null;
};

export declare function clamp(i: number, min: number, max: number): number;

/**
 * Clock which represents time periods rather than absolute time.
 * Simply converts seconds using formatSeconds().
 * Note that in this case hours will not be displayed, making it possible to see "82:29".
 *
 * @example
 * ```tsx
 * <Clock seconds={125} />
 * ```
 */
export declare function Clock({ seconds, className, ...rest }: Props): JSX.Element;

/**
 * A placeholder element for messages that could not be decrypted
 *
 * @example
 * ```tsx
 * <DecryptionFailureBodyView vm={DecryptionFailureBodyViewModel} />
 * ```
 */
export declare function DecryptionFailureBodyView({ vm, ref }: Readonly<DecryptionFailureBodyViewProps>): JSX.Element;

/**
 * The view model for the component.
 */
export declare type DecryptionFailureBodyViewModel = ViewModel<DecryptionFailureBodyViewSnapshot>;

declare interface DecryptionFailureBodyViewProps {
    /**
     * The view model for the component.
     */
    vm: DecryptionFailureBodyViewModel;
    /**
     * React ref to attach to any React components returned
     */
    ref?: default_2.RefObject<any>;
}

export declare interface DecryptionFailureBodyViewSnapshot {
    /**
     * The decryption failure reason of the event.
     */
    decryptionFailureReason: DecryptionFailureReason;
    /**
     * The local device verification state.
     */
    isLocalDeviceVerified?: boolean;
    /**
     * Extra CSS classes to apply to the component
     */
    extraClassNames?: string[];
}

/**
 * A reason code for a failure to decrypt an event.
 */
export declare enum DecryptionFailureReason {
    /** A special case of {@link MEGOLM_KEY_WITHHELD}: the sender has told us it is withholding the key, because the current device is unverified. */
    MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE = "MEGOLM_KEY_WITHHELD_FOR_UNVERIFIED_DEVICE",
    /**
     * Message was sent before the current device was created; there is no key backup on the server, so this
     * decryption failure is expected.
     */
    HISTORICAL_MESSAGE_NO_KEY_BACKUP = "HISTORICAL_MESSAGE_NO_KEY_BACKUP",
    /**
     * Message was sent before the current device was created; there was a key backup on the server, but we don't
     * seem to have access to the backup. (Probably we don't have the right key.)
     */
    HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED = "HISTORICAL_MESSAGE_BACKUP_UNCONFIGURED",
    /**
     * Message was sent when the user was not a member of the room.
     */
    HISTORICAL_MESSAGE_USER_NOT_JOINED = "HISTORICAL_MESSAGE_USER_NOT_JOINED",
    /**
     * The sender's identity is not verified, but was previously verified.
     */
    SENDER_IDENTITY_PREVIOUSLY_VERIFIED = "SENDER_IDENTITY_PREVIOUSLY_VERIFIED",
    /**
     * The sender device is not cross-signed. This will only be used if the
     * device isolation mode is set to `OnlySignedDevicesIsolationMode`.
     */
    UNSIGNED_SENDER_DEVICE = "UNSIGNED_SENDER_DEVICE",
    /**
     * Default message for decryption failures.
     */
    UNABLE_TO_DECRYPT = "UNABLE_TO_DECRYPT"
}

/**
 * Returns the default number if the given value, i, is not a number. Otherwise
 * returns the given value.
 * @param {*} i The value to check.
 * @param {number} def The default value.
 * @returns {number} Either the value or the default value, whichever is a number.
 */
export declare function defaultNumber(i: unknown, def: number): number;

/**
 * Something that needs to be eventually disposed. This can be:
 * - A function that does the disposing
 * - An object containing a dispose method which does the disposing
 */
export declare type DisposableItem = {
    dispose: () => void;
} | (() => void);

/**
 * This class provides a way for the view-model to track any resource
 * that it needs to eventually relinquish.
 */
export declare class Disposables {
    private readonly disposables;
    private _isDisposed;
    /**
     * Relinquish all tracked disposable values
     */
    dispose(): void;
    /**
     * Track a value that needs to be eventually relinquished
     */
    track<T extends DisposableItem>(disposable: T): T;
    /**
     * Add an event listener that will be removed on dispose
     */
    trackListener(emitter: EventEmitter, event: string | symbol, callback: (...args: unknown[]) => void): void;
    private throwIfDisposed;
    /**
     * Whether this disposable has been disposed
     */
    get isDisposed(): boolean;
}

/**
 * EventTileBubble renders a compact event tile with an icon, title, and optional subtitle/content.
 *
 * @example
 * ```tsx
 * <EventTileBubble icon={<Icon />} title="Room created" />
 * ```
 */
export declare function EventTileBubble({ icon, title, subtitle, className, children, ref, }: EventTileBubbleProps): JSX.Element;

export declare interface EventTileBubbleProps {
    /**
     * Icon rendered at the start of the bubble.
     */
    icon: JSX.Element;
    /**
     * Main title text for the bubble.
     */
    title: string;
    /**
     * Optional subtitle rendered beneath the title.
     */
    subtitle?: ReactNode;
    /**
     * Optional extra class name for the container.
     */
    className?: string;
    /**
     * Optional children rendered between subtitle and timestamp.
     */
    children?: JSX.Element;
    /**
     * Forwarded ref for the container element.
     */
    ref?: default_2.RefObject<HTMLDivElement>;
}

/**
 * Standard filter identifiers that can be used across implementations.
 * These are stable keys - the view layer maps them to translated labels.
 */
export declare type FilterId = "unread" | "people" | "rooms" | "favourite" | "mentions" | "invites" | "low_priority";

/**
 * Filter key type - opaque string type for filter identifiers
 */
export declare type FilterKey = string;

/**
 * A flexbox container helper
 */
export declare function Flex<T extends keyof JSX.IntrinsicElements | JSXElementConstructor<any> = "div">({ as, display, direction, align, justify, gap, wrap, className, children, ...props }: default_2.PropsWithChildren<FlexProps<T>>): JSX.Element;

declare type FlexProps<T extends keyof JSX.IntrinsicElements | JSXElementConstructor<any>> = {
    /**
     * The type of the HTML element
     * @default div
     */
    as?: T;
    /**
     * The CSS class name.
     */
    className?: string;
    /**
     * The type of flex container
     * @default flex
     */
    display?: "flex" | "inline-flex";
    /**
     * The flow direction of the flex children
     * @default row
     */
    direction?: "row" | "column" | "row-reverse" | "column-reverse";
    /**
     * The alignment of the flex children
     * @default start
     */
    align?: "start" | "center" | "end" | "baseline" | "stretch" | "normal";
    /**
     * The justification of the flex children
     * @default start
     */
    justify?: "start" | "center" | "end" | "space-between";
    /**
     * The wrapping of the flex children
     * @default nowrap
     */
    wrap?: "wrap" | "nowrap" | "wrap-reverse";
    /**
     * The spacing between the flex children, expressed with the CSS unit
     * @default 0
     */
    gap?: string;
    /**
     * the on click event callback
     */
    onClick?: (e: default_2.MouseEvent) => void;
} & ComponentProps<T>;

/**
 * format a size in bytes into a human readable form
 * e.g: 1024 -> 1.00 KB
 */
export declare function formatBytes(bytes: number, decimals?: number): string;

/**
 * Formats a number of seconds into a human-readable string.
 * @param inSeconds
 */
export declare function formatSeconds(inSeconds: number): string;

export declare function getLangsJson(): Promise<Languages>;

export declare function getLocale(): string;

export { getNormalizedLanguageKeys }

/** A badge showing the history visibility of a room. */
export declare function HistoryVisibilityBadge({ historyVisibility }: Props_4): JSX.Element | null;

/**
 * Converts a timestamp into human-readable, translated, text.
 * @param {number} timeMillis The time in millis to compare against.
 * @returns {string} The humanized time.
 */
export declare function humanizeTime(timeMillis: number, i18nApi?: I18nApi_2): string;

export declare class I18nApi implements I18nApi_2 {
    /**
     * Read the current language of the user in IETF Language Tag format
     */
    get language(): string;
    /**
     * Register translations for the module, may override app's existing translations
     */
    register(translations: Partial<Translations>): void;
    /**
     * Perform a translation, with optional variables
     * @param key - The key to translate
     * @param variables - Optional variables to interpolate into the translation
     */
    translate(key: TranslationKey, variables?: Variables): string;
    humanizeTime(timeMillis: number): string;
}

export declare const I18nContext: Context<I18nApi_2 | null>;

export declare interface IVariables {
    count?: number;
    [key: string]: SubstitutionValue;
}

export declare interface IVirtualizedListProps<Item, Context> extends Omit<VirtuosoProps<Item, VirtualizedListContext<Context>>, "data" | "itemContent" | "context"> {
    /**
     * The array of items to display in the virtualized list.
     * Each item will be passed to getItemComponent for rendering.
     */
    items: Item[];
    /**
     * Function that renders each list item as a JSX element.
     * @param index - The index of the item in the list
     * @param item - The data item to render
     * @param context - The context object containing the focused key and any additional data
     * @param onFocus - A callback that is required to be called when the item component receives focus
     * @returns JSX element representing the rendered item
     */
    getItemComponent: (index: number, item: Item, context: VirtualizedListContext<Context>, onFocus: (item: Item, e: default_2.FocusEvent) => void) => JSX.Element;
    /**
     * Optional additional context data to pass to each rendered item.
     * This will be available in the VirtualizedListContext passed to getItemComponent.
     */
    context?: Context;
    /**
     * Function to determine if an item can receive focus during keyboard navigation.
     * @param item - The item to check for focusability
     * @returns true if the item can be focused, false otherwise
     */
    isItemFocusable: (item: Item) => boolean;
    /**
     * Function to get the key to use for focusing an item.
     * @param item - The item to get the key for
     * @return The key to use for focusing the item
     */
    getItemKey: (item: Item) => string;
    /**
     * Callback function to handle key down events on the list container.
     * List handles keyboard navigation for focus(up, down, home, end, pageUp, pageDown)
     * and stops propagation otherwise the event bubbles and this callback is called for the use of the parent.
     * @param e - The keyboard event
     * @returns
     */
    onKeyDown?: (e: default_2.KeyboardEvent<HTMLDivElement>) => void;
    /**
     * Optional total count of items (for virtualization with partial data loading).
     * If provided, this will be used instead of items.length for the total count.
     */
    totalCount?: number;
    /**
     * Optional callback when the visible range of items changes.
     * Useful for loading data on-demand as the user scrolls.
     * @param range - The new visible range with startIndex and endIndex
     */
    rangeChanged?: (range: ListRange) => void;
}

export { KEY_SEPARATOR }

declare type Languages = {
    [lang: string]: string;
};

/**
 * Utility function to look up a string by its translation key without resolving variables & tags
 * @param key - the translation key to return the value for
 */
export declare function lookupString(key: TranslationKey): string;

/**
 * A component to display the body of a media message.
 *
 * @example
 * ```tsx
 * <MediaBody as="p" className="custom-class">Media body content</MediaBody>
 * ```
 */
export declare function MediaBody<C extends default_2.ElementType = "div">({ as, className, children, ...props }: PropsWithChildren<MediaBodyProps<C>>): JSX.Element;

declare type MediaBodyProps<C extends ElementType> = {
    /**
     * The HTML tag.
     * @default "div"
     */
    as?: C;
    /**
     * The CSS class name.
     */
    className?: string;
} & ComponentProps<C>;

/**
 * A mock view model that returns a static snapshot passed in the constructor, with no updates.
 */
export declare class MockViewModel<T> implements ViewModel<T> {
    private snapshot;
    constructor(snapshot: T);
    getSnapshot: () => T;
    subscribe(listener: () => void): () => void;
}

export declare function MoreOptionContent({ vm }: MoreOptionContentProps): JSX.Element;

declare interface MoreOptionContentProps {
    vm: RoomItemViewModel_3;
}

export { normalizeLanguageKey }

/**
 * Renders notification badges and indicators for rooms/items
 */
export declare const NotificationDecoration: default_2.FC<NotificationDecorationProps>;

/**
 * Data representing the notification state for a room or item.
 * Used in snapshots and passed to the NotificationDecoration component.
 */
export declare interface NotificationDecorationData {
    /** Whether there is any notification or activity to display */
    hasAnyNotificationOrActivity: boolean;
    /** Whether there's an unsent message */
    isUnsentMessage: boolean;
    /** Whether the user is invited to the room */
    invited: boolean;
    /** Whether the notification is a mention */
    isMention: boolean;
    /** Whether there's activity (not a full notification) */
    isActivityNotification: boolean;
    /** Whether there's a notification (not just activity) */
    isNotification: boolean;
    /** Whether there are unread messages with a count */
    hasUnreadCount: boolean;
    /** Notification count */
    count: number;
    /** Whether notifications are muted */
    muted: boolean;
    /** Optional call type indicator */
    callType?: "video" | "voice";
}

/**
 * Props for the NotificationDecoration component.
 */
export declare interface NotificationDecorationProps extends NotificationDecorationData {
}

export declare function percentageOf(val: number, min: number, max: number): number;

export declare function percentageWithin(pct: number, min: number, max: number): number;

/**
 * A pill component that can display a label and an optional close button.
 * The badge can also contain child elements, such as icons or avatars.
 *
 * @example
 * ```tsx
 * <Pill label="New" onClick={() => console.log("Closed")}>
 *     <SomeIcon />
 * </Pill>
 * ```
 */
export declare function Pill({ className, children, label, onClick, ...props }: PropsWithChildren<PillProps>): JSX.Element;

/**
 * An input component that can contain multiple child elements and an input field.
 *
 * @example
 * ```tsx
 * <PillInput>
 *   <div>Child 1</div>
 *   <div>Child 2</div>
 * </PillInput>
 * ```
 */
export declare function PillInput({ className, children, onRemoveChildren, inputProps, ...props }: PropsWithChildren<PillInputProps>): JSX.Element;

declare interface PillInputProps extends HTMLAttributes<HTMLDivElement> {
    /**
     * Callback for when the user presses backspace on an empty input.
     */
    onRemoveChildren?: KeyboardEventHandler;
    /**
     * Props to pass to the input element.
     */
    inputProps?: HTMLProps<HTMLInputElement> & {
        "data-testid"?: string;
    };
}

declare interface PillProps extends Omit<HTMLAttributes<HTMLDivElement>, "onClick"> {
    /**
     * The text label to display inside the pill.
     */
    label: string;
    /**
     * Optional click handler for a close button.
     * If provided, a close button will be rendered.
     */
    onClick?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * Represents the possible states of playback.
 * - "preparing": The audio is being prepared for playback (e.g., loading or buffering).
 * - "decoding": The audio is being decoded and is not ready for playback.
 * - "stopped": The playback has been stopped, with no progress on the timeline.
 * - "paused": The playback is paused, with some progress on the timeline.
 * - "playing": The playback is actively progressing through the timeline.
 */
declare type PlaybackState = "decoding" | "stopped" | "paused" | "playing" | "preparing";

/**
 * A button component that toggles between play and pause states for audio playback.
 *
 * @example
 * ```tsx
 * <PlayPauseButton playing={true} togglePlay={() => {}} />
 * ```
 */
export declare function PlayPauseButton({ disabled, playing, togglePlay, ...rest }: Readonly<PlayPauseButtonProps>): JSX.Element;

declare interface PlayPauseButtonProps extends HTMLAttributes<HTMLButtonElement> {
    /**
     * Whether the button is disabled.
     * @default false
     */
    disabled?: boolean;
    /**
     * Whether the audio is currently playing.
     * @default false
     */
    playing?: boolean;
    /**
     * Function to toggle play/pause state.
     */
    togglePlay: MouseEventHandler<HTMLButtonElement>;
}

declare interface Props extends Pick<HTMLProps<HTMLSpanElement>, "aria-live" | "role" | "className"> {
    /**
     * The number of seconds to display.
     */
    seconds: number;
}

declare type Props_2 = {
    /**
     * The emoji to render
     */
    emoji: [SasEmoji_2, SasEmoji_2, SasEmoji_2, SasEmoji_2, SasEmoji_2, SasEmoji_2, SasEmoji_2];
    /**
     * Optional className to apply to the container
     */
    className?: string;
};

declare interface Props_3 {
    vm: ViewModel<TextualEventViewSnapshot>;
}

declare interface Props_4 {
    /** The history visibility of the room, according to the room state. */
    historyVisibility: "invited" | "joined" | "shared" | "world_readable";
}

/**
 * Type alias for the ReactionsRowButtonTooltip view model.
 */
export declare function ReactionsRowButtonTooltipView({ vm, children, }: Readonly<ReactionsRowButtonTooltipViewProps>): JSX.Element;

export declare type ReactionsRowButtonTooltipViewModel = ViewModel<ReactionsRowButtonTooltipViewSnapshot>;

declare interface ReactionsRowButtonTooltipViewProps {
    /**
     * The view model for the reactions row button tooltip.
     */
    vm: ReactionsRowButtonTooltipViewModel;
    /**
     * The children to wrap with the tooltip.
     */
    children?: PropsWithChildren["children"];
}

/**
 * Snapshot interface for the ReactionsRowButtonTooltip view.
 */
export declare interface ReactionsRowButtonTooltipViewSnapshot {
    /**
     * The formatted list of sender names who reacted.
     */
    formattedSenders?: string;
    /**
     * The caption to display (e.g., the shortcode of the reaction).
     */
    caption?: string;
    /**
     * Whether the tooltip should be forced open.
     */
    tooltipOpen?: boolean;
}

export declare function registerTranslations(locale: string, data: object): void;

/**
 * Replace parts of a text using regular expressions
 * @param text - The text on which to perform substitutions
 * @param mapping - A mapping from regular expressions in string form to replacement string or a
 * function which will receive as the argument the capture groups defined in the regexp. E.g.
 * { 'Hello (.?) World': (sub) => sub.toUpperCase() }
 *
 * @return a React <span> component if any non-strings were used in substitutions, otherwise a string
 */
export declare function replaceByRegexes(text: string, mapping: IVariables): string;

export declare function replaceByRegexes(text: string, mapping: Tags): default_2.ReactNode;

/**
 * A rich item to display in a list, with an avatar, title, description and optional timestamp.
 * If selected, the avatar is replaced with a checkmark.
 * A separator is added between items in a list.
 *
 * @example
 * ```tsx
 *   <RichItem
 *     avatar={<AvatarComponent />}
 *     title="Rich Item Title"
 *     description="This is a description of the rich item."
 *     timestamp={Date.now() - 5 * 60 * 1000} // 5 minutes ago
 *     selected={true}
 *     onClick={() => console.log("Item clicked")}
 *   />
 * ```
 */
export declare const RichItem: default_2.NamedExoticComponent<RichItemProps>;

declare interface RichItemProps extends HTMLAttributes<HTMLLIElement> {
    /**
     * Avatar to display at the start of the item
     */
    avatar: default_2.ReactNode;
    /**
     * Title to display at the top of the item
     */
    title: string;
    /**
     * Description to display below the title
     */
    description: string;
    /**
     * Timestamp to display at the end of the item
     * The value is humanized (e.g. "5 minutes ago")
     */
    timestamp?: number;
    /**
     * Whether the item is selected
     * This will replace the avatar with a checkmark
     * @default false
     */
    selected?: boolean;
}

/**
 * A list component with a title and children.
 *
 * @example
 * ```tsx
 * <RichList title="My List">
 *   <RichItem ... />
 *   <RichItem ... />
 * </RichList>
 * ```
 */
export declare function RichList({ children, title, className, titleAttributes, isEmpty, ...props }: PropsWithChildren<RichListProps>): JSX.Element;

declare interface RichListProps extends HTMLProps<HTMLDivElement> {
    /**
     * Title to display at the top of the list
     */
    title: string;
    /**
     * Attributes to pass to the title element
     * This can be used to set accessibility attributes like `aria-level` or `role`
     * @example
     * ```tsx
     * <RichList title="My List" titleAttributes={{ role: "heading", "aria-level": 2 }}>
     * ```
     */
    titleAttributes?: HTMLProps<HTMLSpanElement>;
    /**
     * Indicates if the list should show an empty state.
     * The list renders its children in a span instead of an ul.
     */
    isEmpty?: boolean;
}

/**
 * Opaque type representing a Room object from the parent application
 */
export declare type Room = unknown;

/**
 * The view model type for a room list item
 */
export declare type RoomItemViewModel = ViewModel<RoomListItemSnapshot> & RoomListItemActions;

/**
 * View model type for room list item
 */
declare type RoomItemViewModel_2 = ViewModel<RoomListItemSnapshot> & RoomListItemActions;

/**
 * View model type for room list item
 */
declare type RoomItemViewModel_3 = ViewModel<RoomListItemSnapshot> & RoomListItemActions;

/**
 * Empty state component for the room list.
 * Displays appropriate message and actions based on the active filter.
 */
export declare const RoomListEmptyStateView: default_2.FC<RoomListEmptyStateViewProps>;

/**
 * Props for RoomListEmptyStateView component
 */
export declare interface RoomListEmptyStateViewProps {
    /** The view model containing all data and callbacks */
    vm: RoomListViewModel;
}

/**
 * The header view for the room list
 * The space name is displayed and a compose menu is shown if the user can create rooms
 *
 * @example
 * ```tsx
 * <RoomListHeaderView vm={roomListHeaderViewModel} />
 * ```
 */
export declare function RoomListHeaderView({ vm }: Readonly<RoomListHeaderViewProps>): JSX.Element;

export declare interface RoomListHeaderViewActions {
    /**
     * Create a chat room
     */
    createChatRoom: (e: Event) => void;
    /**
     * Create a room
     */
    createRoom: (e: Event) => void;
    /**
     * Create a video room
     */
    createVideoRoom: () => void;
    /**
     * Open the active space home
     */
    openSpaceHome: () => void;
    /**
     * Display the space invite dialog
     */
    inviteInSpace: () => void;
    /**
     * Open the space preferences
     */
    openSpacePreferences: () => void;
    /**
     * Open the space settings
     */
    openSpaceSettings: () => void;
    /**
     * Change the sort order of the room-list.
     */
    sort: (option: SortOption) => void;
    /**
     * Toggle message preview display in the room list.
     */
    toggleMessagePreview: () => void;
}

/**
 * The view model for the room list header component.
 */
export declare type RoomListHeaderViewModel = ViewModel<RoomListHeaderViewSnapshot> & RoomListHeaderViewActions;

declare interface RoomListHeaderViewProps {
    /**
     * The view model for the room list header component.
     */
    vm: RoomListHeaderViewModel;
}

export declare interface RoomListHeaderViewSnapshot {
    /**
     * The title of the room list
     */
    title: string;
    /**
     * Whether to display the compose menu
     * True if the user can create rooms
     */
    displayComposeMenu: boolean;
    /**
     * Whether to display the space menu
     * True if there is an active space
     */
    displaySpaceMenu: boolean;
    /**
     * Whether the user can create rooms
     */
    canCreateRoom: boolean;
    /**
     * Whether the user can create video rooms
     */
    canCreateVideoRoom: boolean;
    /**
     * Whether the user can invite in the active space
     */
    canInviteInSpace: boolean;
    /**
     * Whether the user can access space settings
     */
    canAccessSpaceSettings: boolean;
    /**
     * The currently active sort option.
     */
    activeSortOption: SortOption;
    /**
     * Whether message previews are enabled in the room list.
     */
    isMessagePreviewEnabled: boolean;
}

/**
 * Actions interface for room list item operations.
 * Implemented by the room item view model.
 */
export declare interface RoomListItemActions {
    /** Called when the room should be opened */
    onOpenRoom: () => void;
    /** Called when the room should be marked as read */
    onMarkAsRead: () => void;
    /** Called when the room should be marked as unread */
    onMarkAsUnread: () => void;
    /** Called when the room's favorite status should be toggled */
    onToggleFavorite: () => void;
    /** Called when the room's low priority status should be toggled */
    onToggleLowPriority: () => void;
    /** Called when inviting users to the room */
    onInvite: () => void;
    /** Called when copying the room link */
    onCopyRoomLink: () => void;
    /** Called when leaving the room */
    onLeaveRoom: () => void;
    /** Called when setting the room notification state */
    onSetRoomNotifState: (state: RoomNotifState) => void;
}

/**
 * The context menu for room list items.
 * Wraps the trigger element with a right-click context menu displaying room options.
 */
export declare const RoomListItemContextMenu: default_2.FC<PropsWithChildren<RoomListItemContextMenuProps>>;

/**
 * Props for RoomListItemContextMenu component
 */
export declare interface RoomListItemContextMenuProps {
    /** The room item view model */
    vm: RoomItemViewModel_3;
}

/**
 * The hover menu for room list items.
 * Displays more options and notification settings menus.
 */
export declare const RoomListItemHoverMenu: default_2.FC<RoomListItemHoverMenuProps>;

/**
 * Props for RoomListItemHoverMenu component
 */
export declare interface RoomListItemHoverMenuProps {
    /** Whether the more options menu should be shown */
    showMoreOptionsMenu: boolean;
    /** Whether the notification menu should be shown */
    showNotificationMenu: boolean;
    /** The room item view model */
    vm: RoomItemViewModel_3;
}

/**
 * The more options menu for room list items.
 * Displays additional room actions like mark as read/unread, favorite, invite, etc.
 */
export declare function RoomListItemMoreOptionsMenu({ vm }: RoomListItemMoreOptionsMenuProps): JSX.Element;

/**
 * Props for RoomListItemMoreOptionsMenu component
 */
export declare interface RoomListItemMoreOptionsMenuProps {
    /** The room item view model */
    vm: RoomItemViewModel_3;
}

/**
 * The notification settings menu for room list items.
 * Displays options to change notification settings.
 */
export declare function RoomListItemNotificationMenu({ vm }: RoomListItemNotificationMenuProps): JSX.Element;

/**
 * Props for RoomListItemNotificationMenu component
 */
export declare interface RoomListItemNotificationMenuProps {
    /** The room item view model */
    vm: RoomItemViewModel_2;
}

/**
 * Snapshot for a room list item.
 * Contains all the data needed to render a room in the list.
 */
export declare interface RoomListItemSnapshot {
    /** Unique identifier for the room (used for list keying) */
    id: string;
    /** The opaque Room object from the client (e.g., matrix-js-sdk Room) */
    room: Room;
    /** The name of the room */
    name: string;
    /** Whether the room name should be bolded (has unread/activity) */
    isBold: boolean;
    /** Optional message preview text */
    messagePreview?: string;
    /** Notification decoration data */
    notification: NotificationDecorationData;
    /** Whether the more options menu should be shown */
    showMoreOptionsMenu: boolean;
    /** Whether the notification menu should be shown */
    showNotificationMenu: boolean;
    /** Whether the room is a favourite room */
    isFavourite: boolean;
    /** Whether the room is a low priority room */
    isLowPriority: boolean;
    /** Can invite other users in the room */
    canInvite: boolean;
    /** Can copy the room link */
    canCopyRoomLink: boolean;
    /** Can mark the room as read */
    canMarkAsRead: boolean;
    /** Can mark the room as unread */
    canMarkAsUnread: boolean;
    /** The room's notification state */
    roomNotifState: RoomNotifState;
}

/**
 * A presentational room list item component.
 * Displays room name, avatar, message preview, and notifications.
 */
export declare const RoomListItemView: default_2.NamedExoticComponent<RoomListItemViewProps>;

/**
 * Props for RoomListItemView component
 */
export declare interface RoomListItemViewProps extends Omit<default_2.HTMLAttributes<HTMLButtonElement>, "onFocus"> {
    /** The room item view model */
    vm: RoomItemViewModel;
    /** Whether the room is selected */
    isSelected: boolean;
    /** Whether the room should be focused */
    isFocused: boolean;
    /** Callback when item receives focus */
    onFocus: (roomId: string, e: default_2.FocusEvent) => void;
    /** Index of this room in the list (for accessibility) */
    roomIndex: number;
    /** Total number of rooms in the list (for accessibility) */
    roomCount: number;
    /** Function to render the room avatar */
    renderAvatar: (room: Room) => ReactNode;
}

/**
 * Loading skeleton component for the room list.
 * Displays a repeating skeleton pattern while rooms are being fetched.
 */
export declare const RoomListLoadingSkeleton: default_2.FC;

/**
 * The primary filters component for the room list.
 * Displays a collapsible list of filters with expand/collapse functionality.
 */
export declare const RoomListPrimaryFilters: default_2.FC<RoomListPrimaryFiltersProps>;

/**
 * Props for RoomListPrimaryFilters component
 */
export declare interface RoomListPrimaryFiltersProps {
    /** Array of filter IDs to display */
    filterIds: FilterId[];
    /** Currently active filter ID (if any) */
    activeFilterId?: FilterId;
    /** Callback when a filter is toggled */
    onToggleFilter: (filterId: FilterId) => void;
}

/**
 * A search component to be displayed at the top of the room list.
 * The component provides search functionality, optional dial pad access, and optional room exploration.
 *
 * @example
 * ```tsx
 * <RoomListSearchView vm={roomListSearchViewModel} />
 * ```
 */
export declare function RoomListSearchView({ vm }: Readonly<RoomListSearchViewProps>): JSX.Element;

declare interface RoomListSearchViewActions {
    /**
     * Handles the click event on the search button.
     */
    onSearchClick: MouseEventHandler<HTMLButtonElement>;
    /**
     * Handles the click event on the dial pad button.
     */
    onDialPadClick: MouseEventHandler<HTMLButtonElement>;
    /**
     * Handles the click event on the explore button.
     */
    onExploreClick: MouseEventHandler<HTMLButtonElement>;
}

/**
 * The view model for the room list search component.
 */
export declare type RoomListSearchViewModel = ViewModel<RoomListSearchViewSnapshot> & RoomListSearchViewActions;

declare interface RoomListSearchViewProps {
    /**
     * The view model for the room list search component.
     */
    vm: RoomListSearchViewModel;
}

export declare interface RoomListSearchViewSnapshot {
    /**
     * Whether to display the explore button.
     */
    displayExploreButton: boolean;
    /**
     * Whether to display the dial pad button.
     */
    displayDialButton: boolean;
    /**
     * The keyboard shortcut text to display for the search action.
     * For example: "⌘ K" on macOS or "Ctrl K" on other platforms.
     */
    searchShortcut: string;
}

/**
 * Snapshot for the room list view
 */
export declare type RoomListSnapshot = {
    /** Whether the rooms are currently loading */
    isLoadingRooms: boolean;
    /** Whether the room list is empty */
    isRoomListEmpty: boolean;
    /** Array of filter IDs */
    filterIds: FilterId[];
    /** Currently active filter ID (if any) */
    activeFilterId?: FilterId;
    /** Room list state */
    roomListState: RoomListViewState;
    /** Array of room IDs for virtualization */
    roomIds: string[];
    /** Optional description for the empty state */
    emptyStateDescription?: string;
    /** Optional action element for the empty state */
    emptyStateAction?: ReactNode;
    /** Whether the user can create rooms */
    canCreateRoom?: boolean;
};

/**
 * Room list view component that manages filters, loading states, empty states, and the room list.
 */
export declare const RoomListView: default_2.FC<RoomListViewProps>;

/**
 * Actions interface for room list operations
 */
export declare interface RoomListViewActions {
    /** Called when a filter is toggled */
    onToggleFilter: (filterId: FilterId) => void;
    /** Called to create a new chat room */
    createChatRoom: () => void;
    /** Called to create a new room */
    createRoom: () => void;
    /** Get view model for a specific room (virtualization API) */
    getRoomItemViewModel: (roomId: string) => any;
    /** Called when the visible range changes (virtualization API) */
    updateVisibleRooms: (startIndex: number, endIndex: number) => void;
}

/**
 * The view model type for the room list view
 */
export declare type RoomListViewModel = ViewModel<RoomListSnapshot> & RoomListViewActions;

/**
 * Props for RoomListView component
 */
export declare interface RoomListViewProps {
    /** The view model containing all data and callbacks */
    vm: RoomListViewModel;
    /** Render function for room avatar */
    renderAvatar: (room: Room) => ReactNode;
    /** Optional callback for keyboard events on the room list */
    onKeyDown?: (e: default_2.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * State for the room list data (nested within RoomListSnapshot)
 */
export declare interface RoomListViewState {
    /** Optional active room index for keyboard navigation */
    activeRoomIndex?: number;
    /** Space ID for context tracking */
    spaceId?: string;
    /** Active filter keys for context tracking */
    filterKeys?: FilterKey[];
}

/**
 * Notification state for a room.
 */
export declare enum RoomNotifState {
    /** All messages (default) */
    AllMessages = "all_messages",
    /** All messages with sound */
    AllMessagesLoud = "all_messages_loud",
    /** Only mentions and keywords */
    MentionsOnly = "mentions_only",
    /** Muted */
    Mute = "mute"
}

export declare interface RoomStatusBarConsentState {
    state: "NeedsConsent";
    consentUri: string;
}

export declare interface RoomStatusBarLocalRoomError {
    state: "LocalRoomFailed";
}

export declare interface RoomStatusBarNoConnection {
    state: "ConnectionLost";
}

export declare interface RoomStatusBarNotVisible {
    state: null;
}

export declare interface RoomStatusBarResourceLimitedState {
    state: "ResourceLimited";
    resourceLimit: "monthly_active_user" | "hs_disabled" | string;
    adminContactHref?: string;
}

export declare const RoomStatusBarState: {
    /**
     * Connectivity to the homeserver has been lost. The user can not take any actions
     * until the connection is restored.
     */
    readonly ConnectionLost: "ConnectionLost";
    /**
     * The homeserver has indiciated the user needs to consent to the Terms and Conditions
     * before they can send a message.
     */
    readonly NeedsConsent: "NeedsConsent";
    /**
     * The homeserver has indiciated that messages can not be sent due to a resource limit
     * being reached. The user may use the given admin contact details.
     */
    readonly ResourceLimited: "ResourceLimited";
    /**
     * There are messages stored locally that previously failed to send that the user
     * may now retry or delete.
     */
    readonly UnsentMessages: "UnsentMessages";
    /**
     * There was an error creating a room. The user may retry creation.
     */
    readonly LocalRoomFailed: "LocalRoomFailed";
};

export declare interface RoomStatusBarUnsentMessagesState {
    state: "UnsentMessages";
    isResending: boolean;
}

/**
 * A component to alert to a failure in the context of a room.
 *
 * @example
 * ```tsx
 * <RoomStatusBarView vm={RoomStatusBarViewModel} />
 * ```
 */
export declare function RoomStatusBarView({ vm }: Readonly<RoomStatusBarViewProps>): JSX.Element | null;

export declare interface RoomStatusBarViewActions {
    /**
     * Called when the user clicks on the 'resend all' button in the 'unsent messages' bar.
     */
    onResendAllClick?: () => Promise<void>;
    /**
     * Called when the user clicks on the 'cancel all' button in the 'unsent messages' bar.
     */
    onDeleteAllClick?: () => void;
    /**
     * Called when the user clicks on the 'Retry' button in the 'failed to start chat' bar.
     */
    onRetryRoomCreationClick?: () => void;
    /**
     * Called when the user clicks on the 'Review Terms and Conditions' button.
     */
    onTermsAndConditionsClicked?: () => void;
}

/**
 * The view model for RoomStatusBarView.
 */
export declare type RoomStatusBarViewModel = ViewModel<RoomStatusBarViewSnapshot> & RoomStatusBarViewActions;

declare interface RoomStatusBarViewProps {
    /**
     * The view model for the banner.
     */
    vm: RoomStatusBarViewModel;
}

export declare type RoomStatusBarViewSnapshot = RoomStatusBarNoConnection | RoomStatusBarConsentState | RoomStatusBarResourceLimitedState | RoomStatusBarUnsentMessagesState | RoomStatusBarLocalRoomError | RoomStatusBarNotVisible;

/**
 * Sanitizes unsafe text for the sanitizer, ensuring references to variables will not be considered
 * replaceable by the translation functions.
 * @param {string} text The text to sanitize.
 * @returns {string} The sanitized text.
 */
export declare function sanitizeForTranslation(text: string): string;

/**
 * Renders the 7 emoji used for SAS verification.
 * The component is responsive so can be rendered in any context, dialog, side panel.
 */
export declare function SasEmoji({ emoji, className }: Props_2): JSX.Element;

declare type SasEmoji_2 = "🐶" | "🐱" | "🦁" | "🐎" | "🦄" | "🐷" | "🐘" | "🐰" | "🐼" | "🐓" | "🐧" | "🐢" | "🐟" | "🐙" | "🦋" | "🌷" | "🌳" | "🌵" | "🍄" | "🌏" | "🌙" | "☁" | "🔥" | "🍌" | "🍎" | "🍓" | "🌽" | "🍕" | "🎂" | "❤" | "😀" | "🤖" | "🎩" | "👓" | "🔧" | "🎅" | "👍" | "☂" | "⌛" | "⏰" | "🎁" | "💡" | "📕" | "✏" | "📎" | "✂" | "🔒" | "🔑" | "🔨" | "☎" | "🏁" | "🚂" | "🚲" | "✈" | "🚀" | "🏆" | "⚽" | "🎸" | "🎺" | "🔔" | "⚓" | "🎧" | "📁" | "📌";

/**
 * Utility type for the prop scrollIntoViewOnChange allowing it to be memoised by a caller without repeating types
 */
export declare type ScrollIntoViewOnChange<Item, Context = any> = NonNullable<VirtuosoProps<Item, VirtualizedListContext<Context>>["scrollIntoViewOnChange"]>;

/**
 * A seek bar component for audio playback.
 *
 * @example
 * ```tsx
 * <SeekBar value={50} onChange={(e) => console.log("New value", e.target.value)} />
 * ```
 */
export declare function SeekBar({ value, className, ...rest }: Readonly<SeekBarProps>): JSX.Element;

declare interface SeekBarProps extends default_2.InputHTMLAttributes<HTMLInputElement> {
    /**
     * The current value of the seek bar, between 0 and 100.
     * @default 0
     */
    value?: number;
}

/**
 * Sets the language for the application.
 * In Element web,`languageHandler.setLanguage` should be used instead.
 * @param language
 */
export declare function setLanguage(language: string): Promise<void>;

export declare function setLocale(value: string): string;

export declare function setMissingEntryGenerator(callback: (value: string) => void): void;

/**
 * This is the output of the viewmodel that the view consumes.
 * Updating snapshot through this object will make react re-render
 * components.
 */
export declare class Snapshot<T> {
    private snapshot;
    private emit;
    constructor(snapshot: T, emit: () => void);
    /**
     * Replace current snapshot with a new snapshot value.
     * @param snapshot New snapshot value
     */
    set(snapshot: T): void;
    /**
     * Update a part of the current snapshot by merging into the existing snapshot.
     * @param snapshot A subset of the snapshot to merge into the current snapshot.
     */
    merge(snapshot: Partial<T>): void;
    /**
     * The current value of the snapshot.
     */
    get current(): T;
}

/**
 * The available sorting options for the room list.
 */
export declare type SortOption = "recent" | "alphabetical" | "unread-first";

export declare function substitute(text: string, variables?: IVariables): string;

export declare function substitute(text: string, variables: IVariables | undefined, tags: Tags | undefined): string;

/**
 * The value a variable or tag can take for a translation interpolation.
 */
declare type SubstitutionValue = number | string | default_2.ReactNode | ((sub: string) => default_2.ReactNode);

export declare function sum(...i: number[]): number;

export declare function _t(text: TranslationKey, variables?: IVariables): string;

export declare function _t(text: TranslationKey, variables: IVariables | undefined, tags: Tags): default_2.ReactNode;

export declare type Tags = Record<string, SubstitutionValue>;

export declare function _td(s: TranslationKey): TranslationKey;

export declare function _tDom(text: TranslationKey, variables?: IVariables): TranslatedString;

export declare function _tDom(text: TranslationKey, variables: IVariables, tags: Tags): default_2.ReactNode;

export declare function TextualEventView({ vm }: Props_3): JSX.Element;

export declare type TextualEventViewSnapshot = {
    content: string | ReactNode;
};

/**
 * Generic timeline separator component to render within a MessagePanel
 *
 * @param label the accessible label string describing the separator
 * @param children the children to draw within the timeline separator
 */
export declare const TimelineSeparator: default_2.FC<TimelineSeparatorProps>;

/**
 * Timeline separator props
 */
export declare interface TimelineSeparatorProps {
    /**
     * Accessible label for the separator (for example: "Today", "Yesterday", or a date).
     */
    label: string;
    /**
     * The CSS class name.
     */
    className?: string;
    /**
     * Optional children to render inside the timeline separator
     */
    children?: PropsWithChildren["children"];
}

export declare type TranslatedString = string | default_2.ReactNode;

/**
 * A hook to manage the wrapping of filters in the room list.
 * It observes the filter list and hides filters that are wrapping when the list is not expanded.
 * @param isExpanded
 * @param wrappingClassName - the CSS class to apply to wrapping filters
 * @returns an object containing:
 * - `ref`: a ref to put on the filter list element
 * - `isWrapping`: a boolean indicating if the filters are wrapping
 * - `wrappingIndex`: the index of the first filter that is wrapping
 */
export declare function useCollapseFilters<T extends HTMLElement>(isExpanded: boolean, wrappingClassName: string): {
    ref: RefObject<T | null>;
    isWrapping: boolean;
    wrappingIndex: number;
};

/**
 * Instantiate a view-model that gets disposed when the calling react component unmounts.
 * In other words, this hook ties the lifecycle of a view-model to the lifecycle of a
 * react component.
 *
 * @param vmCreator A function that returns a view-model instance
 * @returns view-model instance from vmCreator
 * @example
 * const vm = useCreateAutoDisposedViewModel(() => new FooViewModel({prop1, prop2, ...});
 */
export declare function useCreateAutoDisposedViewModel<B extends BaseViewModel<unknown, unknown>>(vmCreator: VmCreator<B>): B;

/**
 * A hook to get the i18n API from the context. Will throw if no i18n context is found.
 * @throws If no i18n context is found
 * @returns The i18n API from the context
 */
export declare function useI18n(): I18nApi_2;

/**
 * Hook helper to return a mocked view model created with the given snapshot and actions.
 * This is useful for testing components in isolation with a mocked view model and allows to use primitive types in stories.
 *
 * @param snapshot
 * @param actions
 */
export declare function useMockedViewModel<S, A>(snapshot: S, actions: A): ViewModel<S> & A;

/**
 * A small wrapper around useSyncExternalStore to use a view model in a shared component view
 * @param vm The view model to use
 * @returns The current snapshot
 */
export declare function useViewModel<T>(vm: ViewModel<T>): T;

/**
 * A hook to sort the filter IDs by active state.
 * The list is sorted if the active filter index is greater than or equal to the wrapping index.
 * If the wrapping index is -1, the filters are not sorted.
 *
 * @param filterIds - the list of filter IDs to sort.
 * @param activeFilterId - the currently active filter ID (if any).
 * @param wrappingIndex - the index of the first filter that is wrapping.
 */
export declare function useVisibleFilters(filterIds: FilterId[], activeFilterId: FilterId | undefined, wrappingIndex: number): FilterId[];

/**
 * The interface for a generic View Model passed to the shared components.
 * The snapshot is of type T which is a type specifying a snapshot for the view in question.
 */
export declare interface ViewModel<T> {
    /**
     * The current snapshot of the view model.
     */
    getSnapshot: () => T;
    /**
     * Subscribes to changes in the view model.
     * The listener will be called whenever the snapshot changes.
     */
    subscribe: (listener: () => void) => () => void;
}

/**
 * Utility class for view models to manage subscriptions to their updates
 */
export declare class ViewModelSubscriptions {
    private listeners;
    /**
     * Subscribe to changes in the view model.
     * @param listener Will be called whenever the snapshot changes.
     * @returns A function to unsubscribe from the view model updates.
     */
    add: (listener: () => void) => (() => void);
    /**
     * Emit an update to all subscribed listeners.
     */
    emit: () => void;
}

/**
 * A generic virtualized list component built on top of react-virtuoso.
 * Provides keyboard navigation and virtualized rendering for performance with large lists.
 *
 * @template Item - The type of data items in the list
 * @template Context - The type of additional context data passed to items
 */
export declare function VirtualizedList<Item, Context = any>(props: IVirtualizedListProps<Item, Context>): default_2.ReactElement;

/**
 * Context object passed to each list item containing the currently focused key
 * and any additional context data from the parent component.
 */
export declare type VirtualizedListContext<Context> = {
    /** The key of item that should have tabIndex == 0 */
    tabIndexKey?: string;
    /** Whether an item in the list is currently focused */
    focused: boolean;
    /** Additional context data passed from the parent component */
    context: Context;
};

/**
 * A virtualized list of rooms.
 * This component provides efficient rendering of large room lists using virtualization,
 * and renders RoomListItemView components for each room.
 *
 * @example
 * ```tsx
 * <VirtualizedRoomListView vm={roomListViewModel} renderAvatar={(room) => <Avatar room={room} />} />
 * ```
 */
export declare function VirtualizedRoomListView({ vm, renderAvatar, onKeyDown }: VirtualizedRoomListViewProps): JSX.Element;

/**
 * Props for the VirtualizedRoomListView component
 */
export declare interface VirtualizedRoomListViewProps {
    /**
     * The view model containing all room list data and callbacks
     */
    vm: RoomListViewModel;
    /**
     * Render function for room avatar
     * @param room - The opaque Room object from the client
     */
    renderAvatar: (room: Room) => ReactNode;
    /**
     * Optional callback for keyboard key down events
     */
    onKeyDown?: (e: default_2.KeyboardEvent<HTMLDivElement>) => void;
}

export { VirtuosoMockContext }

declare type VmCreator<B extends BaseViewModel<unknown, unknown>> = () => B;

declare interface WidgetContextMenuAction {
    /**
     * Function triggered when stream audio is clicked
     */
    onStreamAudioClick: () => Promise<void>;
    /**
     * Function triggered when edit button is clicked
     */
    onEditClick: () => void;
    /**
     * Function triggered when snapshot button is clicked
     */
    onSnapshotClick: () => void;
    /**
     * Function triggered when delete button is clicked
     */
    onDeleteClick: () => void;
    /**
     * Function triggered when revoke button is clicked
     */
    onRevokeClick: () => void;
    /**
     * Called when the action is finished, to close the menu
     */
    onFinished: () => void;
    /**
     * Button used to move up or down in the list the widget position
     * @param direction 1 or -1
     */
    onMoveButton: (direction: number) => void;
}

export declare interface WidgetContextMenuSnapshot {
    /**
     * Indicates if the audio stream button needs to be shown or not
     * depending on the config value audio_stream_url and widget type jitsi
     */
    showStreamAudioStreamButton: boolean;
    /**
     * Indicates if the edit button is shown depending the user permission to modify
     */
    showEditButton: boolean;
    /**
     * Indicates if revoke widget button needs to be shown or not
     */
    showRevokeButton: boolean;
    /**
     * Indicates if delete widget button needs to be shown or not
     */
    showDeleteButton: boolean;
    /**
     * Show take screenshot button or not dependning on config value enableWidgetScreenshots
     */
    showSnapshotButton: boolean;
    /**
     * show move widget position button
     */
    showMoveButtons: [boolean, boolean];
    /**
     * Indicates if user can modify the widget settings
     */
    canModify: boolean;
    /**
     * Indicates if the widget menu is opened or not
     */
    isMenuOpened: boolean;
    /**
     * A component that is displayed which trigger the menu to open or close
     */
    trigger: ReactNode;
    /**
     * If it's an instance of a user widget
     */
    userWidget: boolean;
}

/**
 * A context menu component used to display the correct items that needs to be displayed for a widget item menu
 */
export declare const WidgetContextMenuView: default_2.FC<WidgetContextMenuViewProps>;

export declare type WidgetContextMenuViewModel = ViewModel<WidgetContextMenuSnapshot> & WidgetContextMenuAction;

declare interface WidgetContextMenuViewProps {
    vm: WidgetContextMenuViewModel;
}

export { }

// @blackout/ui primitives v1 (Workstream B1).
//
// Web-first, vanilla-extract-styled primitives that consume `@blackout/design`
// tokens. Kept in their own entry point (`@blackout/ui/primitives`) so the
// React-Native boutique components in `../components` — which import
// `react-native` — never get pulled into a web consumer's bundle.
export { Button } from './Button';
export type { ButtonProps, ButtonTone, ButtonSize } from './Button';
export { IconButton } from './IconButton';
export type { IconButtonProps, IconButtonSize } from './IconButton';
export { Input } from './Input';
export type { InputProps } from './Input';
export { Badge } from './Badge';
export type { BadgeProps, BadgeTone } from './Badge';
export { Spinner } from './Spinner';
export type { SpinnerProps, SpinnerSize } from './Spinner';
export { Stack } from './Stack';
export type { StackProps, StackDirection } from './Stack';
export { Separator } from './Separator';
export type { SeparatorProps, SeparatorOrientation } from './Separator';
export { Card } from './Card';
export type { CardProps } from './Card';

// B1.1 — remaining primitives.
export { TextArea } from './TextArea';
export type { TextAreaProps } from './TextArea';
export { Select } from './Select';
export type { SelectProps } from './Select';
export { Checkbox } from './Checkbox';
export type { CheckboxProps } from './Checkbox';
export { Radio } from './Radio';
export type { RadioProps } from './Radio';
export { Switch } from './Switch';
export type { SwitchProps } from './Switch';
export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';
export { Inline } from './Inline';
export type { InlineProps } from './Inline';
export { Cluster } from './Cluster';
export type { ClusterProps } from './Cluster';
export { Grid } from './Grid';
export type { GridProps } from './Grid';
export { Tabs } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';
export { Tooltip } from './Tooltip';
export type { TooltipProps } from './Tooltip';
export { Popover } from './Popover';
export type { PopoverProps } from './Popover';
export { Menu } from './Menu';
export type { MenuProps, MenuItem } from './Menu';
export { Modal } from './Modal';
export type { ModalProps } from './Modal';
export { Sheet } from './Sheet';
export type { SheetProps } from './Sheet';
export { ToastProvider, useToast } from './Toast';
export type { ToastOptions, ToastTone } from './Toast';

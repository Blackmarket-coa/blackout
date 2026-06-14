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

import { createElement } from 'react';

type MonetizationRoutePageProps = {
    title: string;
};

export const MonetizationRoutePage = ({ title }: MonetizationRoutePageProps) =>
    createElement('p', { style: { padding: 12 } }, title);

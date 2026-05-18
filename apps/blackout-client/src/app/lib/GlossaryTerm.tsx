import React, { type CSSProperties, type ReactNode } from 'react';
import { BLACKOUT_GLOSSARY, type BlackoutGlossaryKey } from './blackoutTerminology';

interface GlossaryTermProps {
    term: BlackoutGlossaryKey;
    children?: ReactNode;
    style?: CSSProperties;
}

const baseStyle: CSSProperties = {
    borderBottom: '1px dotted currentColor',
    cursor: 'help',
};

export const GlossaryTerm = ({ term, children, style }: GlossaryTermProps) => (
    <span
        title={BLACKOUT_GLOSSARY[term]}
        aria-label={`${String(children ?? term)} — ${BLACKOUT_GLOSSARY[term]}`}
        style={{ ...baseStyle, ...style }}
    >
        {children ?? term}
    </span>
);

export default GlossaryTerm;

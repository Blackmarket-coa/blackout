import type { ReactNode } from 'react';

export const SpeakingIndicator = ({
  speaking,
  audioLevel,
  children,
}: {
  speaking: boolean;
  audioLevel: number;
  children: ReactNode;
}) => {
  const alpha = Math.max(0.2, Math.min(0.85, audioLevel));

  return (
    <div
      style={{
        display: 'inline-flex',
        borderRadius: 999,
        border: `2px solid ${speaking ? `rgba(83, 240, 117, ${alpha})` : 'transparent'}`,
        boxShadow: speaking ? `0 0 0 3px rgba(83, 240, 117, ${alpha * 0.35})` : 'none',
        transition: 'all .12s ease',
      }}
    >
      {children}
    </div>
  );
};

export default SpeakingIndicator;

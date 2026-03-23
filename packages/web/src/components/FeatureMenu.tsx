import React from 'react';

export function FeatureMenu(props: {
  onSelectStego: () => void;
  onSelectFeature: (feature: string) => void;
}) {
  return (
    <div>
      <button onClick={props.onSelectStego}>Stego Tier</button>
      <button onClick={() => props.onSelectFeature('sign')}>Sign Message</button>
      <button onClick={() => props.onSelectFeature('poll')}>Create Poll</button>
    </div>
  );
}

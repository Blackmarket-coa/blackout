import React from 'react';

export function StegoSelector(props: {
  selected: number;
  onSelect: (tier: 1 | 2 | 3) => void;
}) {
  return (
    <div>
      {[1, 2, 3].map((tier) => (
        <button
          key={tier}
          disabled={props.selected === tier}
          onClick={() => props.onSelect(tier as 1 | 2 | 3)}
        >
          Tier {tier}
        </button>
      ))}
    </div>
  );
}

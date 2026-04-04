import React, { useState } from 'react';
import { useGovernance } from '../hooks/useGovernance';

export function Poll({ poll }: { poll: any }) {
  const [hasVoted, setHasVoted] = useState(false);
  const { castVote } = useGovernance();

  return (
    <div>
      <div>🗳️ {poll.title}</div>
      {poll.results?.map((result: any) => (
        <div key={result.choice}>
          <span>{result.choice}</span> <span>{result.percentage}%</span>
        </div>
      ))}
      {!hasVoted && (
        <button
          onClick={async () => {
            await castVote(poll.id, 'yes', 'demo-user');
            setHasVoted(true);
          }}
        >
          Vote Now
        </button>
      )}
    </div>
  );
}

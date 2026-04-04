import React, { useState } from 'react';
import { FeatureMenu } from './FeatureMenu';
import { StegoSelector } from './StegoSelector';
import { useMessages } from '../hooks/useMessages';
import { useGovernance } from '../hooks/useGovernance';

export function MessageComposer({ channelId, userId = 'demo-user' }: { channelId: string; userId?: string }) {
  const [content, setContent] = useState('');
  const [showFeatures, setShowFeatures] = useState(false);
  const [showStego, setShowStego] = useState(false);
  const [signMessage, setSignMessage] = useState(false);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pollTitle, setPollTitle] = useState('');
  const [pollDescription, setPollDescription] = useState('');
  const [stegoTier, setStegoTier] = useState<1 | 2 | 3>(2);
  const { sendMessage } = useMessages(channelId);
  const { createVote } = useGovernance();

  return (
    <div>
      <button onClick={() => setShowFeatures((v) => !v)}>+</button>
      {showFeatures && (
        <FeatureMenu
          onSelectStego={() => setShowStego((v) => !v)}
          onSelectFeature={(feature) => {
            if (feature === 'sign') {
              setSignMessage((v) => !v);
              return;
            }
            if (feature === 'poll') {
              setShowPollComposer((v) => !v);
            }
          }}
        />
      )}
      {showStego && <StegoSelector selected={stegoTier} onSelect={setStegoTier} />}
      {showPollComposer && (
        <div>
          <input
            value={pollTitle}
            onChange={(e) => setPollTitle(e.target.value)}
            placeholder="Poll title"
          />
          <input
            value={pollDescription}
            onChange={(e) => setPollDescription(e.target.value)}
            placeholder="Poll description"
          />
        </div>
      )}
      <textarea value={content} onChange={(e) => setContent(e.target.value)} />
      <button
        onClick={async () => {
          let governance: { type: 'poll'; data: any } | undefined;

          if (showPollComposer && pollTitle.trim().length > 0) {
            const vote = await createVote({
              communityId: `${channelId}-community`,
              proposerId: userId,
              title: pollTitle.trim(),
              description: pollDescription.trim() || undefined,
            });
            governance = { type: 'poll', data: vote };
          }

          await sendMessage({
            content,
            stegoTier,
            sign: signMessage,
            userId,
            governance,
          });
          setContent('');
          setPollTitle('');
          setPollDescription('');
          setShowPollComposer(false);
        }}
      >
        ✈️
      </button>
    </div>
  );
}

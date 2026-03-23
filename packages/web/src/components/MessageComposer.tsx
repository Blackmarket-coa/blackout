import React, { useState } from 'react';
import { FeatureMenu } from './FeatureMenu';
import { StegoSelector } from './StegoSelector';
import { useMessages } from '../hooks/useMessages';

export function MessageComposer({ channelId }: { channelId: string }) {
  const [content, setContent] = useState('');
  const [showFeatures, setShowFeatures] = useState(false);
  const [showStego, setShowStego] = useState(false);
  const [activeFeatures, setActiveFeatures] = useState<string[]>(['tier2']);
  const [stegoTier, setStegoTier] = useState<1 | 2 | 3>(2);
  const { sendMessage } = useMessages(channelId);

  return (
    <div>
      <button onClick={() => setShowFeatures((v) => !v)}>+</button>
      {showFeatures && (
        <FeatureMenu
          onSelectStego={() => setShowStego((v) => !v)}
          onSelectFeature={(feature) => setActiveFeatures((prev) => [...new Set([...prev, feature])])}
        />
      )}
      {showStego && <StegoSelector selected={stegoTier} onSelect={setStegoTier} />}
      <textarea value={content} onChange={(e) => setContent(e.target.value)} />
      <button
        onClick={async () => {
          await sendMessage({ content, stegoTier, features: activeFeatures, sign: activeFeatures.includes('sign') });
          setContent('');
        }}
      >
        ✈️
      </button>
    </div>
  );
}

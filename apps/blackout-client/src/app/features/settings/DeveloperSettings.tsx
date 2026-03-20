import PlaceholderSection from './PlaceholderSection';
import { StegoSettings } from '../steganography';

const DeveloperSettings = () => (
  <div style={{ display: 'grid', gap: 16 }}>
    <PlaceholderSection
      title="Developer"
      description="Debug and inspect app internals."
      items={['Developer mode', 'Event inspector', 'Raw state viewer']}
    />
    <StegoSettings />
  </div>
);

export default DeveloperSettings;

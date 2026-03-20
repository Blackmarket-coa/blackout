import { useState } from 'react';
import MessageComposer from '../room/MessageComposer';

type DeliveryConditionType = 'none' | 'deliver-at' | 'recipient-online';

export const DeadDropComposer = ({ roomId }: { roomId: string }) => {
  const [conditionType, setConditionType] = useState<DeliveryConditionType>('none');
  const [deliverAt, setDeliverAt] = useState('');

  return (
    <div style={{ borderTop: '1px solid var(--border-default)' }}>
      <div
        style={{
          display: 'grid',
          gap: 10,
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-input)',
          padding: 10,
        }}
      >
        <strong>Dead Drop: message will be queued</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            Delivery condition
            <select value={conditionType} onChange={(event) => setConditionType(event.target.value as DeliveryConditionType)} style={{ marginLeft: 8 }}>
              <option value="none">None</option>
              <option value="deliver-at">Deliver at time</option>
              <option value="recipient-online">Recipient online</option>
            </select>
          </label>

          {conditionType === 'deliver-at' ? (
            <label>
              Time
              <input type="datetime-local" value={deliverAt} onChange={(event) => setDeliverAt(event.target.value)} style={{ marginLeft: 8 }} />
            </label>
          ) : null}
        </div>
      </div>

      <MessageComposer
        roomId={roomId}
        placeholder={
          conditionType === 'none'
            ? 'Message will be queued until next dead drop release…'
            : `Queued message (${conditionType}${deliverAt ? `: ${deliverAt}` : ''})…`
        }
      />
    </div>
  );
};

export default DeadDropComposer;

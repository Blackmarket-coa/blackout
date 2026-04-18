import { useState, useCallback } from 'react';
import { useMatrixClient } from './useMatrixClient';
import { useAccountDataCallback } from './useAccountDataCallback';

export function useAccountData(eventType: string) {
  const mx = useMatrixClient();
  const [event, setEvent] = useState(() => mx.getAccountData(eventType as never));

  useAccountDataCallback(
    mx,
    useCallback(
      (evt) => {
        if (evt.getType() === eventType) {
          setEvent(evt);
        }
      },
      [eventType, setEvent]
    )
  );

  return event;
}

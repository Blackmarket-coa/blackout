import { useMatch } from 'react-router-dom';
import {
  getInboxInvitesPath,
  getInboxNotificationsPath,
} from '../../pages/pathUtils';

export const useInboxSelected = (): boolean => {
  const notificationsMatch = useMatch({
    path: getInboxNotificationsPath(),
    caseSensitive: true,
    end: false,
  });
  const invitesMatch = useMatch({
    path: getInboxInvitesPath(),
    caseSensitive: true,
    end: false,
  });

  return !!notificationsMatch || !!invitesMatch;
};

export const useInboxNotificationsSelected = (): boolean => {
  const match = useMatch({
    path: getInboxNotificationsPath(),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};

export const useInboxInvitesSelected = (): boolean => {
  const match = useMatch({
    path: getInboxInvitesPath(),
    caseSensitive: true,
    end: false,
  });

  return !!match;
};

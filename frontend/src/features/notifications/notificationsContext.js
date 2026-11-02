import { createContext, useContext } from 'react';

export const NotificationsContext = createContext({
  unreadCount: 0,
  setUnreadCount: () => {},
  refreshUnread: async () => {},
});

/** Unread count of the signed-in person. Outside the provider (isolated tests) it is always 0. */
export const useNotifications = () => useContext(NotificationsContext);

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/react';
import { Bell, X, Check, Heart, MessageCircle, Award, TrendingUp } from 'lucide-react';
import { useLocation } from 'wouter';

interface Notification {
  id: number;
  type: 'comment_reply' | 'like' | 'badge_earned' | 'level_up';
  title: string;
  message: string;
  relatedId?: number;
  read: boolean;
  createdAt: string;
}

export function Notifications() {
  const { isSignedIn, getToken } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isSignedIn) return;

    const fetchNotifications = async () => {
      try {
        const token = await getToken();
        const [notifRes, countRes] = await Promise.all([
          fetch('/api/notifications', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/notifications/unread-count', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (notifRes.ok) {
          const data = await notifRes.json();
          setNotifications(data);
        }

        if (countRes.ok) {
          const data = await countRes.json();
          setUnreadCount(data.count);
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    fetchNotifications();

    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [isSignedIn, getToken]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: number) => {
    try {
      const token = await getToken();
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = await getToken();
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'comment_reply':
        return <MessageCircle className="text-blue-500" size={20} />;
      case 'like':
        return <Heart className="text-red-500" size={20} />;
      case 'badge_earned':
        return <Award className="text-yellow-500" size={20} />;
      case 'level_up':
        return <TrendingUp className="text-purple-500" size={20} />;
      default:
        return <Bell className="text-gray-500" size={20} />;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);

    // Navigate to related content if applicable
    if (notification.relatedId && (notification.type === 'comment_reply' || notification.type === 'like')) {
      setLocation(`/confessions/${notification.relatedId}`);
    }

    setIsOpen(false);
  };

  if (!isSignedIn) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="icon-button relative"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="overflow-y-auto max-h-80">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="mx-auto mb-2 text-gray-400" size={32} />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    !notification.read ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">{getNotificationIcon(notification.type)}</div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-gray-800 text-sm">{notification.title}</h4>
                        {!notification.read && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full mt-1 ml-2" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(notification.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

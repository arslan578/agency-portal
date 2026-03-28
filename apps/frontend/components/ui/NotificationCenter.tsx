'use client';

import { Bell, X, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { Button } from './Button';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { useNotifications } from '@/context/NotificationContext';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';

export function NotificationCenter() {
  const { notifications, removeNotification, clearAll } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const unreadCount = notifications.filter(n => !n.persistent).length;

  const iconMap = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const colorMap = {
    success: 'text-green-400',
    error: 'text-red-400',
    warning: 'text-yellow-400',
    info: 'text-blue-400',
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-white/10 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-gray-400" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setIsOpen(false)}
            aria-hidden
          />
          <Card className="absolute right-0 mt-2 w-96 max-h-[600px] overflow-hidden z-50 rounded-xl border border-white/20 bg-[#1a1d24] shadow-2xl shadow-black/40">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-white/10">
              <CardTitle className="text-lg font-semibold text-white">Notifications</CardTitle>
              {notifications.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAll} className="text-white/80 hover:text-white">
                  Clear All
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto max-h-[520px]">
              {notifications.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white/10 mb-4">
                    <Bell className="h-7 w-7 text-white/60" />
                  </div>
                  <p className="text-white/70 text-sm">No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {notifications.map((notification) => {
                    const Icon = iconMap[notification.type];
                    return (
                      <div
                        key={notification.id}
                        className="p-4 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <Icon className={cn('h-5 w-5 mt-0.5 flex-shrink-0', colorMap[notification.type])} />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-white text-sm">{notification.title}</p>
                            {notification.message && (
                              <p className="text-white/75 text-xs mt-1">{notification.message}</p>
                            )}
                            {notification.action && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={() => {
                                  notification.action?.onClick();
                                  removeNotification(notification.id);
                                }}
                              >
                                {notification.action.label}
                              </Button>
                            )}
                          </div>
                          <button
                            onClick={() => removeNotification(notification.id)}
                            className="text-white/60 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
                            aria-label="Close notification"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

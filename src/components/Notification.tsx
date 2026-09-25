import React, { useEffect, useRef } from 'react';
import { X, AlertCircle, Info, CheckCircle, AlertTriangle } from 'lucide-react';
import { gsap } from 'gsap';
import { useNotificationStore, NotificationType, Notification } from '../stores/notificationStore';

interface NotificationItemProps {
  notification: Notification;
  onClose: () => void;
  isMarkedForRemoval: boolean;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onClose, isMarkedForRemoval }) => {
  const notificationRef = useRef<HTMLDivElement>(null);
  
  // 根据通知类型获取对应的图标和颜色
  const getNotificationStyles = (type: NotificationType) => {
    switch (type) {
      case 'info':
        return {
          icon: <Info size={15} />,
          bgColor: 'bg-white',
          borderColor: 'border-blue-200',
          textColor: 'text-neutral-800',
          iconColor: 'text-blue-500'
        };
      case 'success':
        return {
          icon: <CheckCircle size={15} />,
          bgColor: 'bg-white',
          borderColor: 'border-emerald-200',
          textColor: 'text-neutral-800',
          iconColor: 'text-emerald-500'
        };
      case 'warning':
        return {
          icon: <AlertTriangle size={15} />,
          bgColor: 'bg-white',
          borderColor: 'border-amber-200',
          textColor: 'text-neutral-800',
          iconColor: 'text-amber-500'
        };
      case 'error':
        return {
          icon: <AlertCircle size={15} />,
          bgColor: 'bg-white',
          borderColor: 'border-red-200',
          textColor: 'text-neutral-800',
          iconColor: 'text-red-500'
        };
      default:
        return {
          icon: <Info size={15} />,
          bgColor: 'bg-white',
          borderColor: 'border-neutral-200',
          textColor: 'text-neutral-800',
          iconColor: 'text-neutral-500'
        };
    }
  };

  const styles = getNotificationStyles(notification.type);

  // 入场动画
  useEffect(() => {
    if (notificationRef.current) {
      gsap.fromTo(
        notificationRef.current,
        { 
          y: -16, 
          opacity: 0,
          scale: 0.95
        },
        { 
          y: 0, 
          opacity: 1, 
          scale: 1,
          duration: 0.25,
          ease: "power2.out"
        }
      );
    }
  }, []);

  // 监听是否标记为删除，如果是则播放退出动画
  useEffect(() => {
    if (isMarkedForRemoval && notificationRef.current) {
      gsap.to(notificationRef.current, {
        y: -16,
        opacity: 0,
        scale: 0.95,
        duration: 0.2,
        ease: "power2.in",
        onComplete: onClose
      });
    }
  }, [isMarkedForRemoval, onClose]);

  const handleClose = () => {
    useNotificationStore.getState().markNotificationForRemoval(notification.id);
  };

  return (
    <div
      ref={notificationRef}
      className={`inline-flex items-center gap-2 px-3.5 py-2 mb-2 rounded-full md:rounded-lg shadow-lg border ${styles.bgColor} ${styles.borderColor} w-auto max-w-[calc(100vw-32px)] md:max-w-md pointer-events-auto transition-colors`}
    >
      <div className={`shrink-0 ${styles.iconColor}`}>
        {styles.icon}
      </div>
      <div className={`${styles.textColor} text-xs md:text-sm font-medium truncate min-w-0`}>
        {notification.message}
      </div>
      <div className="flex shrink-0 items-center gap-1 ml-1">
        {notification.actionLabel && notification.onAction && (
          <button
            onClick={() => {
              notification.onAction?.();
              handleClose();
            }}
            className="rounded border border-neutral-200 px-2 py-0.5 text-xs font-medium hover:bg-neutral-50 text-neutral-700"
          >
            {notification.actionLabel}
          </button>
        )}
        <button
          onClick={handleClose}
          className="text-neutral-400 hover:text-neutral-600 focus:outline-none p-0.5"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

const NotificationContainer: React.FC = () => {
  const { notifications, removeNotification, notificationsToRemove } = useNotificationStore();

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 md:left-auto md:right-4 md:translate-x-0 z-[300] flex flex-col items-center md:items-end pointer-events-none">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onClose={() => removeNotification(notification.id)}
          isMarkedForRemoval={notificationsToRemove.includes(notification.id)}
        />
      ))}
    </div>
  );
};

export default NotificationContainer;
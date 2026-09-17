"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import {
  deleteReadNotificationAction,
  readNotificationAction,
} from "@/app/notifications/actions";
import { BellIcon } from "@/components/icons";

export default function NotificationMenu({
  initialNotifications = [],
  initialUnreadCount = 0,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [pendingId, setPendingId] = useState("");
  const [pendingType, setPendingType] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeMenu(event) {
      if (!menuRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function closeMenuWithEscape(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenuWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenuWithEscape);
    };
  }, [isOpen]);

  function openNotification(notification) {
    if (pendingId) {
      return;
    }

    setPendingId(notification.id);
    setPendingType("open");
    setErrorMessage("");

    startTransition(async () => {
      try {
        const result = await readNotificationAction(notification.id);

        if (!result?.link) {
          setErrorMessage(result?.error ?? "알림을 열지 못했습니다.");
          return;
        }

        if (!notification.read) {
          setNotifications((items) => items.map((item) => (
            item.id === notification.id ? { ...item, read: true } : item
          )));
          setUnreadCount((count) => Math.max(0, count - 1));
        }

        window.location.assign(result.link);
      } catch {
        setErrorMessage("알림을 열지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setPendingId("");
        setPendingType("");
      }
    });
  }

  function deleteNotification(notification) {
    if (!notification.read || pendingId) {
      return;
    }

    setPendingId(notification.id);
    setPendingType("delete");
    setErrorMessage("");

    startTransition(async () => {
      try {
        const result = await deleteReadNotificationAction(notification.id);

        if (!result?.deleted) {
          setErrorMessage(result?.error ?? "알림을 삭제하지 못했습니다.");
          return;
        }

        setNotifications((items) => items.filter((item) => item.id !== notification.id));
      } catch {
        setErrorMessage("알림을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setPendingId("");
        setPendingType("");
      }
    });
  }

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div className="notification-menu" ref={menuRef}>
      <button
        className="notification-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={unreadCount > 0 ? `알림 ${unreadCount}개 읽지 않음` : "알림"}
        onClick={() => {
          setErrorMessage("");
          setIsOpen((open) => !open);
        }}
      >
        <BellIcon size={21} />
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">{badgeLabel}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown" role="menu" aria-label="최근 알림">
          <div className="notification-dropdown-heading">
            <strong>알림</strong>
            <span>{unreadCount > 0 ? `${unreadCount}개 읽지 않음` : "새 알림이 없어요"}</span>
          </div>

          {notifications.length > 0 ? (
            <div className="notification-list">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.read ? "read" : "unread"}`}
                  role="none"
                >
                  <button
                    className="notification-item-open"
                    type="button"
                    role="menuitem"
                    disabled={Boolean(pendingId)}
                    onClick={() => openNotification(notification)}
                  >
                    <span className="notification-item-marker" aria-hidden="true" />
                    <span className="notification-item-copy">
                      <strong>{notification.title}</strong>
                      <span>{notification.message}</span>
                      <time dateTime={notification.createdAt}>{notification.createdAtLabel}</time>
                    </span>
                    {pendingId === notification.id && pendingType === "open" && (
                      <span className="notification-item-status">여는 중…</span>
                    )}
                  </button>
                  {notification.read && (
                    <button
                      className="notification-item-delete"
                      type="button"
                      role="menuitem"
                      aria-label={`알림 삭제: ${notification.title}`}
                      disabled={Boolean(pendingId)}
                      onClick={() => deleteNotification(notification)}
                    >
                      {pendingId === notification.id && pendingType === "delete"
                        ? "삭제 중…"
                        : "삭제"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="notification-empty">아직 도착한 알림이 없습니다.</p>
          )}

          {errorMessage && (
            <p className="notification-error" role="alert">{errorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}

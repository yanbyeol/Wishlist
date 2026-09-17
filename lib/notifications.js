import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/mongodb";
import {
  documentIdFilter,
  foreignKeyFilter,
  normalizeId,
} from "@/lib/utils/mongo";

export const NOTIFICATION_TYPES = {
  GIFT_RECEIVED: "GIFT_RECEIVED",
  GIFT_ADDRESS_REQUIRED: "GIFT_ADDRESS_REQUIRED",
  GROUP_GIFT_COMPLETED: "GROUP_GIFT_COMPLETED",
  GROUP_GIFT_CONTRIBUTION: "GROUP_GIFT_CONTRIBUTION",
};

const RECENT_NOTIFICATION_LIMIT = 15;

function sanitizeNotificationLink(value) {
  const link = String(value ?? "").trim();

  if (!link.startsWith("/") || link.startsWith("//") || link.includes("\\")) {
    return "/";
  }

  return link;
}

function formatNotificationDate(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function presentNotification(notification) {
  if (!notification) {
    return null;
  }

  return {
    id: normalizeId(notification._id),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: sanitizeNotificationLink(notification.link),
    read: Boolean(notification.read),
    createdAt: notification.createdAt?.toISOString?.() ?? notification.createdAt,
    createdAtLabel: formatNotificationDate(notification.createdAt),
  };
}

function notificationDocumentId(eventKey) {
  const hex = createHash("sha256").update(eventKey).digest("hex").slice(0, 24);
  return new ObjectId(hex);
}

export function getNotificationEventKey(type, entityId) {
  return `${type}:${normalizeId(entityId)}`;
}

export async function createNotification({
  userId,
  type,
  title,
  message,
  link,
  eventKey,
}) {
  const normalizedUserId = normalizeId(userId);

  if (!normalizedUserId || !type || !title || !eventKey) {
    throw new Error("알림 생성에 필요한 정보가 없습니다.");
  }

  const db = await getDatabase();
  const now = new Date();
  const notification = {
    userId: normalizedUserId,
    type,
    title: String(title),
    message: String(message ?? ""),
    link: sanitizeNotificationLink(link),
    read: false,
    eventKey,
    createdAt: now,
    updatedAt: now,
  };
  const id = notificationDocumentId(eventKey);
  const result = await db.collection("notifications").updateOne(
    { _id: id },
    { $setOnInsert: notification },
    { upsert: true },
  );

  return {
    created: result.upsertedCount === 1,
    notification: presentNotification({ ...notification, _id: id }),
  };
}

export async function createNotificationSafely(notification) {
  try {
    return await createNotification(notification);
  } catch (error) {
    console.error("알림을 저장하지 못했습니다.", {
      type: notification?.type,
      eventKey: notification?.eventKey,
      error,
    });
    return null;
  }
}

export async function getNotificationSummary(
  userId,
  limit = RECENT_NOTIFICATION_LIMIT,
) {
  const normalizedUserId = normalizeId(userId);

  if (!normalizedUserId) {
    return { notifications: [], unreadCount: 0 };
  }

  const db = await getDatabase();
  const userFilter = foreignKeyFilter("userId", normalizedUserId);
  const notificationCollection = db.collection("notifications");
  const [notificationDocuments, unreadCount] = await Promise.all([
    notificationCollection
      .find(userFilter, {
        projection: {
          userId: 0,
          eventKey: 0,
          updatedAt: 0,
          readAt: 0,
        },
      })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(Number(limit) || RECENT_NOTIFICATION_LIMIT, 1), 20))
      .toArray(),
    notificationCollection.countDocuments({ ...userFilter, read: false }),
  ]);

  return {
    notifications: notificationDocuments.map(presentNotification),
    unreadCount,
  };
}

export async function markNotificationRead(notificationId, userId) {
  const normalizedUserId = normalizeId(userId);

  if (!normalizedUserId) {
    return null;
  }

  const db = await getDatabase();
  const now = new Date();
  const notification = await db.collection("notifications").findOneAndUpdate(
    {
      ...documentIdFilter(notificationId),
      ...foreignKeyFilter("userId", normalizedUserId),
    },
    {
      $set: {
        read: true,
        readAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );

  return presentNotification(notification);
}

export async function deleteReadNotification(notificationId, userId) {
  const normalizedUserId = normalizeId(userId);

  if (!normalizedUserId) {
    return false;
  }

  const db = await getDatabase();
  const result = await db.collection("notifications").deleteOne({
    ...documentIdFilter(notificationId),
    ...foreignKeyFilter("userId", normalizedUserId),
    read: true,
  });

  return result.deletedCount === 1;
}

export async function markNotificationEventReadSafely(eventKey, userId) {
  try {
    const db = await getDatabase();
    const now = new Date();
    await db.collection("notifications").updateOne(
      {
        _id: notificationDocumentId(eventKey),
        ...foreignKeyFilter("userId", userId),
      },
      {
        $set: {
          read: true,
          readAt: now,
          updatedAt: now,
        },
      },
    );
  } catch (error) {
    console.error("처리한 알림을 읽음 상태로 바꾸지 못했습니다.", {
      eventKey,
      error,
    });
  }
}

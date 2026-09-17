"use server";

import { markNotificationRead } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";

export async function readNotificationAction(notificationId) {
  const user = await getCurrentUser();

  if (!user) {
    return { error: "로그인 정보를 다시 확인해 주세요." };
  }

  const notification = await markNotificationRead(notificationId, user.id);

  if (!notification) {
    return { error: "확인할 수 없는 알림입니다." };
  }

  return { link: notification.link };
}

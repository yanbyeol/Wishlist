import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/mongodb";

export const SESSION_ACCESS_MODES = {
  GIFT: "gift",
  MEMBER: "member",
};

export async function getCurrentSession() {
  const requestHeaders = await headers();
  const { auth } = await import("@/lib/auth");
  return auth.api.getSession({ headers: requestHeaders });
}

export async function getCurrentUser() {
  const session = await getCurrentSession();

  if (!session?.user) {
    return null;
  }

  const accessMode = session.session?.accessMode === SESSION_ACCESS_MODES.MEMBER
    ? SESSION_ACCESS_MODES.MEMBER
    : SESSION_ACCESS_MODES.GIFT;

  return {
    ...session.user,
    accessMode,
    isMember: accessMode === SESSION_ACCESS_MODES.MEMBER,
  };
}

export async function requireUser(callbackPath = "/") {
  const user = await getCurrentUser();

  if (!user) {
    const callback = encodeURIComponent(callbackPath);
    redirect(`/login?callback=${callback}`);
  }

  return user;
}

export async function requireGiftUser(callbackPath) {
  const user = await getCurrentUser();

  if (!user) {
    redirect(callbackPath);
  }

  return user;
}

export async function getCurrentMember() {
  const user = await getCurrentUser();
  return user?.isMember ? user : null;
}

export async function requireMember(callbackPath = "/") {
  const member = await getCurrentMember();

  if (!member) {
    const callback = encodeURIComponent(callbackPath);
    redirect(`/login?callback=${callback}&notice=member-required`);
  }

  return member;
}

export async function setSessionAccessMode(sessionToken, accessMode) {
  if (!sessionToken || !Object.values(SESSION_ACCESS_MODES).includes(accessMode)) {
    throw new Error("인증 세션 권한을 확인할 수 없습니다.");
  }

  const db = await getDatabase();
  const result = await db.collection("session").updateOne(
    { token: sessionToken },
    {
      $set: {
        accessMode,
        updatedAt: new Date(),
      },
    },
  );

  if (result.matchedCount !== 1) {
    throw new Error("인증 세션 권한을 저장하지 못했습니다.");
  }
}

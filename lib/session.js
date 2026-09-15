import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function getCurrentSession() {
  const requestHeaders = await headers();
  const { auth } = await import("@/lib/auth");
  return auth.api.getSession({ headers: requestHeaders });
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function requireUser(callbackPath = "/") {
  const user = await getCurrentUser();

  if (!user) {
    const callback = encodeURIComponent(callbackPath);
    redirect(`/login?callback=${callback}`);
  }

  return user;
}

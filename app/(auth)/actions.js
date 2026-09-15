"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureWishlist } from "@/lib/wishlists";
import { isValidEmail } from "@/lib/utils/validation";
import { sanitizeCallbackPath } from "@/lib/utils/format";

function readCredentials(formData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
    callback: sanitizeCallbackPath(formData.get("callback"), "/"),
  };
}

function readableAuthError(error, fallback) {
  const message = String(error?.message ?? "");

  if (message.includes("Invalid email or password") || message.includes("INVALID_EMAIL_OR_PASSWORD")) {
    return "이메일 또는 비밀번호를 확인해 주세요.";
  }

  if (message.includes("already exists") || message.includes("USER_ALREADY_EXISTS")) {
    return "이미 가입된 이메일입니다.";
  }

  return fallback;
}

export async function signInAction(previousState, formData) {
  const credentials = readCredentials(formData);

  if (!isValidEmail(credentials.email) || credentials.password.length < 8) {
    return { message: "올바른 이메일과 8자 이상의 비밀번호를 입력해 주세요." };
  }

  try {
    const { auth } = await import("@/lib/auth");
    await auth.api.signInEmail({
      body: {
        email: credentials.email,
        password: credentials.password,
        rememberMe: true,
      },
      headers: await headers(),
    });
  } catch (error) {
    return {
      message: readableAuthError(error, "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요."),
    };
  }

  redirect(credentials.callback);
}

export async function signUpAction(previousState, formData) {
  const credentials = readCredentials(formData);

  if (credentials.name.length < 2) {
    return { message: "이름은 2자 이상 입력해 주세요." };
  }

  if (!isValidEmail(credentials.email)) {
    return { message: "올바른 이메일을 입력해 주세요." };
  }

  if (credentials.password.length < 8) {
    return { message: "비밀번호는 8자 이상 입력해 주세요." };
  }

  if (credentials.password !== credentials.passwordConfirm) {
    return { message: "비밀번호 확인이 일치하지 않습니다." };
  }

  try {
    const { auth } = await import("@/lib/auth");
    const result = await auth.api.signUpEmail({
      body: {
        name: credentials.name,
        email: credentials.email,
        password: credentials.password,
      },
      headers: await headers(),
    });
    await ensureWishlist(result.user);
  } catch (error) {
    return {
      message: readableAuthError(error, "회원가입을 완료하지 못했습니다. 다시 시도해 주세요."),
    };
  }

  redirect(credentials.callback);
}

export async function signOutAction() {
  const { auth } = await import("@/lib/auth");
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

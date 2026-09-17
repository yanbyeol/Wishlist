import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getDatabase } from "@/lib/mongodb";
import {
  ensureUniqueUserEmailIndex,
  normalizeUserEmail,
} from "@/lib/users";
import { SESSION_ACCESS_MODES, setSessionAccessMode } from "@/lib/session";
import { normalizeId } from "@/lib/utils/mongo";
import { isValidEmail, isValidOtpCode } from "@/lib/utils/validation";

const otpType = "sign-in";
const otpLifetimeMilliseconds = 10 * 60 * 1000;

function getDefaultUserName(email) {
  const localPart = email.split("@")[0]?.trim() ?? "";
  return localPart.length >= 2 ? localPart.slice(0, 40) : "간편 사용자";
}

function isMockEmailProvider() {
  const provider = process.env.EMAIL_OTP_PROVIDER
    || process.env.GROUP_GIFT_OTP_PROVIDER
    || "mock";
  return provider === "mock" && process.env.NODE_ENV !== "production";
}

function readableOtpError(error, fallback) {
  const code = String(error?.body?.code ?? error?.code ?? "");
  const message = String(error?.message ?? "");

  if (code.includes("INVALID_OTP") || message.toLowerCase().includes("invalid otp")) {
    return "인증번호가 일치하지 않거나 만료되었습니다.";
  }

  if (code.includes("TOO_MANY") || message.toLowerCase().includes("too many")) {
    return "인증 요청 또는 시도 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return fallback;
}

async function linkPreviousEmailContributions(email, userId) {
  const db = await getDatabase();
  await db.collection("contributions").updateMany(
    {
      guestEmail: email,
      userId: null,
    },
    {
      $set: {
        participantType: "member",
        userId: normalizeId(userId),
        guestEmail: null,
        updatedAt: new Date(),
      },
    },
  );
}

export async function requestEmailSignInOtp(email) {
  const normalizedEmail = normalizeUserEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    throw new Error("올바른 이메일을 입력해 주세요.");
  }

  await ensureUniqueUserEmailIndex();

  try {
    await auth.api.sendVerificationOTP({
      body: { email: normalizedEmail, type: otpType },
      headers: await headers(),
    });
  } catch (error) {
    throw new Error(readableOtpError(
      error,
      "인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.",
    ));
  }

  let demoCode = "";

  if (isMockEmailProvider()) {
    const result = await auth.api.getVerificationOTP({
      query: { email: normalizedEmail, type: otpType },
    });
    demoCode = result.otp ?? "";
  }

  return {
    email: normalizedEmail,
    expiresAt: new Date(Date.now() + otpLifetimeMilliseconds),
    demoCode,
  };
}

export async function verifyEmailSignInOtp(email, code) {
  const normalizedEmail = normalizeUserEmail(email);
  const normalizedCode = String(code ?? "").trim();

  if (!isValidEmail(normalizedEmail) || !isValidOtpCode(normalizedCode)) {
    throw new Error("이메일과 6자리 인증번호를 확인해 주세요.");
  }

  await ensureUniqueUserEmailIndex();

  let result;

  try {
    result = await auth.api.signInEmailOTP({
      body: {
        email: normalizedEmail,
        otp: normalizedCode,
        name: getDefaultUserName(normalizedEmail),
      },
      headers: await headers(),
    });
  } catch (error) {
    throw new Error(readableOtpError(
      error,
      "이메일 인증을 완료하지 못했습니다. 인증번호를 다시 확인해 주세요.",
    ));
  }

  await Promise.all([
    setSessionAccessMode(result.token, SESSION_ACCESS_MODES.GIFT),
    linkPreviousEmailContributions(normalizedEmail, result.user.id),
  ]);

  return {
    user: result.user,
    email: normalizedEmail,
  };
}

export async function requestGuestGroupGiftOtp(groupGiftId, email) {
  if (!normalizeId(groupGiftId)) {
    throw new Error("함께 선물하기 정보를 확인해 주세요.");
  }

  return requestEmailSignInOtp(email);
}

export async function verifyGuestGroupGiftOtp(groupGiftId, email, code) {
  if (!normalizeId(groupGiftId)) {
    throw new Error("함께 선물하기 정보를 확인해 주세요.");
  }

  return verifyEmailSignInOtp(email, code);
}

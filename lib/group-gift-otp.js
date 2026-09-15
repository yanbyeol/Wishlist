import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/mongodb";
import { normalizeId } from "@/lib/utils/mongo";
import { isValidEmail, isValidOtpCode } from "@/lib/utils/validation";

const cookieName = "wishmate-group-gift-guest";
const otpLifetimeMilliseconds = 10 * 60 * 1000;
const guestSessionLifetimeMilliseconds = 24 * 60 * 60 * 1000;
const requestCooldownMilliseconds = 60 * 1000;
const maxVerificationAttempts = 5;

let indexSetupPromise;

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function getOtpSecret() {
  const secret = process.env.GROUP_GIFT_OTP_SECRET || process.env.BETTER_AUTH_SECRET;

  if (!secret || secret.length < 16) {
    throw new Error("이메일 인증 보안 키 설정을 확인해 주세요.");
  }

  return secret;
}

function hashOtp({ challengeId, groupGiftId, email, code }) {
  return createHmac("sha256", getOtpSecret())
    .update(`${challengeId}:${normalizeId(groupGiftId)}:${email}:${code}`)
    .digest("hex");
}

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function safelyMatchesHash(expectedHash, receivedHash) {
  const expected = Buffer.from(expectedHash, "hex");
  const received = Buffer.from(receivedHash, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function ensureIndexes(db) {
  if (!indexSetupPromise) {
    indexSetupPromise = Promise.all([
      db.collection("groupGiftOtpChallenges").createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 },
      ),
      db.collection("groupGiftOtpChallenges").createIndex({
        groupGiftId: 1,
        email: 1,
        createdAt: -1,
      }),
      db.collection("groupGiftGuestSessions").createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 },
      ),
      db.collection("groupGiftGuestSessions").createIndex(
        { tokenHash: 1 },
        { unique: true },
      ),
    ]).catch((error) => {
      indexSetupPromise = null;
      throw error;
    });
  }

  return indexSetupPromise;
}

async function sendOtpEmail({ challengeId, email, code }) {
  const provider = process.env.GROUP_GIFT_OTP_PROVIDER || "mock";

  if (provider === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("운영 환경에서는 이메일 발송 제공자를 설정해 주세요.");
    }

    return { demoCode: code };
  }

  if (provider !== "resend") {
    throw new Error("지원하지 않는 이메일 발송 제공자입니다.");
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.GROUP_GIFT_OTP_FROM;

  if (!apiKey || !from) {
    throw new Error("Resend 이메일 발송 설정을 확인해 주세요.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `wishmate-group-gift-${challengeId}`,
      "User-Agent": "WishMate/0.1.0",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "[WishMate] 함께 선물하기 인증번호",
      text: `WishMate 함께 선물하기 인증번호는 ${code}입니다. 인증번호는 10분 동안 유효합니다.`,
    }),
  });

  if (!response.ok) {
    throw new Error("인증 이메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  return { demoCode: "" };
}

export async function requestGuestGroupGiftOtp(groupGiftId, email) {
  const normalizedGroupGiftId = normalizeId(groupGiftId);
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedGroupGiftId || !isValidEmail(normalizedEmail)) {
    throw new Error("올바른 이메일을 입력해 주세요.");
  }

  const db = await getDatabase();
  await ensureIndexes(db);

  const now = new Date();
  const recentChallenge = await db.collection("groupGiftOtpChallenges").findOne({
    groupGiftId: normalizedGroupGiftId,
    email: normalizedEmail,
    createdAt: { $gt: new Date(now.getTime() - requestCooldownMilliseconds) },
  });

  if (recentChallenge) {
    throw new Error("인증번호는 1분 후 다시 요청할 수 있습니다.");
  }

  const challengeId = new ObjectId();
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + otpLifetimeMilliseconds);
  const challenge = {
    _id: challengeId,
    groupGiftId: normalizedGroupGiftId,
    email: normalizedEmail,
    codeHash: hashOtp({
      challengeId: challengeId.toHexString(),
      groupGiftId: normalizedGroupGiftId,
      email: normalizedEmail,
      code,
    }),
    attempts: 0,
    consumedAt: null,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection("groupGiftOtpChallenges").insertOne(challenge);

  try {
    const delivery = await sendOtpEmail({
      challengeId: challengeId.toHexString(),
      email: normalizedEmail,
      code,
    });
    return { email: normalizedEmail, expiresAt, demoCode: delivery.demoCode };
  } catch (error) {
    await db.collection("groupGiftOtpChallenges").deleteOne({ _id: challengeId });
    throw error;
  }
}

export async function verifyGuestGroupGiftOtp(groupGiftId, email, code) {
  const normalizedGroupGiftId = normalizeId(groupGiftId);
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = String(code ?? "").trim();

  if (!isValidEmail(normalizedEmail) || !isValidOtpCode(normalizedCode)) {
    throw new Error("이메일과 6자리 인증번호를 확인해 주세요.");
  }

  const db = await getDatabase();
  await ensureIndexes(db);

  const now = new Date();
  const challenge = await db.collection("groupGiftOtpChallenges").findOne(
    {
      groupGiftId: normalizedGroupGiftId,
      email: normalizedEmail,
      consumedAt: null,
      expiresAt: { $gt: now },
      attempts: { $lt: maxVerificationAttempts },
    },
    { sort: { createdAt: -1 } },
  );

  if (!challenge) {
    throw new Error("인증번호가 만료되었거나 요청 내역이 없습니다.");
  }

  const receivedHash = hashOtp({
    challengeId: challenge._id.toHexString(),
    groupGiftId: normalizedGroupGiftId,
    email: normalizedEmail,
    code: normalizedCode,
  });

  if (!safelyMatchesHash(challenge.codeHash, receivedHash)) {
    const attempts = challenge.attempts + 1;
    await db.collection("groupGiftOtpChallenges").updateOne(
      { _id: challenge._id, consumedAt: null },
      { $set: { attempts, updatedAt: now } },
    );
    const remainingAttempts = maxVerificationAttempts - attempts;
    throw new Error(
      remainingAttempts > 0
        ? `인증번호가 일치하지 않습니다. ${remainingAttempts}회 더 시도할 수 있습니다.`
        : "인증 시도 횟수를 초과했습니다. 인증번호를 다시 요청해 주세요.",
    );
  }

  const consumed = await db.collection("groupGiftOtpChallenges").updateOne(
    { _id: challenge._id, consumedAt: null },
    { $set: { consumedAt: now, updatedAt: now } },
  );

  if (consumed.modifiedCount !== 1) {
    throw new Error("이미 사용된 인증번호입니다. 인증번호를 다시 요청해 주세요.");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + guestSessionLifetimeMilliseconds);

  await db.collection("groupGiftGuestSessions").deleteMany({
    groupGiftId: normalizedGroupGiftId,
    email: normalizedEmail,
  });
  await db.collection("groupGiftGuestSessions").insertOne({
    groupGiftId: normalizedGroupGiftId,
    email: normalizedEmail,
    tokenHash: hashSessionToken(token),
    verifiedAt: now,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  const cookieStore = await cookies();
  cookieStore.set({
    name: cookieName,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: guestSessionLifetimeMilliseconds / 1000,
  });

  return { email: normalizedEmail, expiresAt };
}

export async function getGuestGroupGiftSession(groupGiftId) {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    return null;
  }

  const db = await getDatabase();
  const session = await db.collection("groupGiftGuestSessions").findOne({
    tokenHash: hashSessionToken(token),
    groupGiftId: normalizeId(groupGiftId),
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    return null;
  }

  return {
    id: normalizeId(session._id),
    groupGiftId: normalizeId(session.groupGiftId),
    email: session.email,
    expiresAt: session.expiresAt?.toISOString?.() ?? session.expiresAt,
  };
}

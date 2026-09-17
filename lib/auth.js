import { createHash } from "node:crypto";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { getMongoClient } from "@/lib/mongodb";

const client = getMongoClient();
const db = client.db(process.env.MONGODB_DB);
const useMongoTransactions = process.env.MONGODB_TRANSACTIONS === "true";

async function sendEmailOtp({ email, otp }) {
  const provider = process.env.EMAIL_OTP_PROVIDER
    || process.env.GROUP_GIFT_OTP_PROVIDER
    || "mock";

  if (provider === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("운영 환경에서는 이메일 발송 제공자를 설정해 주세요.");
    }

    return;
  }

  if (provider !== "resend") {
    throw new Error("지원하지 않는 이메일 발송 제공자입니다.");
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_OTP_FROM || process.env.GROUP_GIFT_OTP_FROM;

  if (!apiKey || !from) {
    throw new Error("Resend 이메일 발송 설정을 확인해 주세요.");
  }

  const idempotencyKey = createHash("sha256")
    .update(`${email}:${otp}`)
    .digest("hex");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `wishmate-email-otp-${idempotencyKey}`,
      "User-Agent": "WishMate/0.1.0",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "[WishMate] 이메일 인증번호",
      text: `WishMate 이메일 인증번호는 ${otp}입니다. 인증번호는 10분 동안 유효합니다.`,
    }),
  });

  if (!response.ok) {
    throw new Error("인증 이메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

export const auth = betterAuth({
  database: mongodbAdapter(db, {
    client,
    // 단독 MongoDB는 트랜잭션을 지원하지 않는다. replica set 또는 mongos에서만 활성화한다.
    transaction: useMongoTransactions,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    additionalFields: {
      accessMode: {
        type: "string",
        required: false,
        defaultValue: "gift",
        input: false,
      },
    },
  },
  plugins: [
    emailOTP({
      sendVerificationOTP: sendEmailOtp,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      storeOTP: "encrypted",
    }),
    nextCookies(),
  ],
});

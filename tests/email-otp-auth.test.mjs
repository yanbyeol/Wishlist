import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");

function loadSource(path, dependencies, globals = {}) {
  const filename = fileURLToPath(new URL(`../${path}`, import.meta.url));
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename,
    jsc: {
      parser: { syntax: "ecmascript", jsx: true },
      target: "es2022",
    },
    module: { type: "commonjs" },
  });
  const sourceModule = { exports: {} };
  runInNewContext(code, {
    module: sourceModule,
    exports: sourceModule.exports,
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error(`테스트에 등록되지 않은 의존성: ${name}`);
    },
    ...globals,
  });
  return sourceModule.exports;
}

test("사용자 이메일은 조회 전에 trim과 소문자 정규화를 적용하고 unique index를 만든다", async () => {
  const calls = { indexes: [], emailQueries: [] };
  const db = {
    collection(name) {
      assert.equal(name, "user");
      return {
        async createIndex(keys, options) {
          calls.indexes.push({ keys, options });
          return options.name;
        },
        async findOne(query) {
          calls.emailQueries.push(query);
          return {
            _id: "existing-user-id",
            email: query.email,
            name: "기존 사용자",
            role: "user",
          };
        },
      };
    },
  };
  const users = loadSource("lib/users.js", {
    "@/lib/mongodb": { getDatabase: async () => db },
    "@/lib/utils/mongo": {
      documentIdFilter: (id) => ({ _id: id }),
      normalizeId: String,
    },
  });

  assert.equal(users.normalizeUserEmail("  Friend@Example.COM "), "friend@example.com");
  await users.ensureUniqueUserEmailIndex();
  const user = await users.findUserByEmail("  Friend@Example.COM ");

  assert.equal(user.id, "existing-user-id");
  assert.equal(calls.emailQueries.length, 1);
  assert.equal(calls.emailQueries[0].email, "friend@example.com");
  assert.equal(calls.indexes.length, 1);
  assert.equal(calls.indexes[0].options.unique, true);
  assert.equal(calls.indexes[0].options.name, "user_email_unique");
});

function loadEmailOtpFunctions() {
  const calls = {
    indexChecks: 0,
    otpRequests: [],
    otpReads: [],
    signIns: [],
    wishlists: [],
    contributionUpdates: [],
  };
  const auth = {
    api: {
      async sendVerificationOTP(input) {
        calls.otpRequests.push(input);
      },
      async getVerificationOTP(input) {
        calls.otpReads.push(input);
        return { otp: "123456" };
      },
      async signInEmailOTP(input) {
        calls.signIns.push(input);
        return {
          token: "signed-session-token",
          user: {
            id: "existing-user-id",
            email: input.body.email,
            name: "기존 사용자",
          },
        };
      },
    },
  };
  const db = {
    collection(name) {
      assert.equal(name, "contributions");
      return {
        async updateMany(query, update) {
          calls.contributionUpdates.push({ query, update });
          return { modifiedCount: 0 };
        },
      };
    },
  };
  const functions = loadSource("lib/group-gift-otp.js", {
    "server-only": {},
    "next/headers": { headers: async () => ({ "x-test": "headers" }) },
    "@/lib/auth": { auth },
    "@/lib/mongodb": { getDatabase: async () => db },
    "@/lib/users": {
      async ensureUniqueUserEmailIndex() {
        calls.indexChecks += 1;
      },
      normalizeUserEmail: (email) => String(email ?? "").trim().toLowerCase(),
    },
    "@/lib/utils/mongo": {
      normalizeId: (value) => value == null ? "" : String(value),
    },
    "@/lib/utils/validation": {
      isValidEmail: (email) => email.includes("@"),
      isValidOtpCode: (code) => /^\d{6}$/.test(code),
    },
    "@/lib/wishlists": {
      async ensureWishlist(user) {
        calls.wishlists.push(user);
      },
    },
  }, {
    process: {
      env: { NODE_ENV: "test", EMAIL_OTP_PROVIDER: "mock" },
    },
  });

  return { functions, calls };
}

test("이메일 OTP 요청은 정규화된 이메일과 Better Auth sign-in 타입을 사용한다", async () => {
  const { functions, calls } = loadEmailOtpFunctions();

  const result = await functions.requestEmailSignInOtp("  Friend@Example.COM ");

  assert.equal(result.email, "friend@example.com");
  assert.equal(result.demoCode, "123456");
  assert.equal(calls.indexChecks, 1);
  assert.equal(calls.otpRequests[0].body.email, "friend@example.com");
  assert.equal(calls.otpRequests[0].body.type, "sign-in");
  assert.equal(calls.otpReads[0].query.email, "friend@example.com");
  assert.equal(calls.otpReads[0].query.type, "sign-in");
});

test("이메일 OTP 인증은 Better Auth의 기존 사용자 ID로 세션을 만들고 과거 참여도 연결한다", async () => {
  const { functions, calls } = loadEmailOtpFunctions();

  const first = await functions.verifyEmailSignInOtp(
    "  Friend@Example.COM ",
    "123456",
  );
  const second = await functions.verifyEmailSignInOtp(
    "friend@example.com",
    "123456",
  );

  assert.equal(first.user.id, "existing-user-id");
  assert.equal(second.user.id, "existing-user-id");
  assert.equal(calls.signIns.length, 2);
  assert.equal(calls.signIns[0].body.email, "friend@example.com");
  assert.equal(calls.wishlists[0].id, "existing-user-id");
  assert.equal(
    calls.contributionUpdates[0].query.guestEmail,
    "friend@example.com",
  );
  assert.equal(calls.contributionUpdates[0].query.userId, null);
  assert.equal(
    calls.contributionUpdates[0].update.$set.userId,
    "existing-user-id",
  );
  assert.equal(calls.contributionUpdates[0].update.$set.participantType, "member");
});

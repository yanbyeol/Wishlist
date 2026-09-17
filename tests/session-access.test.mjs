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
    URLSearchParams,
    require(name) {
      if (name in dependencies) return dependencies[name];
      throw new Error(`테스트에 등록되지 않은 의존성: ${name}`);
    },
    ...globals,
  });
  return sourceModule.exports;
}

function loadSession(sessionValue) {
  const updates = [];
  const redirects = [];
  const session = loadSource("lib/session.js", {
    "next/headers": { headers: async () => ({}) },
    "next/navigation": {
      redirect(path) {
        redirects.push(path);
        throw new Error(`REDIRECT:${path}`);
      },
    },
    "@/lib/auth": {
      auth: { api: { getSession: async () => sessionValue } },
    },
    "@/lib/mongodb": {
      getDatabase: async () => ({
        collection(name) {
          assert.equal(name, "session");
          return {
            async updateOne(filter, update) {
              updates.push({ filter, update });
              return { matchedCount: 1 };
            },
          };
        },
      }),
    },
  });

  return { session, redirects, updates };
}

test("현재 세션의 accessMode로 일반 회원과 선물 간편 사용자를 구분한다", async () => {
  const member = loadSession({
    user: { id: "user-id", name: "회원" },
    session: { accessMode: "member" },
  });
  const gift = loadSession({
    user: { id: "user-id", name: "간편 사용자" },
    session: { accessMode: "gift" },
  });
  const legacy = loadSession({
    user: { id: "user-id", name: "구분 전 세션" },
    session: {},
  });

  assert.equal((await member.session.getCurrentUser()).isMember, true);
  assert.equal((await member.session.getCurrentMember()).id, "user-id");
  assert.equal((await gift.session.getCurrentUser()).isMember, false);
  assert.equal(await gift.session.getCurrentMember(), null);
  assert.equal((await legacy.session.getCurrentUser()).accessMode, "gift");
});

test("선물 간편 인증 세션은 회원 전용 접근 시 로그인 안내로 이동한다", async () => {
  const { session, redirects } = loadSession({
    user: { id: "gift-user-id" },
    session: { accessMode: "gift" },
  });

  await assert.rejects(
    session.requireMember("/seller/products"),
    /REDIRECT:\/login\?callback=%2Fseller%2Fproducts&notice=member-required/,
  );
  assert.deepEqual(redirects, [
    "/login?callback=%2Fseller%2Fproducts&notice=member-required",
  ]);
});

test("세션 권한은 검증된 세션 token에만 저장한다", async () => {
  const { session, updates } = loadSession(null);
  await session.setSessionAccessMode("session-token", "member");

  assert.equal(updates.length, 1);
  assert.equal(updates[0].filter.token, "session-token");
  assert.equal(updates[0].update.$set.accessMode, "member");
  await assert.rejects(
    session.setSessionAccessMode("session-token", "admin"),
    /세션 권한을 확인할 수 없습니다/,
  );
});

test("일반 로그인 화면에는 이메일 OTP 로그인이 노출되지 않는다", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../app/(auth)/auth-form.js", import.meta.url)),
    "utf8",
  );

  assert.equal(source.includes("requestEmailOtpAction"), false);
  assert.equal(source.includes("verifyEmailOtpAction"), false);
  assert.equal(source.includes("이메일 인증으로 로그인"), false);
});

function loadAuthActions() {
  const calls = {
    otpRequests: [],
    otpVerifications: [],
    accessModes: [],
    redirects: [],
  };
  const actions = loadSource("app/(auth)/actions.js", {
    "next/headers": { headers: async () => ({}) },
    "next/navigation": {
      redirect(path) {
        calls.redirects.push(path);
        throw new Error(`REDIRECT:${path}`);
      },
    },
    "@/lib/auth": {
      auth: {
        api: {
          signInEmail: async () => ({ token: "password-session" }),
          signUpEmail: async () => ({ token: "signup-session", user: { id: "new-user" } }),
          signOut: async () => null,
        },
      },
    },
    "@/lib/group-gift-otp": {
      async requestEmailSignInOtp(email) {
        calls.otpRequests.push(email);
        return { email, demoCode: "123456" };
      },
      async verifyEmailSignInOtp(email, code) {
        calls.otpVerifications.push({ email, code });
      },
    },
    "@/lib/session": {
      SESSION_ACCESS_MODES: { GIFT: "gift", MEMBER: "member" },
      async setSessionAccessMode(token, accessMode) {
        calls.accessModes.push({ token, accessMode });
      },
    },
    "@/lib/users": {
      normalizeUserEmail: (email) => String(email ?? "").trim().toLowerCase(),
    },
    "@/lib/wishlists": { ensureWishlist: async () => null },
    "@/lib/utils/validation": {
      isValidEmail: (email) => email.includes("@"),
      isValidOtpCode: (code) => /^\d{6}$/.test(code),
    },
    "@/lib/utils/format": {
      sanitizeCallbackPath(value, fallback = "/") {
        return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
          ? value
          : fallback;
      },
    },
  }, { FormData });

  return { actions, calls };
}

test("공용 로그인 경로에서는 OTP 요청을 거부하고 선물 시작 경로에서만 허용한다", async () => {
  const { actions, calls } = loadAuthActions();
  const blocked = new FormData();
  blocked.set("email", "friend@example.com");
  blocked.set("callback", "/wishlist");
  const blockedResult = await actions.requestEmailOtpAction({}, blocked);

  assert.equal(blockedResult.error, true);
  assert.equal(calls.otpRequests.length, 0);

  const allowed = new FormData();
  allowed.set("email", " Friend@Example.com ");
  allowed.set("callback", "/orders/new?product=product-id");
  const allowedResult = await actions.requestEmailOtpAction({}, allowed);

  assert.equal(allowedResult.requested, true);
  assert.deepEqual(calls.otpRequests, ["friend@example.com"]);
});

test("비밀번호 로그인으로 만든 세션만 일반 회원 권한으로 승격한다", async () => {
  const { actions, calls } = loadAuthActions();
  const formData = new FormData();
  formData.set("email", "member@example.com");
  formData.set("password", "12345678");
  formData.set("callback", "/wishlist");

  await assert.rejects(
    actions.signInAction({}, formData),
    /REDIRECT:\/wishlist/,
  );
  assert.deepEqual(calls.accessModes, [{
    token: "password-session",
    accessMode: "member",
  }]);
});

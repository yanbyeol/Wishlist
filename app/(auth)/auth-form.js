"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  requestEmailOtpAction,
  signInAction,
  signUpAction,
  verifyEmailOtpAction,
} from "@/app/(auth)/actions";

const initialState = { message: "" };

function EmailOtpSignInForm({ callback }) {
  const [requestState, requestFormAction, requestPending] = useActionState(
    requestEmailOtpAction,
    initialState,
  );
  const [verifyState, verifyFormAction, verifyPending] = useActionState(
    verifyEmailOtpAction,
    initialState,
  );

  return (
    <div className="auth-email-otp">
      <div className="auth-method-divider"><span>또는 이메일 간편 인증</span></div>
      <form action={requestFormAction} className="stack-form">
        <input type="hidden" name="callback" value={callback} />
        <label className="field">
          <span>이메일</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={requestState?.email ?? ""}
            placeholder="hello@example.com"
            required
          />
        </label>
        <p
          className={`form-message ${requestState?.error ? "error-message" : ""}`}
          aria-live="polite"
        >
          {requestState?.message}
        </p>
        <button className="button button-secondary button-full" type="submit" disabled={requestPending}>
          {requestPending ? "인증번호를 보내는 중..." : "인증번호 받기"}
        </button>
      </form>

      {requestState?.requested && (
        <form action={verifyFormAction} className="stack-form otp-verification-form">
          <input type="hidden" name="email" value={requestState.email} />
          <input type="hidden" name="callback" value={requestState.callback ?? callback} />
          <label className="field">
            <span>6자리 인증번호</span>
            <input
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              minLength="6"
              maxLength="6"
              pattern="[0-9]{6}"
              placeholder="000000"
              required
            />
          </label>
          <p className="form-message error-message" aria-live="polite">
            {verifyState?.message}
          </p>
          <button className="button button-primary button-full" type="submit" disabled={verifyPending}>
            {verifyPending ? "인증하는 중..." : "이메일 인증으로 로그인"}
          </button>
        </form>
      )}
      <p className="auth-email-otp-help">
        인증을 마치면 비밀번호 없이 같은 이메일 계정으로 계속 이용할 수 있어요.
      </p>
    </div>
  );
}

export default function AuthForm({ mode, callback }) {
  const isSignup = mode === "signup";
  const action = isSignup ? signUpAction : signInAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const alternatePath = isSignup ? "/login" : "/signup";
  const alternateQuery = callback !== "/" ? `?callback=${encodeURIComponent(callback)}` : "";

  return (
    <>
      <form action={formAction} className="stack-form">
        <input type="hidden" name="callback" value={callback} />
        {isSignup && (
          <label className="field">
            <span>이름</span>
            <input name="name" type="text" autoComplete="name" minLength="2" placeholder="위시메이트" required />
          </label>
        )}
        <label className="field">
          <span>이메일</span>
          <input name="email" type="email" autoComplete="email" placeholder="hello@example.com" required />
        </label>
        <label className="field">
          <span>비밀번호</span>
          <input
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength="8"
            placeholder="8자 이상 입력"
            required
          />
        </label>
        {isSignup && (
          <label className="field">
            <span>비밀번호 확인</span>
            <input name="passwordConfirm" type="password" autoComplete="new-password" minLength="8" required />
          </label>
        )}
        <p className="form-message error-message" aria-live="polite">{state?.message}</p>
        <button className="button button-primary button-full" type="submit" disabled={pending}>
          {pending ? "처리 중..." : isSignup ? "회원가입" : "로그인"}
        </button>
      </form>
      {!isSignup && <EmailOtpSignInForm callback={callback} />}
      <p className="auth-alternate">
        {isSignup ? "이미 계정이 있으신가요?" : "계정이 없으신가요?"}{" "}
        <Link href={`${alternatePath}${alternateQuery}`}>
          {isSignup ? "로그인" : "회원가입"}
        </Link>
      </p>
    </>
  );
}

"use client";

import { useActionState } from "react";
import {
  requestEmailOtpAction,
  verifyEmailOtpAction,
} from "@/app/(auth)/actions";

const initialState = { message: "" };

export default function GiftEmailAuthForm({
  callback,
  description = "선물하기에 사용할 이메일을 인증해 주세요.",
}) {
  const [requestState, requestFormAction, requestPending] = useActionState(
    requestEmailOtpAction,
    initialState,
  );
  const [verifyState, verifyFormAction, verifyPending] = useActionState(
    verifyEmailOtpAction,
    initialState,
  );

  return (
    <div className="guest-otp-section">
      <div>
        <h2>이메일로 간편 인증</h2>
        <p>{description}</p>
      </div>
      <form action={requestFormAction} className="stack-form">
        <input type="hidden" name="callback" value={callback} />
        <label className="field">
          <span>이메일</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={requestState?.email ?? ""}
            placeholder="friend@example.com"
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
            {verifyPending ? "인증하는 중..." : "인증하고 선물하기"}
          </button>
        </form>
      )}
      <p className="muted-copy">
        간편 인증은 선물하기에만 사용되며 회원 전용 기능은 이용할 수 없습니다.
      </p>
    </div>
  );
}

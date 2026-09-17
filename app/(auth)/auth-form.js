"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  signInAction,
  signUpAction,
} from "@/app/(auth)/actions";

const initialState = { message: "" };

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
      <p className="auth-alternate">
        {isSignup ? "이미 계정이 있으신가요?" : "계정이 없으신가요?"}{" "}
        <Link href={`${alternatePath}${alternateQuery}`}>
          {isSignup ? "로그인" : "회원가입"}
        </Link>
      </p>
    </>
  );
}

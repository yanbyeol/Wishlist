"use client";

import { useActionState, useState } from "react";
import {
  contributeGroupGiftAction,
  createGroupGiftAction,
  requestGroupGiftOtpAction,
  retryGroupGiftPaymentAction,
  verifyGroupGiftOtpAction,
} from "@/app/group-gifts/actions";
import { formatWon } from "@/lib/utils/format";

const initialState = { message: "" };

export function CreateGroupGiftForm({ product, recipient, from }) {
  const [state, formAction, pending] = useActionState(createGroupGiftAction, initialState);

  return (
    <form action={formAction} className="stack-form form-card">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="recipientId" value={recipient.id} />
      <input type="hidden" name="from" value={from} />
      <div className="recipient-summary">
        <span>선물을 받을 친구</span>
        <strong>{recipient.name}</strong>
        <small>목표 금액 {formatWon(product.price)} · 모집 기간 14일</small>
      </div>
      <label className="field">
        <span>함께 선물하기 제목</span>
        <input
          name="title"
          type="text"
          minLength="2"
          maxLength="60"
          defaultValue={`${recipient.name}님을 위한 ${product.name}`}
          required
        />
      </label>
      <div className="demo-notice">
        <strong>목업 결제 안내</strong>
        <span>참여 금액은 실제로 결제되지 않으며 목표 달성 시 선물 준비 완료로 처리됩니다.</span>
      </div>
      <p className="form-message error-message" aria-live="polite">{state?.message}</p>
      <button className="button button-primary button-full" type="submit" disabled={pending}>
        {pending ? "함께 선물하기를 만드는 중..." : "함께 선물하기 시작"}
      </button>
    </form>
  );
}

export function GuestOtpForm({ groupGiftId }) {
  const requestAction = requestGroupGiftOtpAction.bind(null, groupGiftId);
  const verifyAction = verifyGroupGiftOtpAction.bind(null, groupGiftId);
  const [requestState, requestFormAction, requestPending] = useActionState(
    requestAction,
    initialState,
  );
  const [verifyState, verifyFormAction, verifyPending] = useActionState(
    verifyAction,
    initialState,
  );

  return (
    <div className="guest-otp-section">
      <div>
        <h2>이메일로 간편 인증</h2>
        <p>회원가입 없이 이 함께 선물하기에만 참여할 수 있어요.</p>
      </div>
      <form action={requestFormAction} className="stack-form">
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
            {verifyPending ? "인증하는 중..." : "인증하고 참여하기"}
          </button>
        </form>
      )}
    </div>
  );
}

function ContributionComplete({ onAdditionalContribution }) {
  return (
    <div className="stack-form">
      <strong>참여했습니다.</strong>
      <p className="muted-copy">마음을 더 보태고 싶다면 추가로 참여할 수 있어요.</p>
      <button
        className="button button-secondary button-full"
        type="button"
        onClick={onAdditionalContribution}
      >
        추가 참여하기
      </button>
    </div>
  );
}

function ContributionAttempt({ groupGift, defaultNickname, onAdditionalContribution }) {
  const action = contributeGroupGiftAction.bind(null, groupGift.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const remaining = groupGift.targetAmount - groupGift.currentAmount;

  if (state?.success) {
    return <ContributionComplete onAdditionalContribution={onAdditionalContribution} />;
  }

  return (
    <form action={formAction} className="stack-form contribution-form">
      <label className="field">
        <span>참여 금액</span>
        <div className="input-with-suffix">
          <input name="amount" type="number" min="1" max={remaining} step="1" placeholder="10000" required />
          <span>원</span>
        </div>
        <small>남은 목표 금액은 {formatWon(remaining)}입니다.</small>
      </label>
      <label className="field">
        <span>공개 닉네임</span>
        <input name="nickname" type="text" minLength="2" maxLength="20" defaultValue={defaultNickname} required />
      </label>
      <label className="field">
        <span>축하 메시지 (선택)</span>
        <textarea name="message" rows="4" maxLength="300" placeholder="함께 전할 마음을 남겨 주세요." />
      </label>
      <p className="form-message error-message" aria-live="polite">{state?.message}</p>
      <button className="button button-primary button-full" type="submit" disabled={pending}>
        {pending ? "목업 결제 중..." : "이 금액으로 참여하기"}
      </button>
    </form>
  );
}

export function ContributionForm({ groupGift, defaultNickname, initialHasContribution }) {
  const [attemptNumber, setAttemptNumber] = useState(initialHasContribution ? null : 0);

  if (attemptNumber === null) {
    return (
      <ContributionComplete
        onAdditionalContribution={() => setAttemptNumber(0)}
      />
    );
  }

  return (
    <ContributionAttempt
      key={attemptNumber}
      groupGift={groupGift}
      defaultNickname={defaultNickname}
      onAdditionalContribution={() => setAttemptNumber((current) => current + 1)}
    />
  );
}

export function RetryGroupGiftForm({ groupGiftId }) {
  const action = retryGroupGiftPaymentAction.bind(null, groupGiftId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="stack-form">
      <p className="form-message error-message" aria-live="polite">{state?.message}</p>
      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? "다시 처리하는 중..." : "데모 결제 다시 처리"}
      </button>
    </form>
  );
}

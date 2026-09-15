"use client";

import { useActionState } from "react";
import {
  contributeGroupGiftAction,
  createGroupGiftAction,
  retryGroupGiftPaymentAction,
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
        <span>같이 선물 제목</span>
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
        {pending ? "같이 선물을 만드는 중..." : "같이 선물하기 시작"}
      </button>
    </form>
  );
}

export function ContributionForm({ groupGift, user }) {
  const action = contributeGroupGiftAction.bind(null, groupGift.id);
  const [state, formAction, pending] = useActionState(action, initialState);
  const remaining = groupGift.targetAmount - groupGift.currentAmount;

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
        <input name="nickname" type="text" minLength="2" maxLength="20" defaultValue={user.name} required />
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

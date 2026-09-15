"use client";

import { useActionState } from "react";
import { acceptGiftAction } from "@/app/gifts/actions";

const initialState = { message: "" };

export default function AcceptGiftForm({ token, address, userName }) {
  const action = acceptGiftAction.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="stack-form form-card">
      {address && <p className="notice-banner">기본 배송지 ‘{address.label}’을 불러왔어요.</p>}
      <div className="form-grid two-columns">
        <label className="field">
          <span>받는 분</span>
          <input name="recipientName" type="text" minLength="2" maxLength="30" defaultValue={address?.recipientName ?? userName} required />
        </label>
        <label className="field">
          <span>연락처</span>
          <input name="phone" type="tel" defaultValue={address?.phone ?? ""} placeholder="010-1234-5678" required />
        </label>
        <label className="field">
          <span>우편번호</span>
          <input name="postalCode" inputMode="numeric" defaultValue={address?.postalCode ?? ""} placeholder="12345" required />
        </label>
        <span className="field form-spacer" aria-hidden="true" />
        <label className="field field-wide">
          <span>기본 주소</span>
          <input name="address1" type="text" maxLength="100" defaultValue={address?.address1 ?? ""} required />
        </label>
        <label className="field field-wide">
          <span>상세 주소</span>
          <input name="address2" type="text" maxLength="100" defaultValue={address?.address2 ?? ""} />
        </label>
      </div>
      <p className="form-message error-message" aria-live="polite">{state?.message}</p>
      <button className="button button-primary button-full" type="submit" disabled={pending}>
        {pending ? "선물을 수락하는 중..." : "선물 수락하고 배송 요청"}
      </button>
    </form>
  );
}

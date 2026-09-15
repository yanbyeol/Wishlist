"use client";

import { useActionState } from "react";
import { createAddressAction } from "@/app/mypage/addresses/actions";

const initialState = { message: "" };

export default function AddressForm({ userName }) {
  const [state, formAction, pending] = useActionState(createAddressAction, initialState);

  return (
    <form action={formAction} className="stack-form form-card">
      <div className="form-grid two-columns">
        <label className="field">
          <span>배송지 이름</span>
          <input name="label" type="text" maxLength="20" placeholder="집, 회사" required />
        </label>
        <label className="field">
          <span>받는 분</span>
          <input name="recipientName" type="text" minLength="2" maxLength="30" defaultValue={userName} required />
        </label>
        <label className="field">
          <span>연락처</span>
          <input name="phone" type="tel" placeholder="010-1234-5678" required />
        </label>
        <label className="field">
          <span>우편번호</span>
          <input name="postalCode" inputMode="numeric" placeholder="12345" required />
        </label>
        <label className="field field-wide">
          <span>기본 주소</span>
          <input name="address1" type="text" maxLength="100" placeholder="시/도, 시/군/구, 도로명 주소" required />
        </label>
        <label className="field field-wide">
          <span>상세 주소</span>
          <input name="address2" type="text" maxLength="100" placeholder="동, 호수 등" />
        </label>
      </div>
      <label className="checkbox-field"><input name="isDefault" type="checkbox" /><span>기본 배송지로 저장</span></label>
      <p className="form-message error-message" aria-live="polite">{state?.message}</p>
      <button className="button button-primary button-full" type="submit" disabled={pending}>
        {pending ? "저장 중..." : "배송지 저장"}
      </button>
    </form>
  );
}

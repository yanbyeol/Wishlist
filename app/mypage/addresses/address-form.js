"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createAddressAction,
  updateAddressAction,
} from "@/app/mypage/addresses/actions";

const initialState = { message: "" };

export default function AddressForm({ userName, address = null }) {
  const submitAction = address ? updateAddressAction : createAddressAction;
  const [state, formAction, pending] = useActionState(submitAction, initialState);
  const [fields, setFields] = useState({
    label: address?.label ?? "",
    recipientName: address?.recipientName ?? userName,
    phone: address?.phone ?? "",
    postalCode: address?.postalCode ?? "",
    address1: address?.address1 ?? "",
    address2: address?.address2 ?? "",
    isDefault: address?.isDefault ?? false,
  });

  function updateField(event) {
    const { name, type, value, checked } = event.target;
    setFields((currentFields) => ({
      ...currentFields,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  return (
    <form action={formAction} className="stack-form form-card">
      {address && <input type="hidden" name="addressId" value={address.id} />}
      <div className="form-grid two-columns">
        <label className="field">
          <span>배송지 이름</span>
          <input name="label" type="text" maxLength="20" value={fields.label} onChange={updateField} placeholder="집, 회사" required />
        </label>
        <label className="field">
          <span>받는 분</span>
          <input name="recipientName" type="text" minLength="2" maxLength="30" value={fields.recipientName} onChange={updateField} required />
        </label>
        <label className="field">
          <span>연락처</span>
          <input name="phone" type="tel" value={fields.phone} onChange={updateField} placeholder="010-1234-5678" required />
        </label>
        <label className="field">
          <span>우편번호</span>
          <input name="postalCode" inputMode="numeric" value={fields.postalCode} onChange={updateField} placeholder="12345" required />
        </label>
        <label className="field field-wide">
          <span>기본 주소</span>
          <input name="address1" type="text" maxLength="100" value={fields.address1} onChange={updateField} placeholder="시/도, 시/군/구, 도로명 주소" required />
        </label>
        <label className="field field-wide">
          <span>상세 주소</span>
          <input name="address2" type="text" maxLength="100" value={fields.address2} onChange={updateField} placeholder="동, 호수 등" />
        </label>
      </div>
      <label className="checkbox-field">
        <input name="isDefault" type="checkbox" checked={fields.isDefault} onChange={updateField} />
        <span>기본 배송지로 저장</span>
      </label>
      <p className="form-message error-message" aria-live="polite">{state?.message}</p>
      <button className="button button-primary button-full" type="submit" disabled={pending}>
        {pending ? "저장 중..." : address ? "배송지 수정" : "배송지 저장"}
      </button>
      {address && <Link href="/mypage/addresses" className="button button-secondary button-full">수정 취소</Link>}
    </form>
  );
}

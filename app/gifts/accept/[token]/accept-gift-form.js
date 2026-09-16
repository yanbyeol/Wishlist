"use client";

import { useActionState, useState } from "react";
import { acceptGiftAction } from "@/app/gifts/actions";

const initialState = { message: "" };

function shippingFields(address, userName) {
  return {
    recipientName: address?.recipientName ?? userName,
    phone: address?.phone ?? "",
    postalCode: address?.postalCode ?? "",
    address1: address?.address1 ?? "",
    address2: address?.address2 ?? "",
  };
}

export default function AcceptGiftForm({ token, addresses, userName }) {
  const action = acceptGiftAction.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);
  const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress?.id ?? "new");
  const [fields, setFields] = useState(shippingFields(defaultAddress, userName));

  function selectAddress(address) {
    setSelectedAddressId(address?.id ?? "new");
    setFields(shippingFields(address, userName));
  }

  function updateField(event) {
    const { name, value } = event.target;
    setFields((currentFields) => ({ ...currentFields, [name]: value }));
  }

  return (
    <form action={formAction} className="stack-form form-card">
      <fieldset className="address-choice-list">
        <legend>배송지 선택</legend>
        {addresses.map((address) => (
          <label
            className={`address-choice${selectedAddressId === address.id ? " selected" : ""}`}
            key={address.id}
          >
            <input
              name="addressChoice"
              type="radio"
              value={address.id}
              checked={selectedAddressId === address.id}
              onChange={() => selectAddress(address)}
            />
            <span className="address-choice-copy">
              <strong>{address.isDefault ? "기본 배송지" : "저장된 다른 배송지"}</strong>
              <span>{address.label} · {address.recipientName}</span>
              <small>({address.postalCode}) {address.address1} {address.address2}</small>
            </span>
          </label>
        ))}
        <label className={`address-choice${selectedAddressId === "new" ? " selected" : ""}`}>
          <input
            name="addressChoice"
            type="radio"
            value="new"
            checked={selectedAddressId === "new"}
            onChange={() => selectAddress(null)}
          />
          <span className="address-choice-copy">
            <strong>새 배송지 직접 입력</strong>
            <span>새 주소를 입력해 이 선물의 배송지로 사용합니다.</span>
          </span>
        </label>
      </fieldset>
      <div className="form-grid two-columns">
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
        <span className="field form-spacer" aria-hidden="true" />
        <label className="field field-wide">
          <span>기본 주소</span>
          <input name="address1" type="text" maxLength="100" value={fields.address1} onChange={updateField} required />
        </label>
        <label className="field field-wide">
          <span>상세 주소</span>
          <input name="address2" type="text" maxLength="100" value={fields.address2} onChange={updateField} />
        </label>
      </div>
      <p className="form-message error-message" aria-live="polite">{state?.message}</p>
      <button className="button button-primary button-full" type="submit" disabled={pending}>
        {pending ? "선물을 수락하는 중..." : "선물 수락하고 배송 요청"}
      </button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { createOrderAction } from "@/app/orders/actions";
import ProductImage from "@/components/product-image";
import { formatWon } from "@/lib/utils/format";

const initialState = { message: "" };

export default function OrderForm({ product, recipient, mode, from }) {
  const [state, formAction, pending] = useActionState(createOrderAction, initialState);
  const isSelf = mode === "self";

  return (
    <form action={formAction} className="checkout-grid">
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="from" value={from} />
      {recipient && <input type="hidden" name="recipientId" value={recipient.id} />}

      <div className="checkout-card stack-form">
        <div className="page-heading compact-heading">
          <p className="eyebrow">{isSelf ? "나를 위한 선물" : "소중한 사람에게"}</p>
          <h1>{isSelf ? "나에게 선물하기" : "선물 주문"}</h1>
          <p>축하 메시지를 남기고 목업 결제를 완료해 주세요.</p>
        </div>

        {recipient ? (
          <div className="recipient-summary">
            <span>{isSelf ? "받는 사람" : "선물을 받을 친구"}</span>
            <strong>{recipient.name}</strong>
            <small>{recipient.email}</small>
          </div>
        ) : (
          <label className="field">
            <span>선물을 받을 회원 이메일</span>
            <input
              name="recipientEmail"
              type="email"
              autoComplete="email"
              placeholder="friend@example.com"
              required
            />
            <small>WishMate에 가입한 이메일을 입력해 주세요.</small>
          </label>
        )}

        <label className="field">
          <span>축하 메시지</span>
          <textarea
            name="message"
            rows="7"
            minLength="2"
            maxLength="500"
            placeholder="마음을 담은 메시지를 작성해 주세요."
            required
          />
        </label>

        <div className="demo-notice">
          <strong>데모 결제 안내</strong>
          <span>실제 결제는 발생하지 않으며 버튼을 누르면 결제 완료로 처리됩니다.</span>
        </div>
        <p className="form-message error-message" aria-live="polite">{state?.message}</p>
        <button className="button button-primary button-full" type="submit" disabled={pending}>
          {pending ? "선물을 준비하는 중..." : `${formatWon(product.price)} 목업 결제하기`}
        </button>
      </div>

      <aside className="order-summary-card">
        <ProductImage src={product.imageUrl} alt={product.name} />
        <p className="eyebrow">{product.category}</p>
        <h2>{product.name}</h2>
        <div className="summary-price-row">
          <span>결제 금액</span>
          <strong>{formatWon(product.price)}</strong>
        </div>
      </aside>
    </form>
  );
}

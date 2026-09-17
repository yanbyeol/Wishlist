"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toggleWishlistAction } from "@/app/wishlist/actions";
import { HeartIcon } from "@/components/icons";
import { GROUP_GIFT_WISHLIST_REMOVAL_MESSAGE } from "@/lib/constants";

export default function WishlistButton({
  productId,
  isWishlisted,
  user,
  returnPath,
  compact = false,
  removalBlocked = false,
}) {
  const [state, formAction, pending] = useActionState(toggleWishlistAction, null);
  const [dismissedState, setDismissedState] = useState(null);
  const [clientMessage, setClientMessage] = useState("");
  let serverMessage = "";

  if (dismissedState !== state) {
    if (state?.message) {
      serverMessage = state.message;
    } else if (state?.added) {
      serverMessage = "위시리스트에 추가했어요.";
    }
  }

  const feedbackMessage = clientMessage || serverMessage;

  useEffect(() => {
    if (!feedbackMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setClientMessage("");
      if (state) setDismissedState(state);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [feedbackMessage, state]);

  function handleSubmit(event) {
    if (!isWishlisted || !removalBlocked) return;

    event.preventDefault();
    setClientMessage(GROUP_GIFT_WISHLIST_REMOVAL_MESSAGE);
  }

  if (!user) {
    return (
      <Link
        href={`/login?callback=${encodeURIComponent(returnPath)}`}
        className={compact ? "heart-button" : "button button-secondary"}
        aria-label="로그인하고 위시리스트에 추가"
      >
        <HeartIcon filled={false} />
        {!compact && <span>위시리스트 추가</span>}
      </Link>
    );
  }

  return (
    <>
      <form action={formAction} onSubmit={handleSubmit}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="intent" value={isWishlisted ? "remove" : "add"} />
        <input type="hidden" name="returnPath" value={returnPath} />
        <button
          className={compact ? `heart-button ${isWishlisted ? "active" : ""}` : "button button-secondary"}
          type="submit"
          aria-label={isWishlisted ? "위시리스트에서 해제" : "위시리스트에 추가"}
          disabled={pending}
        >
          <HeartIcon filled={isWishlisted} />
          {!compact && <span>{isWishlisted ? "위시리스트에 담김" : "위시리스트 추가"}</span>}
        </button>
      </form>
      {feedbackMessage && typeof document !== "undefined" && createPortal(
        <div className="wishlist-feedback" role="status">
          <span>{feedbackMessage}</span>
          {state?.added && !clientMessage && <Link href="/wishlist">위시리스트 보기</Link>}
        </div>,
        document.body,
      )}
    </>
  );
}

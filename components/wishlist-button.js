"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toggleWishlistAction } from "@/app/wishlist/actions";
import { HeartIcon } from "@/components/icons";

export default function WishlistButton({ productId, isWishlisted, user, returnPath, compact = false }) {
  const [state, formAction, pending] = useActionState(toggleWishlistAction, null);
  const [dismissedState, setDismissedState] = useState(null);
  const showFeedback = state?.added && dismissedState !== state;

  useEffect(() => {
    if (!state?.added) {
      return undefined;
    }

    const timer = window.setTimeout(() => setDismissedState(state), 4000);
    return () => window.clearTimeout(timer);
  }, [state]);

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
      <form action={formAction}>
        <input type="hidden" name="productId" value={productId} />
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
      {showFeedback && typeof document !== "undefined" && createPortal(
        <div className="wishlist-feedback" role="status">
          <span>위시리스트에 추가했어요.</span>
          <Link href="/wishlist">위시리스트 보기</Link>
        </div>,
        document.body,
      )}
    </>
  );
}

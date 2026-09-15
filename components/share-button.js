"use client";

import { useState } from "react";

export default function ShareButton({
  path,
  title,
  label = "위시리스트 공유하기",
  text = `${title}를 확인해 보세요.`,
}) {
  const [message, setMessage] = useState("");

  async function shareWishlist() {
    const url = `${window.location.origin}${path}`;

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        setMessage("공유 창을 열었어요.");
        return;
      }

      await navigator.clipboard.writeText(url);
      setMessage("공유 링크를 복사했어요.");
    } catch (error) {
      if (error?.name !== "AbortError") {
        setMessage("공유하지 못했어요. 다시 시도해 주세요.");
      }
    }
  }

  return (
    <div className="share-control">
      <button className="button button-primary" type="button" onClick={shareWishlist}>
        {label}
      </button>
      <p className="form-message" aria-live="polite">{message}</p>
    </div>
  );
}

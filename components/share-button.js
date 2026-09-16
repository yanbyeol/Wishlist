"use client";

import { useState } from "react";

export default function ShareButton({
  path,
  title,
  label = "위시리스트 공유하기",
  text = `${title}를 확인해 보세요.`,
  copyOnly = false,
  showCopyButton = false,
  buttonClassName = "button button-primary",
}) {
  const [message, setMessage] = useState("");

  async function copyLink() {
    const url = `${window.location.origin}${path}`;

    try {
      await navigator.clipboard.writeText(url);
      setMessage("링크를 복사했어요.");
    } catch {
      setMessage("링크를 복사하지 못했어요. 다시 시도해 주세요.");
    }
  }

  async function shareWishlist() {
    const url = `${window.location.origin}${path}`;

    try {
      if (!copyOnly && navigator.share) {
        await navigator.share({ title, text, url });
        setMessage("공유 창을 열었어요.");
        return;
      }

      await copyLink();
    } catch (error) {
      if (error?.name !== "AbortError") {
        setMessage("공유하지 못했어요. 다시 시도해 주세요.");
      }
    }
  }

  return (
    <div className="share-control">
      <div className="share-buttons">
        <button className={buttonClassName} type="button" onClick={shareWishlist}>
          {label}
        </button>
        {showCopyButton && (
          <button className="button button-secondary" type="button" onClick={copyLink}>
            링크 복사
          </button>
        )}
      </div>
      <p className="form-message" aria-live="polite">{message}</p>
    </div>
  );
}

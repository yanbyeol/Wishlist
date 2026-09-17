"use client";

import { useEffect, useRef, useState } from "react";
import { GiftIcon } from "@/components/icons";

const AUTO_SLIDE_INTERVAL_MS = 10000;
const SWIPE_DISTANCE_PX = 45;

function getContributionWidth(amount, totalAmount) {
  const contributionAmount = Number(amount);
  const groupGiftAmount = Number(totalAmount);

  if (
    !Number.isFinite(contributionAmount) ||
    !Number.isFinite(groupGiftAmount) ||
    contributionAmount <= 0 ||
    groupGiftAmount <= 0
  ) {
    return 0;
  }

  return Math.min(100, (contributionAmount / groupGiftAmount) * 100);
}

function getParticipantName(contribution) {
  return String(contribution.name ?? contribution.nickname ?? "").trim() || "익명의 친구";
}

function getParticipantCards(contributions) {
  const cardsByName = new Map();

  contributions.forEach((contribution) => {
    const name = getParticipantName(contribution);
    const contributionAmount = Number(contribution.amount);
    const message = String(contribution.message ?? "").trim();
    const existingCard = cardsByName.get(name);

    if (existingCard) {
      if (Number.isFinite(contributionAmount) && contributionAmount > 0) {
        existingCard.amount += contributionAmount;
      }
      if (message) {
        existingCard.messages.push(message);
      }
      return;
    }

    cardsByName.set(name, {
      id: contribution.id,
      name,
      amount: Number.isFinite(contributionAmount) && contributionAmount > 0
        ? contributionAmount
        : 0,
      messages: message ? [message] : [],
    });
  });

  return Array.from(cardsByName.values(), (card) => ({
    id: card.id,
    name: card.name,
    amount: card.amount,
    message: card.messages.join("\n"),
  }));
}

export default function GroupGiftMessageCards({
  contributions,
  heading,
  showParticipantBadges = false,
  totalAmount,
}) {
  const participantCards = getParticipantCards(contributions);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef(null);
  const hasMultipleMessages = participantCards.length > 1;

  useEffect(() => {
    if (
      !hasMultipleMessages ||
      isPaused ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setActiveIndex((currentIndex) => (currentIndex + 1) % participantCards.length);
      }
    }, AUTO_SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [activeIndex, hasMultipleMessages, isPaused, participantCards.length]);

  if (participantCards.length === 0) {
    return null;
  }

  function showPreviousMessage() {
    setActiveIndex((currentIndex) => (
      currentIndex === 0 ? participantCards.length - 1 : currentIndex - 1
    ));
  }

  function showNextMessage() {
    setActiveIndex((currentIndex) => (currentIndex + 1) % participantCards.length);
  }

  function handleTouchStart(event) {
    if (!hasMultipleMessages) {
      return;
    }

    touchStartX.current = event.touches[0]?.clientX ?? null;
    setIsPaused(true);
  }

  function handleTouchEnd(event) {
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    setIsPaused(false);

    if (startX == null || endX == null) {
      return;
    }

    const distance = startX - endX;

    if (distance >= SWIPE_DISTANCE_PX) {
      showNextMessage();
    } else if (distance <= -SWIPE_DISTANCE_PX) {
      showPreviousMessage();
    }
  }

  function handleTouchCancel() {
    touchStartX.current = null;
    setIsPaused(false);
  }

  function handleKeyDown(event) {
    if (!hasMultipleMessages) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPreviousMessage();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      showNextMessage();
    }
  }

  function handleBlur(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsPaused(false);
    }
  }

  return (
    <section className="group-message-section" aria-label="공동선물 축하 메시지">
      <div className="group-message-heading">
        <p className="eyebrow">축하 메시지</p>
        <h2>{heading ?? `${participantCards.length}개의 마음이 도착했어요`}</h2>
        {showParticipantBadges && participantCards.length > 0 && (
          <ul className="group-message-participants" aria-label="공동선물 참여자">
            {participantCards.map((participant, index) => (
              <li
                className="group-message-participant-badge"
                key={participant.id ?? `${participant.name}-${index}`}
              >
                {participant.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className="group-message-carousel"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={handleBlur}
      >
        <div
          className="group-message-viewport"
          aria-label="참여자별 축하 메시지 카드"
          aria-roledescription="carousel"
          tabIndex={hasMultipleMessages ? 0 : undefined}
          onKeyDown={handleKeyDown}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
        >
          <div
            className="group-message-track"
            style={{ transform: `translateX(-${activeIndex * 100}%)` }}
          >
            {participantCards.map((participant, index) => {
              const contributionWidth = getContributionWidth(
                participant.amount,
                totalAmount,
              );

              return (
                <div
                  className="group-message-slide"
                  key={participant.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${index + 1} / ${participantCards.length}`}
                  aria-hidden={index !== activeIndex}
                >
                  <article className="group-message-card">
                    <span className="gift-card-icon group-message-card-icon" aria-hidden="true">
                      <GiftIcon size={18} />
                    </span>
                    <p className="group-message-card-intro">함께 준비한 선물이 도착했어요</p>
                    {participant.message && <blockquote>{participant.message}</blockquote>}
                    <p className="group-message-card-sender">
                      <span>From.</span>
                      <strong>{participant.name}</strong>
                    </p>
                    <div
                      className="contribution-progress-track group-message-contribution-track"
                      role="img"
                      aria-label={`${participant.name}님의 상대적인 기여도`}
                    >
                      <span style={{ width: `${contributionWidth}%` }} />
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        </div>

        {hasMultipleMessages && (
          <div className="group-message-controls" role="group" aria-label="축하 메시지 이동">
            <button
              className="group-message-arrow"
              type="button"
              aria-label="이전 축하 메시지"
              onClick={showPreviousMessage}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <div className="group-message-dots" aria-label="축하 메시지 순서">
              {participantCards.map((participant, index) => (
                <button
                  className={`group-message-dot ${index === activeIndex ? "active" : ""}`}
                  type="button"
                  key={participant.id}
                  aria-label={`${index + 1}번째 축하 메시지 보기`}
                  aria-current={index === activeIndex ? "true" : undefined}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
            <button
              className="group-message-arrow"
              type="button"
              aria-label="다음 축하 메시지"
              onClick={showNextMessage}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

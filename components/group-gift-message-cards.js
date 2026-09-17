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

function getParticipants(contributions) {
  const participantNames = new Set();

  return contributions.reduce((participants, contribution) => {
    const name = getParticipantName(contribution);

    if (participantNames.has(name)) {
      return participants;
    }

    participantNames.add(name);
    participants.push({ id: contribution.id, name });
    return participants;
  }, []);
}

export default function GroupGiftMessageCards({
  contributions,
  heading,
  showParticipantBadges = false,
  totalAmount,
}) {
  const participants = getParticipants(contributions);
  const messages = contributions.filter(
    (contribution) => String(contribution.message ?? "").trim(),
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef(null);
  const hasMultipleMessages = messages.length > 1;

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
        setActiveIndex((currentIndex) => (currentIndex + 1) % messages.length);
      }
    }, AUTO_SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [activeIndex, hasMultipleMessages, isPaused, messages.length]);

  if (messages.length === 0) {
    return null;
  }

  function showPreviousMessage() {
    setActiveIndex((currentIndex) => (
      currentIndex === 0 ? messages.length - 1 : currentIndex - 1
    ));
  }

  function showNextMessage() {
    setActiveIndex((currentIndex) => (currentIndex + 1) % messages.length);
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
        <h2>{heading ?? `${messages.length}개의 마음이 도착했어요`}</h2>
        {showParticipantBadges && participants.length > 0 && (
          <ul className="group-message-participants" aria-label="공동선물 참여자">
            {participants.map((participant, index) => (
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
            {messages.map((contribution, index) => {
              const contributorName = getParticipantName(contribution);
              const contributionWidth = getContributionWidth(
                contribution.amount,
                totalAmount,
              );

              return (
                <div
                  className="group-message-slide"
                  key={contribution.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${index + 1} / ${messages.length}`}
                  aria-hidden={index !== activeIndex}
                >
                  <article className="group-message-card">
                    <span className="gift-card-icon group-message-card-icon" aria-hidden="true">
                      <GiftIcon size={18} />
                    </span>
                    <p className="group-message-card-intro">함께 준비한 선물이 도착했어요</p>
                    <blockquote>{contribution.message}</blockquote>
                    <p className="group-message-card-sender">
                      <span>From.</span>
                      <strong>{contributorName}</strong>
                    </p>
                    <div
                      className="contribution-progress-track group-message-contribution-track"
                      role="img"
                      aria-label={`${contributorName}님의 상대적인 기여도`}
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
              {messages.map((contribution, index) => (
                <button
                  className={`group-message-dot ${index === activeIndex ? "active" : ""}`}
                  type="button"
                  key={contribution.id}
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

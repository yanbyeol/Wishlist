const startedGroupGiftStatuses = [
  "funded",
  "processing",
  "payment_failed",
  "completed",
];

const activeGroupGiftStatusesAfterContribution = [
  "funded",
  "processing",
  "payment_failed",
];

export function getStartedGroupGiftFilter(now = new Date()) {
  return {
    $or: [
      {
        status: "funding",
        currentAmount: { $gt: 0 },
        expiresAt: { $gt: now },
      },
      { status: { $in: activeGroupGiftStatusesAfterContribution } },
    ],
  };
}

export function hasGroupGiftStarted(groupGift) {
  if (!groupGift) {
    return false;
  }

  if (groupGift.status === "funding") {
    return Number(groupGift.currentAmount) > 0;
  }

  return startedGroupGiftStatuses.includes(groupGift.status);
}

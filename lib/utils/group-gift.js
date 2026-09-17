const startedGroupGiftStatuses = [
  "funded",
  "processing",
  "payment_failed",
  "completed",
];

export function hasGroupGiftStarted(groupGift) {
  if (!groupGift) {
    return false;
  }

  if (groupGift.status === "funding") {
    return Number(groupGift.currentAmount) > 0;
  }

  return startedGroupGiftStatuses.includes(groupGift.status);
}

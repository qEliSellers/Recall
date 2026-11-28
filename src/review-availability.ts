import { useEffect, useState } from "react";
import { number, type Course, type Unit } from "./api";

type ReviewCounts = Pick<
  Course,
  | "dueCards"
  | "nextReviewAt"
  | "activeCards"
  | "unintroducedCards"
  | "suspendedCards"
>;
export type ReviewAction = "introduce" | "library" | "add-unit" | "settings";

export function countReviews(units: Unit[]): ReviewCounts {
  return units.reduce<ReviewCounts>(
    (counts, unit) => ({
      dueCards: (counts.dueCards ?? 0) + (unit.dueCards ?? 0),
      activeCards: (counts.activeCards ?? 0) + (unit.activeCards ?? 0),
      unintroducedCards:
        (counts.unintroducedCards ?? 0) + (unit.unintroducedCards ?? 0),
      suspendedCards: (counts.suspendedCards ?? 0) + (unit.suspendedCards ?? 0),
      nextReviewAt:
        unit.nextReviewAt &&
        (!counts.nextReviewAt || unit.nextReviewAt < counts.nextReviewAt)
          ? unit.nextReviewAt
          : counts.nextReviewAt,
    }),
    {},
  );
}

export function useReviewsDue(counts?: ReviewCounts) {
  const dueAt = Date.parse(counts?.nextReviewAt ?? "");
  const [currentTime, setCurrentTime] = useState(Date.now);
  useEffect(() => {
    if (!Number.isFinite(dueAt) || dueAt <= Date.now()) return;
    let timer: ReturnType<typeof setTimeout>;
    function updateAtDueTime() {
      const remaining = dueAt - Date.now();
      if (remaining > 0)
        timer = setTimeout(updateAtDueTime, Math.min(remaining, 2147483647));
      else setCurrentTime(Date.now());
    }
    updateAtDueTime();
    return () => clearTimeout(timer);
  }, [dueAt]);
  return (
    Boolean(counts?.dueCards) || dueAt <= Math.max(Date.now(), currentTime)
  );
}

export function reviewNotice(
  counts: ReviewCounts,
  hasUnits: boolean,
  paused: boolean,
): { message: string; action?: ReviewAction; label?: string } {
  if (paused)
    return {
      message: "Scheduled reviews are paused for this course.",
      action: "settings",
      label: "Course settings",
    };
  const next = counts.nextReviewAt
    ? `Next review ${new Date(counts.nextReviewAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })}.`
    : "";
  if (counts.unintroducedCards) {
    const waiting =
      counts.unintroducedCards === 1
        ? "1 card is"
        : `${number(counts.unintroducedCards)} cards are`;
    return {
      message: `${waiting} ready to introduce.${next ? ` ${next}` : ""}`,
      action: "introduce",
      label: "Introduce cards",
    };
  }
  if (next) return { message: `You’re caught up. ${next}` };
  if (!hasUnits)
    return {
      message: "Add a unit to organize cards for review.",
      action: "add-unit",
      label: "Add a unit",
    };
  if (counts.suspendedCards)
    return {
      message:
        "The cards in this scope are suspended. You can reactivate them in the card library.",
      action: "library",
      label: "Open card library",
    };
  return {
    message: "Add or import cards to start reviewing.",
    action: "library",
    label: "Open card library",
  };
}

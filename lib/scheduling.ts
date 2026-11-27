import {
  DefaultScheduler,
  type DefaultSchedulerCard,
  type Grade,
} from "ts-fsrs";
export type SchedulingSettings = {
  retention?: number;
  maxInterval?: number;
  learningSteps?: string[];
  relearningSteps?: string[];
  archived?: boolean;
  archiveMode?: string;
  relaxedRetention?: number;
};
export const schedulerFor = (settings: SchedulingSettings = {}) =>
  DefaultScheduler({
    version: "FSRS-7",
    desiredRetention:
      settings.archived && settings.archiveMode === "relaxed"
        ? (settings.relaxedRetention ?? 0.8)
        : (settings.retention ?? 0.9),
    maximumInterval: settings.maxInterval ?? 36500,
    learningSteps: (settings.learningSteps ?? ["1m", "10m"]) as any,
    relearningSteps: (settings.relearningSteps ?? ["10m"]) as any,
    enableShortTerm: true,
    enableFuzz: false,
  });
export function hydrateCard(value: any): DefaultSchedulerCard {
  return {
    ...value,
    dueAt: new Date(value.dueAt),
    lastReviewAt: value.lastReviewAt ? new Date(value.lastReviewAt) : null,
  };
}
export async function newSchedule(
  settings: SchedulingSettings = {},
  date = new Date(),
) {
  const s = await schedulerFor(settings);
  return s.newCard({ now: date });
}
export async function reviewSchedule(
  value: any,
  rating: number,
  settings: SchedulingSettings = {},
  date = new Date(),
) {
  const s = await schedulerFor(settings);
  return s.review({
    card: hydrateCard(value),
    grade: rating as Grade,
    now: date,
  });
}
export async function retrievability(value: any, date = new Date()) {
  const card = hydrateCard(value);
  if (!card.lastReviewAt || !card.reps) return null;
  const s = await schedulerFor();
  return Math.max(
    0,
    Math.min(
      1,
      s.model.forgettingCurve(
        card,
        s.chrono.difference(card.lastReviewAt, date),
      ),
    ),
  );
}

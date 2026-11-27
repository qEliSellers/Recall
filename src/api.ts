export async function api<T = any>(
  action: string,
  input: unknown = {},
): Promise<T> {
  const response = await fetch("/api/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, input }),
  });
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok || result.error)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : result.error?.message ||
            "The request could not be completed. Please try again.",
    );
  return result.data as T;
}
export const percent = (value?: number | null) =>
  value == null ? "—" : `${Math.round(value <= 1 ? value * 100 : value)}%`;
export const number = (value?: number | null) => (value ?? 0).toLocaleString();
export const day = (value: string | number | Date) =>
  new Date(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00`
      : value,
  ).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const typeLabel = (value: string) =>
  ({
    multiple_choice: "Multiple choice",
    multiple_select: "Multiple select",
    true_false: "True / false",
    typed: "Typed response",
    cloze: "Cloze",
    matching: "Matching",
    sequencing: "Sequencing",
  })[value] || value;
export interface Course {
  id: string;
  name: string;
  subject: string;
  isMath: boolean;
  archived: boolean;
  archiveMode?: string;
  retention?: number;
  relaxedRetention?: number;
  maxInterval?: number;
  midtermUnitId?: string | null;
  sourceUrl?: string;
  totalCards?: number;
  activeCards?: number;
  unintroducedCards?: number;
  suspendedCards?: number;
  dueCards?: number;
  unitCount?: number;
  introducedCards?: number;
  [key: string]: any;
}
export interface Unit {
  id: string;
  courseId: string;
  name: string;
  position?: number;
  order?: number;
  totalCards?: number;
  activeCards?: number;
  unintroducedCards?: number;
  suspendedCards?: number;
  introducedCards?: number;
  dueCards?: number;
  [key: string]: any;
}
export interface CardRow {
  id: string;
  courseId: string;
  unitId: string;
  externalId?: string;
  content: any;
  skills: string[];
  status: string;
  revision: number;
  schedule?: any;
  difficulty?: number;
  hint?: string;
  solution?: string;
  [key: string]: any;
}

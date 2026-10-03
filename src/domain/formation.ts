import type { Vec3 } from "./types";
export const ROWS = 6,
  COLUMNS = 12,
  STUDENT_COUNT = 72;
export function studentId(row: number, column: number) {
  return `R${row}-C${column}`;
}
export const STUDENT_IDS = Array.from({ length: 72 }, (_, i) =>
  studentId(Math.floor(i / 12) + 1, (i % 12) + 1),
);
export function studentIndex(id: string) {
  return STUDENT_IDS.indexOf(id);
}
export function studentOrigin(index: number): Vec3 {
  return [
    ((index % 12) + 1 - 6.5) * 1.15,
    Math.floor(index / 12) * 0.65,
    -Math.floor(index / 12) * 1.4,
  ];
}
export function groupIds(kind: "row" | "column", value: number): string[] {
  return STUDENT_IDS.filter((_, i) =>
    kind === "row" ? Math.floor(i / 12) + 1 === value : (i % 12) + 1 === value,
  );
}

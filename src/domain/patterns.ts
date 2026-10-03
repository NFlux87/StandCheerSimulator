import type { ArmSide, StudentPose } from "./types";
import { studentId, studentIndex } from "./formation";
import { clampArm } from "./ik";
import { clonePoses, mirrorPose, presetPose } from "./poses";

export type PatternOptions = {
  type: "wave" | "gradient" | "alternate" | "mirror";
  arm?: "left" | "right" | "both";
  reverse?: boolean;
  start?: number;
  end?: number;
  presetA?: string;
  presetB?: string;
};
export function canMirrorFormation(selection: ReadonlySet<string>): boolean {
  for (let row = 1; row <= 6; row++)
    for (let col = 1; col <= 6; col++) {
      if (
        selection.has(studentId(row, col)) &&
        selection.has(studentId(row, 13 - col))
      )
        return true;
    }
  return false;
}

export function applyPattern(
  poses: readonly StudentPose[],
  selection: ReadonlySet<string>,
  options: PatternOptions,
): StudentPose[] {
  const result = clonePoses(poses);
  const indices = poses
    .map((pose, index) => (selection.has(pose.id) ? index : -1))
    .filter((index) => index >= 0);
  indices.sort(
    (a, b) => (a % 12) - (b % 12) || Math.floor(a / 12) - Math.floor(b / 12),
  );
  if (options.type === "mirror") {
    for (let row = 1; row <= 6; row++)
      for (let col = 1; col <= 6; col++) {
        const sourceId = studentId(row, col),
          targetId = studentId(row, 13 - col);
        if (selection.has(sourceId) && selection.has(targetId)) {
          const target = studentIndex(targetId),
            mirrored = mirrorPose(poses[studentIndex(sourceId)]);
          result[target] = { ...mirrored, id: targetId };
        }
      }
    return result;
  }
  if (options.type === "alternate") {
    indices.forEach((index, i) => {
      result[index] = presetPose(
        i % 2 === 0
          ? (options.presetA ?? "Both Arms Up")
          : (options.presetB ?? "Both Arms Down"),
        poses[index].id,
      );
    });
    return result;
  }
  const start = options.start ?? 0,
    end = options.end ?? 180;
  if (
    options.type === "gradient" &&
    (!Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      start > 180 ||
      end < 0 ||
      end > 180)
  ) {
    throw new Error(
      "Gradient angles must be finite values between 0° and 180°.",
    );
  }
  const sides: ArmSide[] =
    options.arm === "both" ? ["left", "right"] : [options.arm ?? "right"];
  indices.forEach((index, i) => {
    const u = indices.length > 1 ? i / (indices.length - 1) : 0;
    const theta =
      ((options.type === "wave"
        ? 90 + 70 * Math.sin(2 * Math.PI * (options.reverse ? 1 - u : u))
        : start + (end - start) * u) *
        Math.PI) /
      180;
    for (const side of sides) {
      const sign = side === "left" ? 1 : -1;
      result[index][side] = clampArm(side, {
        ...result[index][side],
        hand: [
          sign * (0.24 + 0.76 * Math.sin(theta)),
          1.35 - 0.76 * Math.cos(theta),
          0.02,
        ],
      });
    }
  });
  return result;
}

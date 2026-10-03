import { STUDENT_IDS } from "./formation";
import { clampArm } from "./ik";
import { presetPose } from "./poses";
import type { ArmPose, Keyframe, Project, StudentPose, Vec3 } from "./types";

export function createProject(): Project {
  return {
    schemaVersion: 1,
    name: "Untitled Cheer",
    gloveColors: { palm: "#F8CF48", back: "#4268E8" },
    poses: STUDENT_IDS.map((id) => presetPose("Neutral", id)),
    duration: 8,
    playhead: 0,
    interpolation: "smooth",
    keyframes: [],
  };
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}
function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${field} must be a finite number.`);
  return value;
}
function vector(value: unknown, field: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3)
    throw new Error(`${field} must contain three coordinates.`);
  return [
    finite(value[0], `${field}.x`),
    finite(value[1], `${field}.y`),
    finite(value[2], `${field}.z`),
  ];
}
function poses(value: unknown, field: string): StudentPose[] {
  if (!Array.isArray(value) || value.length !== STUDENT_IDS.length)
    throw new Error(`${field} must contain exactly 72 students.`);
  return value.map((entry, index) => {
    const pose = object(entry, `${field}[${index}]`);
    if (pose.id !== STUDENT_IDS[index])
      throw new Error(
        `${field}[${index}].id must be ${STUDENT_IDS[index]} (unique row-major student IDs required).`,
      );
    const result: StudentPose = {
      id: STUDENT_IDS[index],
      left: { hand: [0, 0, 0], elbowPole: [0, 0, 0], wrist: 0 },
      right: { hand: [0, 0, 0], elbowPole: [0, 0, 0], wrist: 0 },
    };
    for (const side of ["left", "right"] as const) {
      const armField = `${field}[${index}].${side}`,
        arm = object(pose[side], armField);
      const parsed: ArmPose = {
        hand: vector(arm.hand, `${armField}.hand`),
        elbowPole: vector(arm.elbowPole, `${armField}.elbowPole`),
        wrist: finite(arm.wrist, `${armField}.wrist`),
      };
      result[side] = clampArm(side, parsed);
    }
    return result;
  });
}

export function validateProject(value: unknown): Project {
  const source = object(value, "Project");
  if (source.schemaVersion !== 1)
    throw new Error("Unsupported project schemaVersion; expected version 1.");
  if (typeof source.name !== "string")
    throw new Error("Project.name must be a string.");
  const colors = object(source.gloveColors, "Project.gloveColors");
  for (const side of ["palm", "back"]) {
    if (
      typeof colors[side] !== "string" ||
      !/^#[\da-f]{6}$/i.test(colors[side] as string)
    )
      throw new Error(
        `Project.gloveColors.${side} must be a six-digit hex color.`,
      );
  }
  const duration = finite(source.duration, "Project.duration");
  if (duration < 1 / 30)
    throw new Error("Project.duration must be at least 1/30 second.");
  const playhead = finite(source.playhead, "Project.playhead");
  if (playhead < 0 || playhead > duration)
    throw new Error("Project.playhead must be within the duration.");
  if (source.interpolation !== "smooth" && source.interpolation !== "step")
    throw new Error("Project.interpolation must be smooth or step.");
  const currentPoses = poses(source.poses, "Project.poses");
  if (!Array.isArray(source.keyframes))
    throw new Error("Project.keyframes must be an array.");
  const ids = new Set<string>(),
    times = new Set<number>();
  const keyframes: Keyframe[] = source.keyframes.map((entry, index) => {
    const field = `Project.keyframes[${index}]`,
      key = object(entry, field);
    if (typeof key.id !== "string" || !key.id || ids.has(key.id))
      throw new Error(`${field}.id must be a unique nonempty string.`);
    const time = finite(key.time, `${field}.time`);
    if (time < 0 || time > duration)
      throw new Error(`${field}.time must be within the duration.`);
    if (
      times.has(time) ||
      [...times].some((other) => Math.abs(other - time) <= 1e-6)
    )
      throw new Error(`${field}.time duplicates an existing keyframe time.`);
    ids.add(key.id);
    times.add(time);
    return { id: key.id, time, poses: poses(key.poses, `${field}.poses`) };
  });
  keyframes.sort((a, b) => a.time - b.time);
  return {
    schemaVersion: 1,
    name: source.name,
    gloveColors: { palm: colors.palm as string, back: colors.back as string },
    poses: currentPoses,
    duration,
    playhead,
    interpolation: source.interpolation,
    keyframes,
  };
}

import type { ArmSide, Keyframe, Project, StudentPose } from "./types";
import { makeArmSolution, solveArm, wrapWrist } from "./ik";
import { clonePoses } from "./poses";

export function quantizeTime(time: number, duration: number): number {
  return Math.max(0, Math.min(duration, Math.round(time * 30) / 30));
}
export function captureKeyframe(
  project: Project,
  time: number,
  poses: readonly StudentPose[],
): Project {
  if (!Number.isFinite(time)) throw new Error("Keyframe time must be finite.");
  const snapped = quantizeTime(time, project.duration);
  const existing = project.keyframes.find(
    (key) => Math.abs(key.time - snapped) <= 1e-6,
  );
  const keyframe: Keyframe = {
    id: existing?.id ?? crypto.randomUUID(),
    time: snapped,
    poses: clonePoses(poses),
  };
  const keyframes = existing
    ? project.keyframes.map((key) => (key.id === existing.id ? keyframe : key))
    : [...project.keyframes, keyframe];
  keyframes.sort((a, b) => a.time - b.time);
  return { ...project, keyframes };
}

const sampleSolution = makeArmSolution();
const sides: ArmSide[] = ["left", "right"];
/** Samples into an owned reusable buffer; never aliases any source snapshot. */
export function sampleTimeline(
  keyframes: readonly Keyframe[],
  time: number,
  fallback: readonly StudentPose[],
  interpolation: Project["interpolation"],
  out: StudentPose[],
): StudentPose[] {
  let from: readonly StudentPose[] = fallback,
    to: readonly StudentPose[] = fallback,
    u = 0;
  if (keyframes.length) {
    from = keyframes[0].poses;
    to = from;
    if (time >= keyframes[keyframes.length - 1].time) {
      from = keyframes[keyframes.length - 1].poses;
      to = from;
    } else if (time > keyframes[0].time) {
      let lower = 1,
        upper = keyframes.length - 1;
      while (lower < upper) {
        const middle = Math.floor((lower + upper) / 2);
        if (keyframes[middle].time < time) lower = middle + 1;
        else upper = middle;
      }
      if (time === keyframes[lower].time) {
        from = keyframes[lower].poses;
        to = from;
      } else {
        from = keyframes[lower - 1].poses;
        to = keyframes[lower].poses;
        if (interpolation === "smooth") {
          u =
            (time - keyframes[lower - 1].time) /
            (keyframes[lower].time - keyframes[lower - 1].time);
          u = u * u * (3 - 2 * u);
        }
      }
    }
  }
  if (out.length !== from.length) {
    out.length = 0;
    for (const pose of from)
      out.push({
        id: pose.id,
        left: { hand: [0, 0, 0], elbowPole: [0, 0, 0], wrist: 0 },
        right: { hand: [0, 0, 0], elbowPole: [0, 0, 0], wrist: 0 },
      });
  }
  for (let i = 0; i < from.length; i++) {
    out[i].id = from[i].id;
    for (const side of sides) {
      const a = from[i][side],
        b = to[i][side],
        target = out[i][side];
      for (let axis = 0; axis < 3; axis++) {
        target.hand[axis] =
          u === 0 ? a.hand[axis] : a.hand[axis] * (1 - u) + b.hand[axis] * u;
        target.elbowPole[axis] =
          u === 0
            ? a.elbowPole[axis]
            : a.elbowPole[axis] * (1 - u) + b.elbowPole[axis] * u;
      }
      target.wrist = a.wrist;
      // Exact snapshots stay exact; intermediate targets use the common reach clamp.
      if (u !== 0) {
        const difference = wrapWrist(b.wrist) - wrapWrist(a.wrist);
        const delta = Math.atan2(Math.sin(difference), Math.cos(difference));
        target.wrist = wrapWrist(wrapWrist(a.wrist) + delta * u);
        solveArm(side, target, sampleSolution);
        target.hand[0] = sampleSolution.hand[0];
        target.hand[1] = sampleSolution.hand[1];
        target.hand[2] = sampleSolution.hand[2];
      }
    }
  }
  return out;
}

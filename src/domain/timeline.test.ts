import { describe, expect, it } from "vitest";
import { STUDENT_IDS } from "./formation";
import { makeArmSolution, solveArm } from "./ik";
import { clonePoses, presetPose } from "./poses";
import { createProject } from "./project";
import { captureKeyframe, sampleTimeline } from "./timeline";
import type { Keyframe } from "./types";

function keys(): Keyframe[] {
  return [
    {
      id: "a",
      time: 0,
      poses: STUDENT_IDS.map((id) => presetPose("Both Arms Down", id)),
    },
    {
      id: "b",
      time: 2,
      poses: STUDENT_IDS.map((id) => presetPose("Both Arms Up", id)),
    },
  ];
}

describe("timeline sampling", () => {
  it("samples the smoothed midpoint, shortest wrist arc, and reusable independent arrays", () => {
    const keyframes = keys(),
      out = clonePoses(keyframes[0].poses),
      target = out[0].right.hand;
    for (const pose of keyframes[0].poses)
      pose.right.wrist = (350 * Math.PI) / 180;
    for (const pose of keyframes[1].poses)
      pose.right.wrist = (10 * Math.PI) / 180;
    expect(
      sampleTimeline(keyframes, 1, keyframes[0].poses, "smooth", out),
    ).toBe(out);
    expect(out[0].right.hand).toBe(target);
    expect(out[0].right.hand[1]).toBeCloseTo(1.35, 6);
    expect(
      Math.atan2(Math.sin(out[0].right.wrist), Math.cos(out[0].right.wrist)),
    ).toBeCloseTo(0, 9);
    expect(out[0].right.hand).not.toEqual(keyframes[0].poses[0].right.hand);
    expect(out[0].right.hand).not.toBe(keyframes[0].poses[0].right.hand);
    for (const pose of out)
      for (const side of ["left", "right"] as const) {
        const solved = solveArm(side, pose[side], makeArmSolution());
        expect(
          Math.hypot(...solved.elbow.map((v, i) => v - solved.shoulder[i])),
        ).toBeCloseTo(0.4, 6);
        expect(
          Math.hypot(...solved.hand.map((v, i) => v - solved.elbow[i])),
        ).toBeCloseTo(0.4, 6);
      }
  });
  it("uses smoothstep rather than linear time and clamps a coincident blended target", () => {
    const keyframes = keys(),
      out = clonePoses(keyframes[0].poses);
    sampleTimeline(keyframes, 0.5, keyframes[0].poses, "smooth", out);
    const from = keyframes[0].poses[0].left.hand[1],
      to = keyframes[1].poses[0].left.hand[1];
    expect(out[0].left.hand[1]).toBeCloseTo(from + (to - from) * 0.15625, 8);
    keyframes[0].poses[0].left.hand = [0.24, 1.0, 0];
    keyframes[1].poses[0].left.hand = [0.24, 1.7, 0];
    sampleTimeline(keyframes, 1, keyframes[0].poses, "smooth", out);
    expect(
      Math.hypot(
        out[0].left.hand[0] - 0.24,
        out[0].left.hand[1] - 1.35,
        out[0].left.hand[2],
      ),
    ).toBeCloseTo(0.001, 8);
  });
  it("holds boundaries, exact key snapshots and earlier step snapshots", () => {
    const keyframes = keys(),
      out = clonePoses(keyframes[0].poses);
    expect(
      sampleTimeline(keyframes, -1, keyframes[1].poses, "smooth", out),
    ).toEqual(keyframes[0].poses);
    expect(
      sampleTimeline(keyframes, 0, keyframes[1].poses, "smooth", out),
    ).toEqual(keyframes[0].poses);
    expect(
      sampleTimeline(keyframes, 1.99, keyframes[1].poses, "step", out),
    ).toEqual(keyframes[0].poses);
    expect(
      sampleTimeline(keyframes, 2, keyframes[0].poses, "step", out),
    ).toEqual(keyframes[1].poses);
    expect(
      sampleTimeline(keyframes, 20, keyframes[0].poses, "smooth", out),
    ).toEqual(keyframes[1].poses);
    expect(
      sampleTimeline([keyframes[1]], 0, keyframes[0].poses, "smooth", out),
    ).toEqual(keyframes[1].poses);
    expect(sampleTimeline([], 8, keyframes[0].poses, "smooth", out)).toEqual(
      keyframes[0].poses,
    );
  });
  it("interpolates very large opposite finite poles without producing infinities", () => {
    const keyframes = keys(),
      out = clonePoses(keyframes[0].poses);
    keyframes[0].poses[0].left.elbowPole[0] = 1.7e308;
    keyframes[1].poses[0].left.elbowPole[0] = -1.7e308;
    sampleTimeline(keyframes, 1, keyframes[0].poses, "smooth", out);
    expect(out[0].left.elbowPole.every(Number.isFinite)).toBe(true);
    expect(out[0].left.hand.every(Number.isFinite)).toBe(true);
  });
});

describe("full-stand keyframe capture", () => {
  it("rounds, sorts, replaces existing keys with stable IDs and owns every snapshot", () => {
    const base = createProject(),
      source = clonePoses(base.poses);
    const first = captureKeyframe(base, 2.511, source),
      id = first.keyframes[0].id;
    expect(first.keyframes[0].time).toBe(2.5);
    source[0].right.hand[1] += 0.2;
    expect(first.keyframes[0].poses[0].right.hand).not.toEqual(
      source[0].right.hand,
    );
    const replaced = captureKeyframe(first, 2.5, source);
    expect(replaced.keyframes).toHaveLength(1);
    expect(replaced.keyframes[0].id).toBe(id);
    expect(first.keyframes[0].poses[0].right.hand).not.toEqual(
      replaced.keyframes[0].poses[0].right.hand,
    );
    const sorted = captureKeyframe(replaced, -10, base.poses);
    expect(sorted.keyframes.map((frame) => frame.time)).toEqual([0, 2.5]);
    const clamped = captureKeyframe(
      { ...base, duration: 0.05 },
      10,
      base.poses,
    );
    expect(clamped.keyframes[0].time).toBe(0.05);
    expect(sorted.keyframes[0].poses[0].left.hand).not.toBe(
      sorted.keyframes[0].poses[1].left.hand,
    );
    expect(base.keyframes).toEqual([]);
  });
});

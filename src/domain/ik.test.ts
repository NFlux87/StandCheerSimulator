import { describe, expect, it } from "vitest";
import { clampArm, makeArmSolution, solveArm, TAU } from "./ik";
import { clonePose, mirrorPose, PRESET_NAMES, presetPose } from "./poses";
import type { ArmPose, Vec3 } from "./types";

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function rotate(
  vector: Vec3,
  quaternion: [number, number, number, number],
): Vec3 {
  const [x, y, z, w] = quaternion,
    [vx, vy, vz] = vector;
  const tx = 2 * (y * vz - z * vy),
    ty = 2 * (z * vx - x * vz),
    tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + y * tz - z * ty,
    vy + w * ty + z * tx - x * tz,
    vz + w * tz + x * ty - y * tx,
  ];
}

describe("two-bone arm solver", () => {
  const inputs: ArmPose[] = [
    { hand: [0.8, 1.6, 0.2], elbowPole: [0.6, 1.1, 0.5], wrist: 0 },
    { hand: [20, 30, 40], elbowPole: [0, 0, 0], wrist: Math.PI },
    { hand: [0.24, 1.35, 0], elbowPole: [0.24, 1.35, 0], wrist: 1 },
    { hand: [0.24, 1.35, 0.5], elbowPole: [0.24, 1.35, 2], wrist: 0 },
    { hand: [0.24, 1.8, 0], elbowPole: [0.24, 3, 0], wrist: 0 },
    {
      hand: [1.7e308, -1.7e308, 1.7e308],
      elbowPole: [1.7e308, 1.7e308, -1.7e308],
      wrist: 1.7e308,
    },
  ];
  for (const side of ["left", "right"] as const) {
    inputs.forEach((input, index) =>
      it(`${side} target ${index} keeps both segment lengths and leaves input intact`, () => {
        const before = structuredClone(input),
          out = makeArmSolution();
        expect(solveArm(side, input, out)).toBe(out);
        expect(distance(out.shoulder, out.elbow)).toBeCloseTo(0.4, 6);
        expect(distance(out.elbow, out.hand)).toBeCloseTo(0.4, 6);
        expect(out.wristQuaternion.every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...out.wristQuaternion)).toBeCloseTo(1, 6);
        expect(input).toEqual(before);
      }),
    );
  }
  it("clamps coincident and unreachable hands into stored targets", () => {
    for (const input of inputs) {
      const arm = clampArm("left", input),
        solution = solveArm("left", arm, makeArmSolution());
      expect(distance(arm.hand, solution.hand)).toBeLessThan(1e-6);
      expect(distance(solution.shoulder, arm.hand)).toBeGreaterThanOrEqual(
        0.001 - 1e-9,
      );
      expect(distance(solution.shoulder, arm.hand)).toBeLessThanOrEqual(
        0.799 + 1e-9,
      );
    }
  });
  it("uses +Y for fingers, projected body +Z for palm and rotates the actual frame", () => {
    const arm = presetPose("Neutral", "R1-C1").left,
      solution = solveArm("left", arm, makeArmSolution());
    const finger = rotate([0, 1, 0], solution.wristQuaternion);
    for (let axis = 0; axis < 3; axis++)
      expect(finger[axis]).toBeCloseTo(
        (solution.hand[axis] - solution.elbow[axis]) / 0.4,
        6,
      );
    const palm = rotate([0, 0, 1], solution.wristQuaternion);
    const flipped = solveArm(
      "left",
      { ...arm, wrist: Math.PI },
      makeArmSolution(),
    );
    const back = rotate([0, 0, 1], flipped.wristQuaternion);
    for (let axis = 0; axis < 3; axis++)
      expect(back[axis]).toBeCloseTo(-palm[axis], 6);
    expect(palm[2]).toBeGreaterThan(0);
  });
  it("every named preset is editable independent data with reachable fixed bones", () => {
    expect(PRESET_NAMES).toHaveLength(10);
    for (const name of PRESET_NAMES) {
      const pose = presetPose(name, "R1-C1"),
        other = presetPose(name, "R1-C2");
      for (const side of ["left", "right"] as const) {
        const solution = solveArm(side, pose[side], makeArmSolution());
        expect(distance(solution.shoulder, solution.elbow)).toBeCloseTo(0.4, 6);
        expect(distance(solution.elbow, solution.hand)).toBeCloseTo(0.4, 6);
        expect(pose[side].hand).not.toBe(other[side].hand);
      }
    }
  });
});

describe("anatomical pose mirroring", () => {
  it("exchanges arms and restores geometry and modulo wrists when applied twice", () => {
    const pose = presetPose("Arms Crossed", "R2-C6");
    pose.left.wrist = (350 * Math.PI) / 180;
    pose.right.wrist = 1.7;
    const before = clonePose(pose),
      mirrored = mirrorPose(pose),
      restored = mirrorPose(mirrored);
    expect(mirrored.id).toBe(pose.id);
    expect(mirrored.left.hand[0]).toBe(-pose.right.hand[0]);
    for (const side of ["left", "right"] as const) {
      expect(restored[side].hand).toEqual(before[side].hand);
      expect(restored[side].elbowPole).toEqual(before[side].elbowPole);
      expect(
        Math.atan2(
          Math.sin(restored[side].wrist - before[side].wrist),
          Math.cos(restored[side].wrist - before[side].wrist),
        ),
      ).toBeCloseTo(0, 9);
      expect(restored[side].wrist).toBeGreaterThanOrEqual(0);
      expect(restored[side].wrist).toBeLessThan(TAU);
    }
    expect(pose).toEqual(before);
  });
});

import type { ArmPose, StudentPose, Vec3 } from "./types";
import { clampArm, wrapWrist } from "./ik";

export const PRESET_NAMES = [
  "Neutral",
  "Both Arms Up",
  "Both Arms Down",
  "T Pose",
  "Left Arm Up",
  "Right Arm Up",
  "V Pose",
  "Inverted V",
  "Arms Forward",
  "Arms Crossed",
];
export function cloneArm(arm: ArmPose): ArmPose {
  return {
    hand: [...arm.hand],
    elbowPole: [...arm.elbowPole],
    wrist: arm.wrist,
  };
}
export function clonePose(pose: StudentPose): StudentPose {
  return {
    id: pose.id,
    left: cloneArm(pose.left),
    right: cloneArm(pose.right),
  };
}
export function clonePoses(poses: readonly StudentPose[]): StudentPose[] {
  return poses.map(clonePose);
}

export function presetPose(name: string, id: string): StudentPose {
  if (!PRESET_NAMES.includes(name))
    throw new Error(`Unknown pose preset: ${name}`);
  let left: Vec3 = [0.35, 0.66, 0.1],
    right: Vec3 = [-0.35, 0.66, 0.1];
  switch (name) {
    case "Both Arms Up":
      left = [0.24, 2.11, 0.02];
      right = [-0.24, 2.11, 0.02];
      break;
    case "Both Arms Down":
      left = [0.24, 0.59, 0.02];
      right = [-0.24, 0.59, 0.02];
      break;
    case "T Pose":
      left = [1, 1.35, 0.02];
      right = [-1, 1.35, 0.02];
      break;
    case "Left Arm Up":
      left = [0.24, 2.11, 0.02];
      break;
    case "Right Arm Up":
      right = [-0.24, 2.11, 0.02];
      break;
    case "V Pose":
      left = [0.78, 1.89, 0.02];
      right = [-0.78, 1.89, 0.02];
      break;
    case "Inverted V":
      left = [0.78, 0.81, 0.02];
      right = [-0.78, 0.81, 0.02];
      break;
    case "Arms Forward":
      left = [0.24, 1.35, 0.76];
      right = [-0.24, 1.35, 0.76];
      break;
    case "Arms Crossed":
      left = [-0.28, 1.17, 0.32];
      right = [0.28, 1.17, 0.4];
      break;
  }
  return {
    id,
    left: clampArm("left", {
      hand: left,
      elbowPole: [0.65, 1.05, 0.45],
      wrist: 0,
    }),
    right: clampArm("right", {
      hand: right,
      elbowPole: [-0.65, 1.05, 0.45],
      wrist: 0,
    }),
  };
}

export function mirrorPose(pose: StudentPose): StudentPose {
  const left = cloneArm(pose.right),
    right = cloneArm(pose.left);
  for (const arm of [left, right]) {
    arm.hand[0] = -arm.hand[0];
    arm.elbowPole[0] = -arm.elbowPole[0];
    arm.wrist = wrapWrist(-arm.wrist);
  }
  return { id: pose.id, left, right };
}

export type Vec3 = [number, number, number];
export type ArmSide = "left" | "right";
export type ArmPose = { hand: Vec3; elbowPole: Vec3; wrist: number };
export type StudentPose = { id: string; left: ArmPose; right: ArmPose };
export type Keyframe = { id: string; time: number; poses: StudentPose[] };
export type Project = {
  schemaVersion: 1;
  name: string;
  gloveColors: { palm: string; back: string };
  poses: StudentPose[];
  duration: number;
  playhead: number;
  interpolation: "smooth" | "step";
  keyframes: Keyframe[];
};
export type ArmSolution = {
  shoulder: Vec3;
  elbow: Vec3;
  hand: Vec3;
  wristQuaternion: [number, number, number, number];
};
export type ControlPoint = "hand" | "elbow";
export type CameraView =
  | "Perspective 3D"
  | "Front"
  | "Back"
  | "Left"
  | "Right"
  | "Top"
  | "Audience View";

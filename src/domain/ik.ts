import type { ArmPose, ArmSide, ArmSolution } from "./types";

export const ARM_LENGTH = 0.4;
export const TAU = Math.PI * 2;
export function wrapWrist(angle: number): number {
  return angle >= 0 && angle < TAU ? angle : ((angle % TAU) + TAU) % TAU;
}
export function makeArmSolution(): ArmSolution {
  return {
    shoulder: [0, 0, 0],
    elbow: [0, 0, 0],
    hand: [0, 0, 0],
    wristQuaternion: [0, 0, 0, 1],
  };
}

/** Allocation-free two-bone solve, with a body-relative, rolled glove frame. */
export function solveArm(
  side: ArmSide,
  pose: ArmPose,
  out: ArmSolution,
): ArmSolution {
  const sx = side === "left" ? 0.24 : -0.24,
    sy = 1.35;
  let nx = pose.hand[0] - sx,
    ny = pose.hand[1] - sy,
    nz = pose.hand[2];
  const scale = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz));
  let length = 0;
  if (scale === 0) {
    nx = 0;
    ny = -1;
    nz = 0;
  } else {
    nx /= scale;
    ny /= scale;
    nz /= scale;
    const unitLength = Math.hypot(nx, ny, nz);
    nx /= unitLength;
    ny /= unitLength;
    nz /= unitLength;
    length = scale * unitLength;
  }
  const d = Math.min(0.799, Math.max(0.001, length));
  const hx = sx + nx * d,
    hy = sy + ny * d,
    hz = nz * d;
  let px = pose.elbowPole[0] - sx,
    py = pose.elbowPole[1] - sy,
    pz = pose.elbowPole[2];
  // Rescaling very large finite poles prevents dot-product overflow.
  const poleScale = Math.max(1, Math.abs(px), Math.abs(py), Math.abs(pz));
  px /= poleScale;
  py /= poleScale;
  pz /= poleScale;
  let dot = px * nx + py * ny + pz * nz;
  px -= nx * dot;
  py -= ny * dot;
  pz -= nz * dot;
  let poleLength = Math.hypot(px, py, pz);
  if (poleLength < 1e-6 / poleScale) {
    dot = nz;
    px = -nx * dot;
    py = -ny * dot;
    pz = 1 - nz * dot;
    poleLength = Math.hypot(px, py, pz);
    if (poleLength < 1e-6) {
      dot = nx;
      px = 1 - nx * dot;
      py = -ny * dot;
      pz = -nz * dot;
      poleLength = Math.hypot(px, py, pz);
    }
  }
  const a = d / 2,
    h = Math.sqrt(Math.max(0, ARM_LENGTH * ARM_LENGTH - a * a));
  const ex = sx + a * nx + (h * px) / poleLength;
  const ey = sy + a * ny + (h * py) / poleLength;
  const ez = a * nz + (h * pz) / poleLength;
  out.shoulder[0] = sx;
  out.shoulder[1] = sy;
  out.shoulder[2] = 0;
  out.elbow[0] = ex;
  out.elbow[1] = ey;
  out.elbow[2] = ez;
  out.hand[0] = hx;
  out.hand[1] = hy;
  out.hand[2] = hz;

  // Glove local +Y follows the forearm, local +Z is its reference palm normal.
  const yx = (hx - ex) / ARM_LENGTH,
    yy = (hy - ey) / ARM_LENGTH,
    yz = (hz - ez) / ARM_LENGTH;
  let zx = -yx * yz,
    zy = -yy * yz,
    zz = 1 - yz * yz;
  let norm = Math.hypot(zx, zy, zz);
  if (norm < 1e-6) {
    zx = -yx * yy;
    zy = 1 - yy * yy;
    zz = -yz * yy;
    norm = Math.hypot(zx, zy, zz);
    if (norm < 1e-6) {
      zx = 1 - yx * yx;
      zy = -yy * yx;
      zz = -yz * yx;
      norm = Math.hypot(zx, zy, zz);
    }
  }
  zx /= norm;
  zy /= norm;
  zz /= norm;
  const xx = yy * zz - yz * zy,
    xy = yz * zx - yx * zz,
    xz = yx * zy - yy * zx;
  const c = Math.cos(pose.wrist),
    s = Math.sin(pose.wrist);
  const m11 = xx * c - zx * s,
    m21 = xy * c - zy * s,
    m31 = xz * c - zz * s;
  const m12 = yx,
    m22 = yy,
    m32 = yz;
  const m13 = zx * c + xx * s,
    m23 = zy * c + xy * s,
    m33 = zz * c + xz * s;
  const q = out.wristQuaternion,
    trace = m11 + m22 + m33;
  if (trace > 0) {
    const t = 2 * Math.sqrt(trace + 1);
    q[3] = t / 4;
    q[0] = (m32 - m23) / t;
    q[1] = (m13 - m31) / t;
    q[2] = (m21 - m12) / t;
  } else if (m11 > m22 && m11 > m33) {
    const t = 2 * Math.sqrt(1 + m11 - m22 - m33);
    q[3] = (m32 - m23) / t;
    q[0] = t / 4;
    q[1] = (m12 + m21) / t;
    q[2] = (m13 + m31) / t;
  } else if (m22 > m33) {
    const t = 2 * Math.sqrt(1 + m22 - m11 - m33);
    q[3] = (m13 - m31) / t;
    q[0] = (m12 + m21) / t;
    q[1] = t / 4;
    q[2] = (m23 + m32) / t;
  } else {
    const t = 2 * Math.sqrt(1 + m33 - m11 - m22);
    q[3] = (m21 - m12) / t;
    q[0] = (m13 + m31) / t;
    q[1] = (m23 + m32) / t;
    q[2] = t / 4;
  }
  return out;
}

export function clampArm(side: ArmSide, pose: ArmPose): ArmPose {
  const distance = Math.hypot(
    pose.hand[0] - (side === "left" ? 0.24 : -0.24),
    pose.hand[1] - 1.35,
    pose.hand[2],
  );
  const hand =
    distance >= 0.001 && distance <= 0.799
      ? pose.hand
      : solveArm(side, pose, makeArmSolution()).hand;
  return {
    hand: [...hand],
    elbowPole: [...pose.elbowPole],
    wrist: wrapWrist(pose.wrist),
  };
}

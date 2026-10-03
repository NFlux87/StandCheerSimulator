import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  ExtrudeGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { STUDENT_COUNT, STUDENT_IDS, studentOrigin } from "../domain/formation";
import { makeArmSolution, solveArm } from "../domain/ik";
import type { ArmSide, StudentPose } from "../domain/types";

type Batch = InstancedMesh<BufferGeometry, Material>;
const ARM_SIDES: readonly ArmSide[] = ["left", "right"];
const cyan = new Color("#69D9EB"),
  shirt = new Color("#D5DADF"),
  white = new Color("#F5FBFF");

/** Shared geometry and materials: every visible anatomical part is an instance. */
export class MannequinRig {
  readonly pickables: Batch[] = [];
  readonly origins: Vector3[] = [];
  readonly leftHands: Vector3[] = [];
  readonly rightHands: Vector3[] = [];
  readonly leftElbows: Vector3[] = [];
  readonly rightElbows: Vector3[] = [];
  private readonly all: Batch[] = [];
  private readonly dynamic: Batch[] = [];
  private readonly materials = new Set<Material>();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly torso: Batch;
  private readonly shell: Batch;
  private readonly rings: Batch;
  private readonly arms: Record<
    ArmSide,
    {
      upper: Batch;
      fore: Batch;
      shoulder: Batch;
      elbow: Batch;
      wrist: Batch;
      edge: Batch;
      palm: Batch;
      back: Batch;
    }
  >;
  readonly palmMaterial = new MeshLambertMaterial({ color: "#F8CF48" });
  readonly backMaterial = new MeshLambertMaterial({
    color: "#4268E8",
    side: BackSide,
  });
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly axis = new Vector3(0, 1, 0);
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly solution = makeArmSolution();
  private readonly cache = new Float64Array(STUDENT_COUNT * 14).fill(NaN);
  private selection = new Set<string>();
  private palmColor = "";
  private backColor = "";

  constructor(private readonly scene: Scene) {
    const clothing = new MeshLambertMaterial({
      color: "#FFFFFF",
      flatShading: true,
    });
    const dark = new MeshLambertMaterial({
      color: "#35404E",
      flatShading: true,
    });
    const skin = new MeshLambertMaterial({
      color: "#D9B6A1",
      flatShading: true,
    });
    const shoe = new MeshLambertMaterial({ color: "#202731" });
    const edge = new MeshLambertMaterial({ color: "#303641" });
    const highlight = new MeshBasicMaterial({
      color: cyan,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    const ringMaterial = new MeshBasicMaterial({ color: cyan });
    const headGeometry = new SphereGeometry(0.16, 8, 6);
    const jointGeometry = new SphereGeometry(1, 8, 6);
    const limbGeometry = new CylinderGeometry(1, 1, 1, 7);
    const torsoGeometry = new CylinderGeometry(0.245, 0.18, 0.48, 6);
    this.torso = this.batch(torsoGeometry, clothing);
    this.shell = this.batch(
      new CylinderGeometry(0.27, 0.205, 0.51, 6),
      highlight,
      false,
    );
    this.rings = this.batch(
      new TorusGeometry(0.3, 0.023, 5, 28),
      ringMaterial,
      false,
    );
    const head = this.batch(headGeometry, skin);
    const neck = this.batch(limbGeometry, skin);
    const leftEye = this.batch(new BoxGeometry(0.026, 0.028, 0.018), shoe);
    const rightEye = this.batch(new BoxGeometry(0.026, 0.028, 0.018), shoe);
    const hips = this.batch(new BoxGeometry(0.34, 0.17, 0.2), dark);
    const leftLeg = this.batch(limbGeometry, dark),
      rightLeg = this.batch(limbGeometry, dark);
    const leftFoot = this.batch(new BoxGeometry(0.13, 0.1, 0.26), shoe),
      rightFoot = this.batch(new BoxGeometry(0.13, 0.1, 0.26), shoe);
    const shape = new Shape();
    shape.moveTo(-0.055, -0.02);
    shape.lineTo(0.055, -0.02);
    shape.lineTo(0.1, 0.075);
    shape.lineTo(0.15, 0.1);
    shape.lineTo(0.145, 0.16);
    shape.lineTo(0.09, 0.17);
    shape.lineTo(0.085, 0.245);
    shape.quadraticCurveTo(0, 0.29, -0.085, 0.245);
    shape.lineTo(-0.1, 0.09);
    shape.closePath();
    const gloveEdge = new ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelSize: 0.007,
      bevelThickness: 0.005,
      bevelSegments: 1,
      steps: 1,
      curveSegments: 3,
    });
    gloveEdge.translate(0, 0, -0.03);
    const palmGeometry = new ShapeGeometry(shape, 3);
    palmGeometry.translate(0, 0, 0.036);
    const backGeometry = new ShapeGeometry(shape, 3);
    backGeometry.translate(0, 0, -0.036);
    const makeArm = () => ({
      upper: this.batch(limbGeometry, clothing),
      fore: this.batch(limbGeometry, skin),
      shoulder: this.batch(jointGeometry, clothing),
      elbow: this.batch(jointGeometry, skin),
      wrist: this.batch(jointGeometry, skin),
      edge: this.batch(gloveEdge, edge),
      palm: this.batch(palmGeometry, this.palmMaterial),
      back: this.batch(backGeometry, this.backMaterial),
    });
    this.arms = { left: makeArm(), right: makeArm() };
    this.dynamic.push(
      ...Object.values(this.arms.left),
      ...Object.values(this.arms.right),
    );
    for (const side of ["left", "right"] as const)
      for (const batch of Object.values(this.arms[side]))
        batch.userData.side = side;
    for (let i = 0; i < STUDENT_COUNT; i++) {
      const origin = new Vector3().fromArray(studentOrigin(i));
      this.origins.push(origin);
      this.leftHands.push(new Vector3());
      this.rightHands.push(new Vector3());
      this.leftElbows.push(new Vector3());
      this.rightElbows.push(new Vector3());
      this.set(this.torso, i, origin.x, origin.y + 1.13, origin.z, 1, 1, 1);
      this.torso.setColorAt(i, shirt);
      this.set(head, i, origin.x, origin.y + 1.62, origin.z, 1, 1.04, 0.94);
      this.set(
        leftEye,
        i,
        origin.x + 0.052,
        origin.y + 1.65,
        origin.z + 0.145,
        1,
        1,
        1,
      );
      this.set(
        rightEye,
        i,
        origin.x - 0.052,
        origin.y + 1.65,
        origin.z + 0.145,
        1,
        1,
        1,
      );
      this.set(
        neck,
        i,
        origin.x,
        origin.y + 1.43,
        origin.z,
        0.075,
        0.14,
        0.075,
      );
      this.set(hips, i, origin.x, origin.y + 0.8, origin.z, 1, 1, 1);
      this.set(
        leftLeg,
        i,
        origin.x + 0.1,
        origin.y + 0.43,
        origin.z,
        0.071,
        0.64,
        0.078,
      );
      this.set(
        rightLeg,
        i,
        origin.x - 0.1,
        origin.y + 0.43,
        origin.z,
        0.071,
        0.64,
        0.078,
      );
      this.set(
        leftFoot,
        i,
        origin.x + 0.1,
        origin.y + 0.055,
        origin.z + 0.065,
        1,
        1,
        1,
      );
      this.set(
        rightFoot,
        i,
        origin.x - 0.1,
        origin.y + 0.055,
        origin.z + 0.065,
        1,
        1,
        1,
      );
      this.set(this.shell, i, origin.x, origin.y + 1.13, origin.z, 0, 0, 0);
      this.rotation.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
      this.set(
        this.rings,
        i,
        origin.x,
        origin.y + 0.025,
        origin.z,
        0,
        0,
        0,
        this.rotation,
      );
    }
    for (const batch of this.all) this.flush(batch);
  }

  private batch(
    geometry: BufferGeometry,
    material: Material,
    pickable = true,
  ): Batch {
    const batch = new InstancedMesh(geometry, material, STUDENT_COUNT);
    batch.instanceMatrix.setUsage(DynamicDrawUsage);
    batch.userData.students = STUDENT_IDS;
    this.geometries.add(geometry);
    this.materials.add(material);
    this.all.push(batch);
    if (pickable) this.pickables.push(batch);
    this.scene.add(batch);
    return batch;
  }

  private set(
    batch: Batch,
    i: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rotation?: Quaternion,
  ): void {
    this.position.set(x, y, z);
    this.scale.set(sx, sy, sz);
    this.matrix.compose(
      this.position,
      rotation ?? this.rotation.identity(),
      this.scale,
    );
    batch.setMatrixAt(i, this.matrix);
  }

  private segment(
    batch: Batch,
    i: number,
    a: Vector3,
    b: Vector3,
    radius: number,
  ): void {
    this.position.copy(a).add(b).multiplyScalar(0.5);
    this.scale.set(radius, a.distanceTo(b), radius);
    this.b.subVectors(b, a).normalize();
    this.rotation.setFromUnitVectors(this.axis, this.b);
    this.matrix.compose(this.position, this.rotation, this.scale);
    batch.setMatrixAt(i, this.matrix);
  }

  private flush(batch: Batch): void {
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
  }

  update(
    poses: readonly StudentPose[],
    selection: ReadonlySet<string>,
    palm: string,
    back: string,
  ): boolean {
    let poseChanged = false,
      selectionChanged = selection.size !== this.selection.size;
    if (!selectionChanged)
      for (const id of selection)
        if (!this.selection.has(id)) {
          selectionChanged = true;
          break;
        }
    if (palm !== this.palmColor) {
      this.palmMaterial.color.set(palm);
      this.palmColor = palm;
    }
    if (back !== this.backColor) {
      this.backMaterial.color.set(back);
      this.backColor = back;
    }
    for (let i = 0; i < STUDENT_COUNT; i++) {
      const pose = poses[i];
      if (!pose) continue;
      let offset = i * 14,
        changed = false;
      for (const side of ARM_SIDES) {
        const arm = pose[side];
        for (let k = 0; k < 3; k++) {
          if (this.cache[offset] !== arm.hand[k]) changed = true;
          this.cache[offset++] = arm.hand[k]!;
        }
        for (let k = 0; k < 3; k++) {
          if (this.cache[offset] !== arm.elbowPole[k]) changed = true;
          this.cache[offset++] = arm.elbowPole[k]!;
        }
        if (this.cache[offset] !== arm.wrist) changed = true;
        this.cache[offset++] = arm.wrist;
      }
      if (changed) {
        poseChanged = true;
        for (const side of ARM_SIDES) {
          const solved = solveArm(side, pose[side], this.solution),
            parts = this.arms[side],
            origin = this.origins[i]!;
          this.a.fromArray(solved.shoulder).add(origin);
          const elbow =
            side === "left" ? this.leftElbows[i]! : this.rightElbows[i]!;
          const hand =
            side === "left" ? this.leftHands[i]! : this.rightHands[i]!;
          elbow.fromArray(solved.elbow).add(origin);
          hand.fromArray(solved.hand).add(origin);
          this.segment(parts.upper, i, this.a, elbow, 0.07);
          this.segment(parts.fore, i, elbow, hand, 0.052);
          this.set(
            parts.shoulder,
            i,
            this.a.x,
            this.a.y,
            this.a.z,
            0.082,
            0.082,
            0.082,
          );
          this.set(parts.elbow, i, elbow.x, elbow.y, elbow.z, 0.06, 0.06, 0.06);
          this.set(parts.wrist, i, hand.x, hand.y, hand.z, 0.045, 0.045, 0.045);
          this.rotation.fromArray(solved.wristQuaternion);
          this.set(
            parts.edge,
            i,
            hand.x,
            hand.y,
            hand.z,
            1,
            1,
            1,
            this.rotation,
          );
          this.set(
            parts.palm,
            i,
            hand.x,
            hand.y,
            hand.z,
            1,
            1,
            1,
            this.rotation,
          );
          this.set(
            parts.back,
            i,
            hand.x,
            hand.y,
            hand.z,
            1,
            1,
            1,
            this.rotation,
          );
        }
      }
      if (selectionChanged) {
        const selected = selection.has(pose.id),
          origin = this.origins[i]!;
        this.torso.setColorAt(i, selected ? white : shirt);
        this.set(
          this.shell,
          i,
          origin.x,
          origin.y + 1.13,
          origin.z,
          selected ? 1 : 0,
          selected ? 1 : 0,
          selected ? 1 : 0,
        );
        this.rotation.setFromAxisAngle(this.a.set(1, 0, 0), Math.PI / 2);
        this.set(
          this.rings,
          i,
          origin.x,
          origin.y + 0.025,
          origin.z,
          selected ? 1 : 0,
          selected ? 1 : 0,
          selected ? 1 : 0,
          this.rotation,
        );
      }
    }
    if (poseChanged) for (const batch of this.dynamic) this.flush(batch);
    if (selectionChanged) {
      this.selection = new Set(selection);
      this.flush(this.shell);
      this.flush(this.rings);
      if (this.torso.instanceColor) this.torso.instanceColor.needsUpdate = true;
    }
    return poseChanged || selectionChanged;
  }

  dispose(): void {
    for (const batch of this.all) {
      this.scene.remove(batch);
      batch.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}

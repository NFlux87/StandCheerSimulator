import {
  MOUSE,
  Mesh,
  Object3D,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
} from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { TransformControls } from "three/addons/controls/TransformControls.js";
import { STUDENT_IDS, studentIndex } from "../domain/formation";
import type { ArmPose, ArmSide, ControlPoint, Vec3 } from "../domain/types";
import { editor } from "../state/editorStore";
import type { StandCamera } from "./cameras";
import type { MannequinRig } from "./mannequins";

export type Marquee = { x: number; y: number; width: number; height: number };
export type ArmHandle = Mesh & {
  userData: { side: ArmSide; control: ControlPoint };
};
export interface InteractionHost {
  readonly canvas: HTMLCanvasElement;
  readonly camera: StandCamera;
  readonly orbit: OrbitControls;
  readonly transform: TransformControls;
  readonly proxy: Object3D;
  readonly rig: MannequinRig;
  readonly handles: ArmHandle[];
  invalidate(): void;
  setHover(id: string | null): void;
  setMarquee(value: Marquee | null): void;
}

type Press = {
  pointer: number;
  x: number;
  y: number;
  id: string | null;
  shift: boolean;
  marquee: boolean;
};

export class SceneInteractions {
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly plane = new Plane();
  private readonly normal = new Vector3();
  private readonly start = new Vector3();
  private readonly anchor = new Vector3();
  private readonly point = new Vector3();
  private readonly local = new Vector3();
  private readonly localPosition: Vec3 = [0, 0, 0];
  private readonly handChange: Partial<ArmPose> = { hand: this.localPosition };
  private readonly elbowChange: Partial<ArmPose> = {
    elbowPole: this.localPosition,
  };
  private readonly projected = new Vector3();
  private readonly hits: Intersection[] = [];
  private press: Press | null = null;
  private direct: {
    pointer: number;
    side: ArmSide;
    control: ControlPoint;
  } | null = null;
  private gizmo = false;
  private gizmoPointer: number | null = null;
  private altOrbit = false;
  private disposed = false;

  constructor(private readonly host: InteractionHost) {
    const canvas = host.canvas;
    canvas.addEventListener("pointerdown", this.captureDown, true);
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerCancel);
    canvas.addEventListener("lostpointercapture", this.lostCapture);
    canvas.addEventListener("pointerleave", this.pointerLeave);
    canvas.addEventListener("contextmenu", this.contextMenu);
    window.addEventListener("keydown", this.keyDown);
    host.transform.addEventListener("mouseDown", this.gizmoDown);
    host.transform.addEventListener("objectChange", this.gizmoChange);
    host.transform.addEventListener("mouseUp", this.gizmoUp);
  }

  get editing(): boolean {
    return this.direct !== null || this.gizmo;
  }
  get gesturing(): boolean {
    return this.editing || this.press !== null;
  }

  private setRay(event: PointerEvent): void {
    const rect = this.host.canvas.getBoundingClientRect();
    this.ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.host.camera);
  }

  private captureDown = (event: PointerEvent): void => {
    this.altOrbit = event.button === 0 && event.altKey;
    if (this.altOrbit) {
      this.host.orbit.mouseButtons.LEFT = MOUSE.ROTATE;
      this.host.transform.enabled = false;
    }
    // Capture before either control sees the event so an edit always owns it.
    if (
      event.button === 0 &&
      !event.altKey &&
      editor.getSnapshot().mode === "select"
    ) {
      this.setRay(event);
      // Three's public pointer methods consume normalized coordinates despite their DOM-event typings.
      this.host.transform.pointerHover(
        new PointerEvent("pointermove", {
          clientX: this.ndc.x,
          clientY: this.ndc.y,
          button: 0,
        }),
      );
      const gizmoHit =
        this.host.transform.axis !== null &&
        this.host.transform.object !== undefined;
      this.host.transform.enabled = gizmoHit;
      if (gizmoHit) {
        this.gizmoPointer = event.pointerId;
        this.host.orbit.enabled = false;
      }
    }
  };

  private pointerDown = (event: PointerEvent): void => {
    if (
      event.button !== 0 ||
      event.altKey ||
      editor.getSnapshot().mode === "orbit" ||
      this.gizmo
    )
      return;
    if (this.host.transform.axis !== null && this.host.transform.object) return;
    this.setRay(event);
    this.hits.length = 0;
    this.raycaster.intersectObjects(
      this.host.handles.filter((handle) => handle.visible),
      false,
      this.hits,
    );
    const handle = this.hits[0]?.object as ArmHandle | undefined;
    if (handle) {
      const { side, control } = handle.userData;
      editor.setActive(side, control);
      editor.beginEdit(`Move ${side} ${control}`);
      this.direct = { pointer: event.pointerId, side, control };
      this.host.orbit.enabled = false;
      this.host.transform.enabled = false;
      this.anchor.copy(handle.position);
      this.host.camera.getWorldDirection(this.normal);
      this.plane.setFromNormalAndCoplanarPoint(this.normal, this.anchor);
      this.raycaster.ray.intersectPlane(this.plane, this.start);
      this.capture(event.pointerId);
      event.preventDefault();
      this.host.invalidate();
      return;
    }
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.host.rig.pickables, false, this.hits);
    const hit = this.hits[0];
    const id =
      hit?.instanceId === undefined
        ? null
        : (STUDENT_IDS[hit.instanceId] ?? null);
    const rect = this.host.canvas.getBoundingClientRect();
    this.press = {
      pointer: event.pointerId,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      id,
      shift: event.shiftKey,
      marquee: false,
    };
    this.host.orbit.enabled = false;
    this.capture(event.pointerId);
    this.host.invalidate();
  };

  private pointerMove = (event: PointerEvent): void => {
    this.setRay(event);
    if (this.direct && event.pointerId === this.direct.pointer) {
      if (this.raycaster.ray.intersectPlane(this.plane, this.point)) {
        this.point.sub(this.start).add(this.anchor);
        this.previewPoint(this.point, this.direct.side, this.direct.control);
      }
      return;
    }
    if (this.press && event.pointerId === this.press.pointer) {
      const rect = this.host.canvas.getBoundingClientRect(),
        x = event.clientX - rect.left,
        y = event.clientY - rect.top;
      if (!this.press.id && Math.hypot(x - this.press.x, y - this.press.y) > 5)
        this.press.marquee = true;
      if (this.press.marquee)
        this.host.setMarquee({
          x: Math.min(x, this.press.x),
          y: Math.min(y, this.press.y),
          width: Math.abs(x - this.press.x),
          height: Math.abs(y - this.press.y),
        });
      return;
    }
    if (this.gizmo || this.altOrbit || event.buttons) return;
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.host.rig.pickables, false, this.hits);
    const hit = this.hits[0];
    this.host.setHover(
      hit?.instanceId === undefined
        ? null
        : (STUDENT_IDS[hit.instanceId] ?? null),
    );
  };

  private previewPoint(
    world: Vector3,
    side: ArmSide,
    control: ControlPoint,
  ): void {
    const activeId = editor.getSnapshot().activeId;
    if (!activeId) return;
    const index = studentIndex(activeId);
    const origin = this.host.rig.origins[index];
    if (!origin) return;
    this.local.copy(world).sub(origin);
    this.localPosition[0] = this.local.x;
    this.localPosition[1] = this.local.y;
    this.localPosition[2] = this.local.z;
    editor.previewArm(
      side,
      control === "hand" ? this.handChange : this.elbowChange,
    );
    this.host.invalidate();
  }

  private pointerUp = (event: PointerEvent): void => {
    if (this.direct && event.pointerId === this.direct.pointer) {
      this.direct = null;
      editor.commitEdit();
      this.finishPointer(event.pointerId);
    } else if (this.press && event.pointerId === this.press.pointer) {
      const press = this.press;
      this.press = null;
      if (press.marquee) {
        const rect = this.host.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left,
          y = event.clientY - rect.top;
        const ids = this.marqueeIds({
          x: Math.min(x, press.x),
          y: Math.min(y, press.y),
          width: Math.abs(x - press.x),
          height: Math.abs(y - press.y),
        });
        editor.select(
          press.shift
            ? Array.from(new Set([...editor.getSnapshot().selection, ...ids]))
            : ids,
        );
      } else if (press.id) {
        if (press.shift) editor.toggleStudent(press.id);
        else editor.select([press.id], press.id);
      } else if (!press.shift) editor.select([]);
      this.host.setMarquee(null);
      this.finishPointer(event.pointerId);
    }
    if (this.altOrbit) {
      this.altOrbit = false;
      this.configureOrbit();
      this.host.transform.enabled =
        editor.getSnapshot().mode === "select" &&
        editor.getSnapshot().selection.size > 0;
    }
  };

  private marqueeIds(rect: Marquee): string[] {
    const width = this.host.canvas.clientWidth,
      height = this.host.canvas.clientHeight;
    const result: string[] = [];
    for (let i = 0; i < STUDENT_IDS.length; i++) {
      const origin = this.host.rig.origins[i]!;
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity,
        visible = false;
      // A body's envelope includes the head, torso, and both fully posed arms.
      for (let k = 0; k < 8; k++) {
        if (k < 4)
          this.projected.set(
            origin.x + (k % 2 ? 0.27 : -0.27),
            origin.y + (k < 2 ? 0.76 : 1.8),
            origin.z,
          );
        else
          this.projected.copy(
            k === 4
              ? this.host.rig.leftHands[i]!
              : k === 5
                ? this.host.rig.rightHands[i]!
                : k === 6
                  ? this.host.rig.leftElbows[i]!
                  : this.host.rig.rightElbows[i]!,
          );
        this.projected.project(this.host.camera);
        if (this.projected.z < -1 || this.projected.z > 1) continue;
        const x = (this.projected.x + 1) * 0.5 * width,
          y = (1 - this.projected.y) * 0.5 * height;
        visible ||= x >= 0 && x <= width && y >= 0 && y <= height;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      if (
        visible &&
        maxX >= rect.x &&
        minX <= rect.x + rect.width &&
        maxY >= rect.y &&
        minY <= rect.y + rect.height
      )
        result.push(STUDENT_IDS[i]!);
    }
    return result;
  }

  private gizmoDown = (): void => {
    if (this.direct || this.gizmo) return;
    this.press = null;
    this.gizmo = true;
    this.host.orbit.enabled = false;
    const state = editor.getSnapshot();
    editor.beginEdit(`Move ${state.activeSide} ${state.activeControl}`);
    this.host.invalidate();
  };
  private gizmoChange = (): void => {
    if (!this.gizmo) return;
    const state = editor.getSnapshot();
    this.previewPoint(
      this.host.proxy.position,
      state.activeSide,
      state.activeControl,
    );
  };
  private gizmoUp = (): void => {
    if (!this.gizmo) return;
    this.gizmo = false;
    this.gizmoPointer = null;
    editor.commitEdit();
    this.configureOrbit();
    this.host.invalidate();
  };

  configureOrbit(): void {
    const orbit = this.host.orbit;
    orbit.enabled = !this.editing && !this.press;
    orbit.mouseButtons.LEFT =
      editor.getSnapshot().mode === "orbit" || this.altOrbit
        ? MOUSE.ROTATE
        : null;
    orbit.mouseButtons.MIDDLE = MOUSE.PAN;
    orbit.mouseButtons.RIGHT = MOUSE.ROTATE;
    const state = editor.getSnapshot();
    this.host.transform.enabled =
      state.mode === "select" &&
      state.selection.size > 0 &&
      !this.direct &&
      !this.press &&
      !this.altOrbit;
  }

  private capture(pointer: number): void {
    try {
      this.host.canvas.setPointerCapture(pointer);
    } catch {
      /* A released hardware pointer cannot be captured. */
    }
  }
  private finishPointer(pointer: number): void {
    if (this.host.canvas.hasPointerCapture(pointer))
      this.host.canvas.releasePointerCapture(pointer);
    this.configureOrbit();
    this.host.invalidate();
  }
  cancel(): void {
    const pointer =
      this.direct?.pointer ?? this.press?.pointer ?? this.gizmoPointer;
    const editing = this.editing;
    this.direct = null;
    this.press = null;
    this.gizmo = false;
    this.altOrbit = false;
    this.gizmoPointer = null;
    // Stop TransformControls before its later pointerup can commit a cancelled edit.
    this.host.transform.dragging = false;
    this.host.transform.axis = null;
    if (editing) editor.cancelEdit();
    this.host.setMarquee(null);
    if (pointer != null) this.finishPointer(pointer);
    else {
      this.configureOrbit();
      this.host.invalidate();
    }
  }
  private pointerCancel = (): void => {
    this.cancel();
  };
  private lostCapture = (): void => {
    if (this.direct || this.press || this.gizmo) this.cancel();
  };
  private pointerLeave = (): void => {
    if (!this.gesturing) this.host.setHover(null);
  };
  private contextMenu = (event: Event): void => {
    event.preventDefault();
  };
  private keyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.gesturing) {
      event.preventDefault();
      this.cancel();
    }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    const canvas = this.host.canvas;
    canvas.removeEventListener("pointerdown", this.captureDown, true);
    canvas.removeEventListener("pointerdown", this.pointerDown);
    canvas.removeEventListener("pointermove", this.pointerMove);
    canvas.removeEventListener("pointerup", this.pointerUp);
    canvas.removeEventListener("pointercancel", this.pointerCancel);
    canvas.removeEventListener("lostpointercapture", this.lostCapture);
    canvas.removeEventListener("pointerleave", this.pointerLeave);
    canvas.removeEventListener("contextmenu", this.contextMenu);
    window.removeEventListener("keydown", this.keyDown);
    this.host.transform.removeEventListener("mouseDown", this.gizmoDown);
    this.host.transform.removeEventListener("objectChange", this.gizmoChange);
    this.host.transform.removeEventListener("mouseUp", this.gizmoUp);
  }
}

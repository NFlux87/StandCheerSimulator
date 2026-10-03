import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { studentIndex } from "../domain/formation";
import type { ArmSide, CameraView, ControlPoint } from "../domain/types";
import { editor } from "../state/editorStore";
import {
  createCamera,
  fitCamera,
  STAND_CENTER,
  type StandCamera,
} from "./cameras";
import {
  SceneInteractions,
  type ArmHandle,
  type Marquee,
} from "./interactions";
import { MannequinRig } from "./mannequins";

export type SceneOverlay = {
  labels: {
    kind: "row" | "column";
    value: number;
    x: number;
    y: number;
    visible: boolean;
  }[];
  handles: {
    side: ArmSide;
    control: ControlPoint;
    x: number;
    y: number;
    visible: boolean;
  }[];
  hover: string | null;
  marquee: Marquee | null;
  view: CameraView;
};
type Callbacks = {
  onOverlay: (overlay: SceneOverlay) => void;
  onError: (message: string) => void;
};

/** The viewport has one animation owner; idle editing does not consume a continuous RAF. */
export class StandScene {
  readonly renderer: WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  camera: StandCamera;
  orbit: OrbitControls;
  readonly transform: TransformControls;
  readonly proxy = new Object3D();
  readonly rig: MannequinRig;
  readonly handles: ArmHandle[] = [];
  private readonly scene = new Scene();
  private readonly interactions: SceneInteractions;
  private readonly resizeObserver: ResizeObserver;
  private readonly unsubscribe: () => void;
  private readonly staticMeshes: Mesh[] = [];
  private readonly staticMaterials = new Set<Material>();
  private readonly grid: GridHelper;
  private readonly handleGeometry = new SphereGeometry(1, 12, 8);
  private readonly handMaterial = new MeshBasicMaterial({
    color: "#69D9EB",
    depthTest: false,
    depthWrite: false,
  });
  private readonly elbowMaterial = new MeshBasicMaterial({
    color: "#F8CF48",
    depthTest: false,
    depthWrite: false,
  });
  private readonly projection = new Vector3();
  private readonly labelPositions: {
    kind: "row" | "column";
    value: number;
    position: Vector3;
  }[] = [];
  private view: CameraView = "Perspective 3D";
  private hover: string | null = null;
  private marquee: Marquee | null = null;
  private frameRequest = 0;
  private previousTime: number | null = null;
  private lastOverlayTime = -Infinity;
  private disposed = false;
  private contextLost = false;
  private orbiting = false;
  private width = 1;
  private height = 1;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: Callbacks,
  ) {
    try {
      this.renderer = new WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch (error) {
      const message = `WebGL is unavailable. Use a browser with hardware acceleration enabled. ${error instanceof Error ? error.message : ""}`;
      callbacks.onError(message);
      throw new Error(message);
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.canvas = this.renderer.domElement;
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.canvas.style.touchAction = "none";
    this.canvas.setAttribute(
      "aria-label",
      "Interactive three-dimensional cheer formation",
    );
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);
    this.scene.background = new Color("#111820");
    this.width = Math.max(host.clientWidth, 1);
    this.height = Math.max(host.clientHeight, 1);
    this.renderer.setSize(this.width, this.height, false);
    this.camera = createCamera(this.view, this.width / this.height);
    this.scene.add(new HemisphereLight("#E7F1FF", "#666154", 2.4));
    const key = new DirectionalLight("#FFF2DA", 3.1);
    key.position.set(-5, 10, 8);
    this.scene.add(key);
    const rim = new DirectionalLight("#9DBEF5", 1.6);
    rim.position.set(7, 6, -9);
    this.scene.add(rim);
    const platformGeometry = new BoxGeometry(1, 1, 1);
    const platformA = new MeshLambertMaterial({ color: "#39434E" });
    const platformB = new MeshLambertMaterial({ color: "#333D48" });
    const edgeMaterial = new MeshLambertMaterial({ color: "#657583" });
    const groundMaterial = new MeshLambertMaterial({ color: "#171F28" });
    for (let row = 0; row < 6; row++) {
      const top = row * 0.65,
        height = top + 0.11;
      const platform = new Mesh(
        platformGeometry,
        row % 2 ? platformA : platformB,
      );
      platform.position.set(0, top - height / 2, -row * 1.4 - 0.1);
      platform.scale.set(14.35, height, 1.4);
      this.addStatic(platform);
      const lip = new Mesh(platformGeometry, edgeMaterial);
      lip.position.set(0, top - 0.035, -row * 1.4 + 0.596);
      lip.scale.set(14.36, 0.055, 0.026);
      this.addStatic(lip);
      this.labelPositions.push({
        kind: "row",
        value: row + 1,
        position: new Vector3(-7.43, top + 0.32, -row * 1.4),
      });
    }
    const floor = new Mesh(platformGeometry, groundMaterial);
    floor.position.set(0, -0.16, -3.5);
    floor.scale.set(28, 0.09, 25);
    this.addStatic(floor);
    this.grid = new GridHelper(26, 26, "#33424E", "#25313C");
    this.grid.position.set(0, -0.109, -3.5);
    const gridMaterials = Array.isArray(this.grid.material)
      ? this.grid.material
      : [this.grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.36;
    }
    this.scene.add(this.grid);
    for (let column = 1; column <= 12; column++)
      this.labelPositions.push({
        kind: "column",
        value: column,
        position: new Vector3((column - 6.5) * 1.15, 0.025, 0.83),
      });
    this.rig = new MannequinRig(this.scene);
    this.scene.add(this.proxy);
    this.transform = new TransformControls(this.camera, this.canvas);
    this.transform.setMode("translate");
    this.transform.setSpace("world");
    this.transform.setSize(0.7);
    const helper = this.transform.getHelper();
    // Leave the active joint's center clear for immediate plane dragging. Axis/plane gizmos retain priority.
    const centralPickers: Object3D[] = [];
    helper.traverse((object) => {
      if (object.name === "XYZ") centralPickers.push(object);
    });
    for (const object of centralPickers) object.removeFromParent();
    this.scene.add(helper);
    this.transform.addEventListener("change", this.invalidate);
    for (const side of ["left", "right"] as const)
      for (const control of ["hand", "elbow"] as const) {
        const handle: ArmHandle = Object.assign(
          new Mesh(
            this.handleGeometry,
            control === "hand" ? this.handMaterial : this.elbowMaterial,
          ),
          { userData: { side, control } },
        );
        handle.visible = false;
        handle.renderOrder = 20;
        this.handles.push(handle);
        this.scene.add(handle);
      }
    this.orbit = this.createOrbit();
    this.interactions = new SceneInteractions(this);
    this.interactions.configureOrbit();
    this.unsubscribe = editor.subscribeFrame(this.invalidate);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(host);
    document.addEventListener("visibilitychange", this.visibilityChange);
    this.canvas.addEventListener("webglcontextlost", this.webglLost);
    this.canvas.addEventListener("webglcontextrestored", this.webglRestored);
    this.invalidate();
  }

  private addStatic(mesh: Mesh): void {
    this.staticMeshes.push(mesh);
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) this.staticMaterials.add(material);
    this.scene.add(mesh);
  }

  private createOrbit(): OrbitControls {
    const orbit = new OrbitControls(this.camera, this.canvas);
    orbit.target.copy(STAND_CENTER);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.12;
    orbit.minDistance = 3;
    orbit.maxDistance = 75;
    orbit.minZoom = 0.35;
    orbit.maxZoom = 6;
    orbit.screenSpacePanning = true;
    orbit.addEventListener("change", this.invalidate);
    orbit.addEventListener("start", this.orbitStart);
    orbit.addEventListener("end", this.orbitEnd);
    orbit.update();
    return orbit;
  }

  private orbitStart = (): void => {
    this.orbiting = true;
    this.invalidate();
  };
  private orbitEnd = (): void => {
    this.orbiting = false;
    this.invalidate();
  };
  private releaseOrbit(): void {
    this.orbit.removeEventListener("change", this.invalidate);
    this.orbit.removeEventListener("start", this.orbitStart);
    this.orbit.removeEventListener("end", this.orbitEnd);
    this.orbit.dispose();
    this.orbiting = false;
  }

  setView(view: CameraView): void {
    if (this.disposed) return;
    this.interactions.cancel();
    this.releaseOrbit();
    this.view = view;
    this.camera = createCamera(view, this.width / this.height);
    this.transform.camera = this.camera;
    this.orbit = this.createOrbit();
    this.interactions.configureOrbit();
    this.lastOverlayTime = -Infinity;
    this.invalidate();
  }

  setHover(id: string | null): void {
    if (id !== this.hover) {
      this.hover = id;
      this.invalidate();
    }
  }
  setMarquee(value: Marquee | null): void {
    this.marquee = value;
    this.invalidate();
  }
  invalidate = (): void => {
    if (
      !this.disposed &&
      !this.contextLost &&
      !document.hidden &&
      !this.frameRequest
    )
      this.frameRequest = requestAnimationFrame(this.frame);
  };

  private resize = (): void => {
    if (this.disposed) return;
    this.width = Math.max(this.host.clientWidth, 1);
    this.height = Math.max(this.host.clientHeight, 1);
    this.renderer.setSize(this.width, this.height, false);
    fitCamera(this.camera, this.view, this.width / this.height);
    this.orbit.target.copy(STAND_CENTER);
    this.orbit.update();
    this.lastOverlayTime = -Infinity;
    this.invalidate();
  };

  private sync(): void {
    const state = editor.getSnapshot();
    this.rig.update(
      state.displayPoses,
      state.selection,
      state.project.gloveColors.palm,
      state.project.gloveColors.back,
    );
    const index = state.activeId ? studentIndex(state.activeId) : -1;
    const visible = index >= 0 && state.selection.size > 0;
    for (const handle of this.handles) {
      handle.visible = visible;
      if (!visible) continue;
      const { side, control } = handle.userData;
      const points =
        control === "hand"
          ? side === "left"
            ? this.rig.leftHands
            : this.rig.rightHands
          : side === "left"
            ? this.rig.leftElbows
            : this.rig.rightElbows;
      handle.position.copy(points[index]!);
      const worldPerPixel =
        this.camera instanceof PerspectiveCamera
          ? (this.camera.position.distanceTo(handle.position) *
              2 *
              Math.tan((this.camera.fov * Math.PI) / 360)) /
            this.height
          : (this.camera.top - this.camera.bottom) /
            this.camera.zoom /
            this.height;
      handle.scale.setScalar(
        Math.max(0.045, worldPerPixel * (control === "hand" ? 9 : 7)),
      );
      if (side === state.activeSide && control === state.activeControl)
        this.proxy.position.copy(handle.position);
      handle.updateMatrixWorld();
    }
    if (visible && state.mode === "select") {
      if (this.transform.object !== this.proxy)
        this.transform.attach(this.proxy);
      if (this.camera instanceof PerspectiveCamera)
        this.projection
          .subVectors(this.camera.position, this.proxy.position)
          .normalize();
      else this.camera.getWorldDirection(this.projection);
      // Near-view-axis pickers and edge-on planes must not cover the joint's direct-drag target.
      this.transform.showX = Math.abs(this.projection.x) < 0.94;
      this.transform.showY = Math.abs(this.projection.y) < 0.94;
      this.transform.showZ = Math.abs(this.projection.z) < 0.94;
      this.transform.showXY = Math.abs(this.projection.z) > 0.25;
      this.transform.showYZ = Math.abs(this.projection.x) > 0.25;
      this.transform.showXZ = Math.abs(this.projection.y) > 0.25;
    } else {
      this.transform.detach();
      this.transform.enabled = false;
    }
    this.interactions.configureOrbit();
  }

  private frame = (time: number): void => {
    this.frameRequest = 0;
    if (this.disposed || this.contextLost || document.hidden) {
      this.previousTime = null;
      return;
    }
    const elapsed =
      this.previousTime === null
        ? 0
        : Math.max(0, (time - this.previousTime) / 1000);
    this.previousTime = time;
    if (editor.getSnapshot().playing) editor.tick(elapsed);
    const cameraMoved = this.orbit.enabled && this.orbit.update(elapsed);
    this.sync();
    this.renderer.render(this.scene, this.camera);
    const state = editor.getSnapshot();
    if (
      time - this.lastOverlayTime >= 1000 / 30 ||
      (!state.playing &&
        !this.interactions.editing &&
        !this.orbiting &&
        !cameraMoved)
    ) {
      this.emitOverlay();
      this.lastOverlayTime = time;
    }
    if (
      state.playing ||
      this.interactions.gesturing ||
      this.orbiting ||
      cameraMoved
    )
      this.invalidate();
    else if (!this.frameRequest) this.previousTime = null;
  };

  private emitOverlay(): void {
    const labels: SceneOverlay["labels"] = [];
    for (const label of this.labelPositions) {
      this.projection.copy(label.position).project(this.camera);
      labels.push({
        kind: label.kind,
        value: label.value,
        x: (this.projection.x + 1) * 0.5 * this.width,
        y: (1 - this.projection.y) * 0.5 * this.height,
        visible: this.inViewport(this.projection),
      });
    }
    const handles: SceneOverlay["handles"] = [];
    for (const handle of this.handles) {
      this.projection.copy(handle.position).project(this.camera);
      handles.push({
        ...handle.userData,
        x: (this.projection.x + 1) * 0.5 * this.width,
        y: (1 - this.projection.y) * 0.5 * this.height,
        visible: handle.visible && this.inViewport(this.projection),
      });
    }
    this.callbacks.onOverlay({
      labels,
      handles,
      hover: this.hover,
      marquee: this.marquee,
      view: this.view,
    });
  }

  private inViewport(point: Vector3): boolean {
    return (
      point.z >= -1 &&
      point.z <= 1 &&
      Math.abs(point.x) <= 1 &&
      Math.abs(point.y) <= 1
    );
  }
  private visibilityChange = (): void => {
    this.previousTime = null;
    if (document.hidden) {
      if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
      this.frameRequest = 0;
    } else this.invalidate();
  };
  private webglLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.previousTime = null;
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
    this.callbacks.onError(
      "The WebGL graphics context was lost. Restore hardware acceleration or reload the page; save or export your project first.",
    );
  };
  private webglRestored = (): void => {
    this.contextLost = false;
    this.previousTime = null;
    this.invalidate();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.unsubscribe();
    this.resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", this.visibilityChange);
    this.canvas.removeEventListener("webglcontextlost", this.webglLost);
    this.canvas.removeEventListener("webglcontextrestored", this.webglRestored);
    this.interactions.dispose();
    this.releaseOrbit();
    this.transform.removeEventListener("change", this.invalidate);
    this.transform.dispose();
    this.rig.dispose();
    const staticGeometries = new Set(
      this.staticMeshes.map((mesh) => mesh.geometry),
    );
    for (const geometry of staticGeometries) geometry.dispose();
    for (const material of this.staticMaterials) material.dispose();
    this.grid.geometry.dispose();
    for (const material of Array.isArray(this.grid.material)
      ? this.grid.material
      : [this.grid.material])
      material.dispose();
    this.handleGeometry.dispose();
    this.handMaterial.dispose();
    this.elbowMaterial.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}

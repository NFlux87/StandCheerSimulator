import { Box3, OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import type { CameraView } from "../domain/types";

export type StandCamera = PerspectiveCamera | OrthographicCamera;
export const STAND_CENTER = new Vector3(0, 2.7, -3.5);
const bounds = new Box3(
  new Vector3(-7.7, -0.16, -8.1),
  new Vector3(7.7, 5.7, 1.1),
);
const corner = new Vector3(),
  right = new Vector3(),
  up = new Vector3(),
  relative = new Vector3();
const direction = new Vector3();

function viewDirection(view: CameraView): Vector3 {
  switch (view) {
    case "Front":
      return direction.set(0, 0, 1);
    case "Back":
      return direction.set(0, 0, -1);
    case "Left":
      return direction.set(-1, 0, 0);
    case "Right":
      return direction.set(1, 0, 0);
    case "Top":
      return direction.set(0, 1, 0);
    case "Audience View":
      return direction.set(0, 1.65, 17).sub(STAND_CENTER).normalize();
    default:
      return direction.set(12, 11, 17).sub(STAND_CENTER).normalize();
  }
}

export function createCamera(view: CameraView, aspect: number): StandCamera {
  const perspective = view === "Perspective 3D" || view === "Audience View";
  const camera = perspective
    ? new PerspectiveCamera(38, aspect, 0.1, 180)
    : new OrthographicCamera(-1, 1, 1, -1, 0.1, 180);
  fitCamera(camera, view, aspect);
  return camera;
}

export function fitCamera(
  camera: StandCamera,
  view: CameraView,
  aspect: number,
): void {
  aspect = Math.max(0.1, aspect);
  const towardEye = viewDirection(view);
  camera.up.set(0, view === "Top" ? 0 : 1, view === "Top" ? -1 : 0);
  right.crossVectors(camera.up, towardEye).normalize();
  up.crossVectors(towardEye, right).normalize();
  let halfWidth = 0,
    halfHeight = 0,
    distance = 0;
  const tanY =
    camera instanceof PerspectiveCamera
      ? Math.tan((camera.fov * Math.PI) / 360)
      : 1;
  for (let x = 0; x < 2; x++)
    for (let y = 0; y < 2; y++)
      for (let z = 0; z < 2; z++) {
        corner.set(
          x ? bounds.max.x : bounds.min.x,
          y ? bounds.max.y : bounds.min.y,
          z ? bounds.max.z : bounds.min.z,
        );
        relative.copy(corner).sub(STAND_CENTER);
        const horizontal = Math.abs(relative.dot(right)),
          vertical = Math.abs(relative.dot(up));
        halfWidth = Math.max(halfWidth, horizontal);
        halfHeight = Math.max(halfHeight, vertical);
        distance = Math.max(
          distance,
          relative.dot(towardEye) +
            Math.max(horizontal / (tanY * aspect), vertical / tanY) * 1.1,
        );
      }
  if (camera instanceof PerspectiveCamera) camera.aspect = aspect;
  else {
    const halfY = Math.max(halfHeight, halfWidth / aspect) * 1.09;
    camera.left = -halfY * aspect;
    camera.right = halfY * aspect;
    camera.top = halfY;
    camera.bottom = -halfY;
    distance = 35;
  }
  camera.position.copy(STAND_CENTER).addScaledVector(towardEye, distance);
  camera.lookAt(STAND_CENTER);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

import { useEffect, useRef, useState } from "react";
import { StandScene } from "../scene/StandScene";
import type { SceneOverlay } from "../scene/StandScene";
import type { CameraView } from "../domain/types";
import { editor } from "../state/editorStore";
import { useEditor } from "../state/useEditor";
import { Icon } from "./Icon";
const views: CameraView[] = [
  "Perspective 3D",
  "Front",
  "Back",
  "Left",
  "Right",
  "Top",
  "Audience View",
];
export function Viewport() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<StandScene | null>(null);
  const [overlay, setOverlay] = useState<SceneOverlay>({
    labels: [],
    handles: [],
    hover: null,
    marquee: null,
    view: "Perspective 3D",
  });
  const [error, setError] = useState<string | null>(null);
  const s = useEditor();
  useEffect(() => {
    if (!host.current) return;
    try {
      const instance = new StandScene(host.current, {
        onOverlay: setOverlay,
        onError: setError,
      });
      scene.current = instance;
      return () => {
        instance.dispose();
        scene.current = null;
      };
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }, []);
  const status =
    s.selection.size === 0
      ? "No students selected"
      : s.selection.size === 1
        ? "Selected: " + s.activeId
        : "Selected: " + s.selection.size + " students";
  return (
    <main className="viewport">
      <div
        className="scene-host"
        ref={host}
        aria-label="Interactive 3D stand"
      />
      <div className="viewport-top">
        <div className="camera-label">
          <Icon name="orbit" size={14} />
          VIEW
        </div>
        <div className="camera-chips">
          {views.map((view) => (
            <button
              key={view}
              className={overlay.view === view ? "active" : ""}
              onClick={() => scene.current?.setView(view)}
            >
              {view}
            </button>
          ))}
        </div>
      </div>
      <div className="formation-caption">
        <span className="live-dot" />6 ROWS <span>×</span>12 STUDENTS
        <div>THE STAND</div>
      </div>
      <div className="projected-overlays">
        {overlay.labels
          .filter((l) => l.visible)
          .map((l) => (
            <button
              key={l.kind + l.value}
              className={"formation-label " + l.kind}
              style={{ left: l.x, top: l.y }}
              aria-label={"Select " + l.kind + " " + l.value}
              title={
                "Select " + l.kind + " " + l.value + " · Shift to add/remove"
              }
              onClick={(e) => editor.selectGroup(l.kind, l.value, e.shiftKey)}
            >
              {l.kind === "row" ? "R" + l.value : l.value}
            </button>
          ))}
        {overlay.handles
          .filter((h) => h.visible)
          .map((h) => (
            <button
              key={h.side + h.control}
              className={"handle-label " + h.control}
              style={{ left: h.x, top: h.y }}
              aria-label={"Activate " + h.side + " " + h.control + " control"}
              title={
                "Activate " + h.side + " " + h.control + ", then drag the joint"
              }
              onClick={() => editor.setActive(h.side, h.control)}
            >
              {h.side === "left" ? "L" : "R"}
              {h.control === "elbow" ? " · elbow" : ""}
            </button>
          ))}
      </div>
      {overlay.marquee && (
        <div
          className="marquee"
          style={{
            left: overlay.marquee.x,
            top: overlay.marquee.y,
            width: overlay.marquee.width,
            height: overlay.marquee.height,
          }}
        />
      )}
      <div className="selection-strip">
        <span>ROWS</span>
        {Array.from({ length: 6 }, (_, i) => (
          <button
            key={i}
            aria-label={"Select row " + (i + 1) + " fallback"}
            onClick={(e) => editor.selectGroup("row", i + 1, e.shiftKey)}
          >
            {i + 1}
          </button>
        ))}
        <i />
        <span>COLS</span>
        {Array.from({ length: 12 }, (_, i) => (
          <button
            key={i}
            aria-label={"Select column " + (i + 1) + " fallback"}
            onClick={(e) => editor.selectGroup("column", i + 1, e.shiftKey)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="viewport-bottom">
        <div className="viewport-selection">
          <Icon name="cursor" size={13} />
          {status}
          {overlay.hover && <span className="hover-id">{overlay.hover}</span>}
        </div>
        <div className="mouse-legend">
          <span>Drag hand to pose</span>
          <i />
          Right drag orbit
          <i />
          Middle drag pan
          <i />
          Scroll zoom
        </div>
      </div>
      <div className={"stage-hint" + (s.selection.size ? " selected" : "")}>
        <Icon name="info" size={14} />
        {!s.selection.size
          ? "Select a student or row, then drag a hand to create a pose."
          : s.selection.size > 1
            ? "Drag a hand to move the selected arms together."
            : "Drag hands to pose. Click an elbow label to adjust its bend."}
      </div>
      {error && (
        <div className="webgl-error">
          <h2>3D viewport unavailable</h2>
          <p>{error}</p>
          <p>This editor requires a browser with WebGL enabled.</p>
        </div>
      )}
    </main>
  );
}

import { useEffect, useRef, useState } from "react";
import { editor } from "../state/editorStore";
import { useEditor } from "../state/useEditor";
import { STUDENT_IDS } from "../domain/formation";
import { Icon } from "./Icon";
import { PoseMenu } from "./PoseMenu";
import { PatternPopover } from "./PatternPopover";
import { ProjectName } from "./ProjectName";
export type ProjectAction = "save" | "load" | "export" | "import";
export function Toolbar({
  onProject,
  onInspector,
}: {
  onProject: (action: ProjectAction) => void;
  onInspector: () => void;
}) {
  const s = useEditor();
  const [menu, setMenu] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setMenu(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, []);
  return (
    <header className="toolbar" ref={root}>
      <div className="brand">
        <div className="brand-mark">
          <Icon name="cheer" size={24} />
        </div>
        <div>
          <strong>STAND CHEER</strong>
          <span>Choreography studio</span>
        </div>
      </div>
      <div className="toolbar-divider" />
      <div className="project-title">
        <ProjectName name={s.project.name} />
        <span
          className={"save-dot" + (s.dirty ? " unsaved" : "")}
          title={s.dirty ? "Unsaved changes" : "No unsaved changes"}
        />
      </div>
      <div className="toolbar-tools">
        <div className="segmented mode-tools">
          <button
            className={s.mode === "select" ? "active" : ""}
            onClick={() => editor.setMode("select")}
            title="Select and drag hands"
          >
            <Icon name="cursor" />
            Select
          </button>
          <button
            className={s.mode === "orbit" ? "active" : ""}
            onClick={() => editor.setMode("orbit")}
            title="Left drag to orbit"
          >
            <Icon name="orbit" />
            Orbit
          </button>
        </div>
        <div className="toolbar-divider" />
        <button
          onClick={() => editor.select(STUDENT_IDS)}
          title="Select all 72 students"
        >
          All
        </button>
        <button onClick={() => editor.select([])} title="Deselect all students">
          None
        </button>
        <div className="menu-anchor">
          <button
            disabled={!s.selection.size}
            className={menu === "pose" ? "menu-open" : ""}
            aria-expanded={menu === "pose"}
            onClick={() => setMenu(menu === "pose" ? null : "pose")}
          >
            <Icon name="cheer" />
            Pose
            <Icon name="chevron" size={12} />
          </button>
          {menu === "pose" && <PoseMenu onClose={() => setMenu(null)} />}
        </div>
        <div className="menu-anchor">
          <button
            disabled={!s.selection.size}
            className={menu === "pattern" ? "menu-open" : ""}
            aria-expanded={menu === "pattern"}
            onClick={() => setMenu(menu === "pattern" ? null : "pattern")}
          >
            <Icon name="grid" />
            Pattern
            <Icon name="chevron" size={12} />
          </button>
          {menu === "pattern" && (
            <PatternPopover onClose={() => setMenu(null)} />
          )}
        </div>
        <div className="toolbar-divider" />
        <button
          className="icon-button"
          disabled={!s.canUndo}
          onClick={() => editor.undo()}
          title="Undo · Ctrl Z"
          aria-label="Undo"
        >
          <Icon name="undo" />
        </button>
        <button
          className="icon-button"
          disabled={!s.canRedo}
          onClick={() => editor.redo()}
          title="Redo · Ctrl Shift Z"
          aria-label="Redo"
        >
          <Icon name="redo" />
        </button>
      </div>
      <div className="toolbar-end">
        <button
          className="drawer-toggle icon-button"
          onClick={onInspector}
          aria-label="Toggle inspector"
        >
          <Icon name="sliders" />
        </button>
        <div className="menu-anchor">
          <button
            className="project-button"
            aria-expanded={menu === "project"}
            onClick={() => setMenu(menu === "project" ? null : "project")}
          >
            <Icon name="folder" />
            Project
            <Icon name="chevron" size={12} />
          </button>
          {menu === "project" && (
            <div className="popover project-menu">
              {(
                [
                  ["save", "Save Project", "save", "Ctrl S"],
                  ["load", "Load Project", "folder", ""],
                  ["export", "Export Project JSON", "download", ""],
                  ["import", "Import Project JSON", "upload", ""],
                ] as const
              ).map(([action, label, icon, shortcut]) => (
                <button
                  key={action}
                  onClick={() => {
                    setMenu(null);
                    onProject(action);
                  }}
                >
                  <Icon name={icon} />
                  {label}
                  <kbd>{shortcut}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

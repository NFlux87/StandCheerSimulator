import { useEffect, useRef, useState } from "react";
import { Toolbar } from "./components/Toolbar";
import type { ProjectAction } from "./components/Toolbar";
import { Viewport } from "./components/Viewport";
import { Inspector } from "./components/Inspector";
import { Timeline } from "./components/Timeline";
import { ProjectDialog } from "./components/ProjectDialog";
import { Icon } from "./components/Icon";
import { editor } from "./state/editorStore";
import { useEditor } from "./state/useEditor";
import {
  savedProjects,
  saveProject,
  setSavedId,
  exportProject,
} from "./persistence/storage";
import type { SavedProject } from "./persistence/storage";
import { validateProject } from "./domain/project";
export default function App() {
  const s = useEditor();
  const [drawer, setDrawer] = useState(false);
  const [load, setLoad] = useState<{
    projects: SavedProject[];
    error: string | null;
  } | null>(null);
  const [replace, setReplace] = useState<(() => void) | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const save = () => {
    try {
      saveProject(editor.serializedProject());
      editor.markSaved();
      editor.inform("Project saved in this browser.");
      return true;
    } catch (error) {
      editor.report(error instanceof Error ? error.message : String(error));
      return false;
    }
  };
  const guardReplace = (action: () => void) => {
    if (editor.getSnapshot().dirty) setReplace(() => action);
    else action();
  };
  const projectAction = (action: ProjectAction) => {
    if (action === "save") save();
    if (action === "export") {
      try {
        exportProject(editor.serializedProject());
        editor.inform("Project JSON exported.");
      } catch (error) {
        editor.report(String(error));
      }
    }
    if (action === "load") {
      try {
        setLoad({ projects: savedProjects(), error: null });
      } catch (error) {
        setLoad({
          projects: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (action === "import") input.current?.click();
  };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement;
      const native =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
      if (event.key.toLowerCase() === "z" && !native) {
        event.preventDefault();
        event.shiftKey ? editor.redo() : editor.undo();
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (editor.getSnapshot().dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    document.addEventListener("keydown", keyboard);
    window.addEventListener("beforeunload", unload);
    return () => {
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  return (
    <div className="app-shell">
      <Toolbar
        onProject={projectAction}
        onInspector={() => setDrawer(!drawer)}
      />
      <div className="workspace">
        <Viewport />
        <Inspector open={drawer} onClose={() => setDrawer(false)} />
      </div>
      <Timeline />
      <input
        type="file"
        ref={input}
        accept=".json,application/json"
        className="hidden"
        aria-label="Import Project JSON file"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try {
            const project = validateProject(JSON.parse(await file.text()));
            guardReplace(() => {
              editor.load(project);
              setSavedId(null);
              editor.inform("Imported " + project.name);
            });
          } catch (error) {
            editor.report(
              "Import failed: " +
                (error instanceof Error ? error.message : String(error)),
            );
          }
        }}
      />
      {load && (
        <ProjectDialog
          projects={load.projects}
          error={load.error}
          onClose={() => setLoad(null)}
          onLoad={(entry) =>
            guardReplace(() => {
              editor.load(entry.project);
              setSavedId(entry.id);
              setLoad(null);
              editor.inform("Loaded " + entry.project.name);
            })
          }
        />
      )}
      {s.pending === "draft" && (
        <div className="modal-backdrop">
          <section
            className="dialog compact-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="draft-title"
          >
            <div className="dialog-emblem">
              <Icon name="key" size={24} />
            </div>
            <h2 id="draft-title">Keep this pose?</h2>
            <p>
              Your current pose changes are not keyframed. Add a keyframe before
              leaving this time, or discard the changes.
            </p>
            <div className="dialog-actions vertical">
              <button
                className="primary"
                onClick={() => editor.resolveDraft("capture")}
              >
                Add Keyframe and Continue
              </button>
              <button onClick={() => editor.resolveDraft("discard")}>
                Discard Pose Changes
              </button>
              <button
                className="text-button"
                onClick={() => editor.resolveDraft("cancel")}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}
      {replace && (
        <div className="modal-backdrop">
          <section
            className="dialog compact-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
          >
            <h2 id="unsaved-title">Unsaved changes</h2>
            <p>Save the current project before replacing it?</p>
            <div className="dialog-actions vertical">
              <button
                className="primary"
                onClick={() => {
                  if (save()) {
                    replace();
                    setReplace(null);
                  }
                }}
              >
                Save and Continue
              </button>
              <button
                onClick={() => {
                  replace();
                  setReplace(null);
                }}
              >
                Discard and Continue
              </button>
              <button onClick={() => setReplace(null)}>Cancel</button>
            </div>
          </section>
        </div>
      )}
      {(s.error || s.message) && (
        <div
          className={"toast " + (s.error ? "error" : "")}
          role={s.error ? "alert" : "status"}
        >
          <Icon name={s.error ? "info" : "save"} size={17} />
          <span>{s.error || s.message}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => {
              editor.report(null);
              editor.inform(null);
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

import { Icon } from "./Icon";
import type { SavedProject } from "../persistence/storage";
export function ProjectDialog({
  projects,
  error,
  onLoad,
  onClose,
}: {
  projects: SavedProject[];
  error: string | null;
  onLoad: (entry: SavedProject) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="load-title"
      >
        <div className="dialog-header">
          <h2 id="load-title">Load a project</h2>
          <button
            className="icon-button"
            aria-label="Close load dialog"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <p className="description">Your routines saved in this browser.</p>
        {error ? (
          <div className="inline-error">{error}</div>
        ) : projects.length ? (
          <div className="saved-projects">
            {[...projects]
              .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
              .map((entry) => (
                <button key={entry.id} onClick={() => onLoad(entry)}>
                  <span className="saved-project-icon">
                    <Icon name="folder" size={22} />
                  </span>
                  <span>
                    <strong>{entry.project.name || "Untitled Cheer"}</strong>
                    <small>
                      {new Date(entry.savedAt).toLocaleString()} ·{" "}
                      {entry.project.keyframes.length} keyframes ·{" "}
                      {entry.project.duration}s
                    </small>
                  </span>
                  <Icon name="forward" />
                </button>
              ))}
          </div>
        ) : (
          <div className="empty-projects">
            <Icon name="folder" size={36} />
            <h3>No saved projects yet</h3>
            <p>Create a routine, then choose Save Project.</p>
          </div>
        )}
        <div className="dialog-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}

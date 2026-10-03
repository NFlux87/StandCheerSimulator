import type { Project } from "../domain/types";
import { validateProject } from "../domain/project";
export type SavedProject = { id: string; savedAt: string; project: Project };
const KEY = "stand-cheer.projects.v1";
let activeSavedId: string | null = null;
export function savedProjects(): SavedProject[] {
  let text: string | null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    throw new Error(
      "Browser storage is unavailable. Enable local storage, or use Export Project JSON.",
    );
  }
  if (!text) return [];
  try {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("Expected a project list");
    return data.map((entry: unknown) => {
      if (!entry || typeof entry !== "object")
        throw new Error("Invalid saved entry");
      const e = entry as Record<string, unknown>;
      if (typeof e.id !== "string" || typeof e.savedAt !== "string")
        throw new Error("Invalid project ID or date");
      return {
        id: e.id,
        savedAt: e.savedAt,
        project: validateProject(e.project),
      };
    });
  } catch (error) {
    throw new Error(
      "Saved projects could not be read. Stored data was left intact. " +
        (error instanceof Error ? error.message : ""),
    );
  }
}
export function saveProject(project: Project): SavedProject {
  const list = savedProjects();
  const record = {
    id: activeSavedId ?? crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    project,
  };
  const index = list.findIndex((p) => p.id === record.id);
  if (index < 0) list.push(record);
  else list[index] = record;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    throw new Error(
      "Project could not be saved: storage is blocked or full. Export Project JSON to keep your work.",
    );
  }
  activeSavedId = record.id;
  return record;
}
export function setSavedId(id: string | null) {
  activeSavedId = id;
}
export function exportProject(project: Project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    const filename = project.name
      .trim()
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .replace(/\s+/g, "-");
    anchor.download = (filename || "stand-cheer-project") + ".json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } catch {
    throw new Error(
      "Download failed. Check your browser download permissions.",
    );
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

import { useSyncExternalStore } from "react";
import { editor } from "./editorStore";
export function useEditor() {
  return useSyncExternalStore(
    editor.subscribe,
    editor.getSnapshot,
    editor.getSnapshot,
  );
}

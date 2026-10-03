import { useEffect, useRef, useState } from "react";
import { editor } from "../state/editorStore";
export function ProjectName({ name }: { name: string }) {
  const [draft, setDraft] = useState(name);
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(name);
  }, [name]);
  return (
    <input
      aria-label="Project name"
      value={draft}
      spellCheck={false}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        focused.current = false;
        if (cancelled.current) cancelled.current = false;
        else editor.setName(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          setDraft(name);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

import { useRef } from "react";
import { editor } from "../state/editorStore";
export function GloveColor({
  side,
  color,
}: {
  side: "palm" | "back";
  color: string;
}) {
  const editing = useRef(false);
  const begin = () => {
    if (!editing.current) {
      editor.beginColorEdit(side);
      editing.current = true;
    }
  };
  const commit = () => {
    if (editing.current) {
      editor.commitColorEdit();
      editing.current = false;
    }
  };
  return (
    <input
      aria-label={side === "palm" ? "Palm Color" : "Back Color"}
      type="color"
      value={color}
      onFocus={begin}
      onPointerDown={begin}
      onChange={(event) => {
        begin();
        editor.previewColor(side, event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          editor.cancelColorEdit();
          editing.current = false;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

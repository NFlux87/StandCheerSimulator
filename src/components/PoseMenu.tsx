import { PRESET_NAMES } from "../domain/poses";
import { editor } from "../state/editorStore";
export function PoseMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="popover pose-menu">
      <div className="menu-heading">
        POSE LIBRARY <span>10 poses</span>
      </div>
      <div className="preset-grid">
        {PRESET_NAMES.map((name, i) => (
          <button
            key={name}
            onClick={() => {
              editor.posePreset(name);
              onClose();
            }}
          >
            <span className="pose-symbol" aria-hidden="true">
              {["♧", "Y", "↓", "T", "↖", "↗", "V", "Λ", "⇢", "×"][i]}
            </span>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <div className="menu-foot">
        Apply to selection. Every pose stays editable.
      </div>
    </div>
  );
}

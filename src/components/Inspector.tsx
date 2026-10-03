import { useEditor } from "../state/useEditor";
import { editor } from "../state/editorStore";
import type { ArmSide, Vec3 } from "../domain/types";
import { studentIndex } from "../domain/formation";
import { NumberField } from "./NumberField";
import { Icon } from "./Icon";
import { GloveColor } from "./GloveColor";
export function Inspector({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const s = useEditor();
  const active = s.activeId ? s.displayPoses[studentIndex(s.activeId)] : null;
  const selected = s.displayPoses.filter((p) => s.selection.has(p.id));
  const status =
    s.selection.size === 0
      ? "No students selected"
      : s.selection.size === 1
        ? "Selected: " + s.activeId
        : "Selected: " + s.selection.size + " students";
  return (
    <aside className={"inspector" + (open ? " drawer-open" : "")}>
      <div className="panel-heading">
        <Icon name="sliders" />
        <strong>Pose inspector</strong>
        <button
          className="icon-button drawer-toggle"
          aria-label="Close inspector"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
        <span className="live-tag">LIVE</span>
      </div>
      <div className="inspector-scroll">
        <section className="selection-summary">
          <span className="eyebrow">SELECTION</span>
          <h2>
            {s.selection.size
              ? s.selection.size === 1
                ? s.activeId
                : s.selection.size + " students"
              : "Make a selection"}
          </h2>
          <p>
            {active
              ? s.selection.size > 1
                ? "Editing unifies the addressed arm. Other arms stay independent."
                : "Drag a hand in the viewport or refine its position below."
              : "Click a student, a row, or a column to start choreographing."}
          </p>
          {active && (
            <div className="active-student">
              <span className="cyan-dot" />
              Active: {s.activeId}
              <span>BODY SPACE</span>
            </div>
          )}
        </section>
        {active ? (
          <>
            {(["left", "right"] as ArmSide[]).map((side) => {
              const arm = active[side];
              const mixed = (key: "hand" | "elbowPole", axis: number) =>
                selected.some(
                  (p) => Math.abs(p[side][key][axis] - arm[key][axis]) > 1e-6,
                );
              const update = (
                key: "hand" | "elbowPole",
                axis: number,
                n: number,
              ) => {
                const v = [...arm[key]] as Vec3;
                v[axis] = n;
                editor.editArm(side, { [key]: v }, "Set " + side + " " + key);
              };
              return (
                <section
                  className={
                    "arm-section" + (s.activeSide === side ? " active-arm" : "")
                  }
                  key={side}
                >
                  <button
                    className="arm-heading"
                    onClick={() => editor.setActive(side, "hand")}
                  >
                    <span className={"arm-badge " + side}>
                      {side === "left" ? "L" : "R"}
                    </span>
                    <strong>{side === "left" ? "Left" : "Right"} arm</strong>
                    <span className="control-state">
                      {s.activeSide === side ? "● Active" : "Select"}
                    </span>
                  </button>
                  <div className="field-heading">
                    Hand position <span>X · Y · Z</span>
                  </div>
                  <div className="coordinate-fields">
                    {(["X", "Y", "Z"] as const).map((a, i) => (
                      <NumberField
                        key={a}
                        label={side + " hand " + a}
                        value={arm.hand[i]}
                        mixed={mixed("hand", i)}
                        onCommit={(n) => update("hand", i, n)}
                      />
                    ))}
                  </div>
                  <details>
                    <summary>Elbow bend direction</summary>
                    <div className="coordinate-fields">
                      {(["X", "Y", "Z"] as const).map((a, i) => (
                        <NumberField
                          key={a}
                          label={side + " elbow " + a}
                          value={arm.elbowPole[i]}
                          mixed={mixed("elbowPole", i)}
                          onCommit={(n) => update("elbowPole", i, n)}
                        />
                      ))}
                    </div>
                  </details>
                  <div className="wrist-heading">
                    <span>Wrist rotation</span>
                    <NumberField
                      label={side + " wrist degrees"}
                      value={(arm.wrist * 180) / Math.PI}
                      step={15}
                      mixed={selected.some(
                        (p) =>
                          Math.abs(Math.sin((p[side].wrist - arm.wrist) / 2)) >
                          1e-6,
                      )}
                      onCommit={(n) =>
                        editor.editArm(
                          side,
                          { wrist: (n * Math.PI) / 180 },
                          "Rotate " + side + " wrist",
                        )
                      }
                    />
                  </div>
                  <div className="wrist-actions">
                    <button
                      title="Palm Facing Forward"
                      onClick={() =>
                        editor.editArm(side, { wrist: 0 }, "Palm forward")
                      }
                    >
                      <span
                        className="color-dot"
                        style={{ background: s.project.gloveColors.palm }}
                      />
                      Palm
                    </button>
                    <button
                      title="Back Facing Forward"
                      onClick={() =>
                        editor.editArm(side, { wrist: Math.PI }, "Back forward")
                      }
                    >
                      <span
                        className="color-dot"
                        style={{ background: s.project.gloveColors.back }}
                      />
                      Back
                    </button>
                    <button
                      title="Flip Hand"
                      onClick={() =>
                        editor.editArm(
                          side,
                          { wrist: arm.wrist + Math.PI },
                          "Flip hand",
                        )
                      }
                    >
                      Flip ↻
                    </button>
                    <button
                      className="rotate-small"
                      aria-label={side + " wrist counterclockwise"}
                      title="Counterclockwise 15°"
                      onClick={() =>
                        editor.editArm(
                          side,
                          { wrist: arm.wrist - Math.PI / 12 },
                          "Rotate wrist",
                        )
                      }
                    >
                      −15°
                    </button>
                    <button
                      className="rotate-small"
                      aria-label={side + " wrist clockwise"}
                      title="Clockwise 15°"
                      onClick={() =>
                        editor.editArm(
                          side,
                          { wrist: arm.wrist + Math.PI / 12 },
                          "Rotate wrist",
                        )
                      }
                    >
                      +15°
                    </button>
                  </div>
                </section>
              );
            })}
            <section className="pose-actions">
              <div className="eyebrow">POSE ACTIONS</div>
              <div className="action-grid">
                <button
                  disabled={s.selection.size !== 1}
                  onClick={() => editor.copyPose()}
                >
                  <Icon name="copy" />
                  Copy
                </button>
                <button
                  disabled={!editor.clipboard}
                  onClick={() => editor.pastePose()}
                >
                  <Icon name="copy" />
                  Paste
                </button>
                <button onClick={() => editor.mirrorSelected()}>
                  <Icon name="mirror" />
                  Mirror
                </button>
                <button onClick={() => editor.resetPose()}>
                  <Icon name="reset" />
                  Reset
                </button>
              </div>
              {editor.clipboard && (
                <p className="clipboard-note">
                  Copied from {editor.clipboard.id}
                </p>
              )}
            </section>
          </>
        ) : (
          <div className="empty-inspector">
            <div className="empty-selection-icon">
              <Icon name="cursor" size={30} />
            </div>
            <strong>A whole stand. Endless routines.</strong>
            <p>
              Select one student to fine-tune.
              <br />
              Select a row to move together.
            </p>
            <div className="shortcut-note">
              <kbd>Shift</kbd> Add to selection
            </div>
          </div>
        )}
        <section className="glove-colors">
          <div className="eyebrow">
            GLOVE COLORS <span>GLOBAL</span>
          </div>
          <div className="color-picker-row">
            {(["palm", "back"] as const).map((side) => (
              <label key={side}>
                <GloveColor side={side} color={s.project.gloveColors[side]} />
                <span>
                  {side === "palm" ? "Palm" : "Back"}
                  <small>{s.project.gloveColors[side].toUpperCase()}</small>
                </span>
              </label>
            ))}
          </div>
          <p>Two sides. One glove. Rotate the wrist to reveal each face.</p>
        </section>
      </div>
      <div className="inspector-footer">
        <span className="cyan-dot" />
        {status}
      </div>
    </aside>
  );
}

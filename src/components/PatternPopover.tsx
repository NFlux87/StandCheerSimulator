import { useState } from "react";
import { editor } from "../state/editorStore";
import { useEditor } from "../state/useEditor";
import { PRESET_NAMES } from "../domain/poses";
import { canMirrorFormation } from "../domain/patterns";
import type { PatternOptions } from "../domain/patterns";
export function PatternPopover({ onClose }: { onClose: () => void }) {
  const s = useEditor();
  const [type, setType] = useState<PatternOptions["type"]>("wave");
  const [arm, setArm] = useState<"left" | "right" | "both">("right");
  const [reverse, setReverse] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(180);
  const [a, setA] = useState("Both Arms Up");
  const [b, setB] = useState("Both Arms Down");
  const ok = type !== "mirror" || canMirrorFormation(s.selection);
  return (
    <div className="popover pattern-menu">
      <div className="menu-heading">FORMATION PATTERNS</div>
      <div className="segmented pattern-types">
        {(["wave", "gradient", "alternate", "mirror"] as const).map((v) => (
          <button
            className={type === v ? "active" : ""}
            onClick={() => setType(v)}
            key={v}
          >
            {v}
          </button>
        ))}
      </div>
      {(type === "wave" || type === "gradient") && (
        <label className="setting-label">
          Arm
          <select
            value={arm}
            onChange={(e) => setArm(e.target.value as typeof arm)}
          >
            <option value="left">Left arm</option>
            <option value="right">Right arm</option>
            <option value="both">Both arms</option>
          </select>
        </label>
      )}
      {type === "wave" && (
        <label className="setting-label">
          Direction
          <select
            value={String(reverse)}
            onChange={(e) => setReverse(e.target.value === "true")}
          >
            <option value="false">Left → Right</option>
            <option value="true">Right → Left</option>
          </select>
        </label>
      )}
      {type === "gradient" && (
        <div className="two-fields">
          <label>
            Start angle
            <input
              aria-label="Start Angle"
              type="number"
              min="0"
              max="180"
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
            />
          </label>
          <label>
            End angle
            <input
              aria-label="End Angle"
              type="number"
              min="0"
              max="180"
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
            />
          </label>
        </div>
      )}
      {type === "alternate" && (
        <>
          {[
            ["Preset A", a, setA],
            ["Preset B", b, setB],
          ].map(([label, value, set]) => (
            <label className="setting-label" key={String(label)}>
              {String(label)}
              <select
                value={String(value)}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
              >
                {PRESET_NAMES.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          ))}
        </>
      )}
      {type === "mirror" && (
        <p className="description">
          Mirror selected left-half students into their selected opposite
          partners.{" "}
          {ok
            ? "Matched pairs are ready."
            : "Select at least one complete left/right column pair."}
        </p>
      )}
      <p className="description">
        {s.selection.size} students · current pose only
      </p>
      <button
        className="primary wide"
        disabled={
          !ok ||
          !s.selection.size ||
          !Number.isFinite(start) ||
          !Number.isFinite(end)
        }
        onClick={() => {
          editor.applyPattern({
            type,
            arm,
            reverse,
            start: Math.max(0, Math.min(180, start)),
            end: Math.max(0, Math.min(180, end)),
            presetA: a,
            presetB: b,
          });
          onClose();
        }}
      >
        Apply pattern
      </button>
    </div>
  );
}

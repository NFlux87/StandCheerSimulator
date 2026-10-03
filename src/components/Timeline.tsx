import { useRef, useState } from "react";
import { editor } from "../state/editorStore";
import { useEditor } from "../state/useEditor";
import { Icon } from "./Icon";
import { NumberField } from "./NumberField";
export function Timeline() {
  const s = useEditor();
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; time: number } | null>(null);
  const selected = s.project.keyframes.find((k) => k.id === s.selectedKeyframe);
  const atKey = s.project.keyframes.some(
    (k) => Math.abs(k.time - s.project.playhead) < 1e-6,
  );
  const timeAt = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        s.project.duration,
        ((x - r.left) / r.width) * s.project.duration,
      ),
    );
  };
  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    editor.navigate(timeAt(e.clientX));
  };
  const ticks = Array.from(
    { length: Math.min(17, Math.ceil(s.project.duration) + 1) },
    (_, i) =>
      (i * s.project.duration) / Math.min(16, Math.ceil(s.project.duration)),
  );
  return (
    <section className="timeline">
      <div className="timeline-toolbar">
        <div className="timeline-label">
          <Icon name="key" />
          <strong>Timeline</strong>
          <span>{s.project.keyframes.length} keyframes</span>
        </div>
        <div className="transport">
          <button
            className="icon-button"
            aria-label="Previous keyframe"
            title="Previous keyframe"
            disabled={!s.project.keyframes.length}
            onClick={() => editor.jumpKeyframe(-1)}
          >
            <Icon name="prev" />
          </button>
          <button
            className="icon-button"
            aria-label="Previous frame"
            title="Previous frame · 1/30 s"
            onClick={() => editor.navigate(s.project.playhead - 1 / 30)}
          >
            <Icon name="back" size={13} />
          </button>
          <button
            className="play-button"
            aria-label={s.playing ? "Pause" : "Play"}
            onClick={() => (s.playing ? editor.pause() : editor.play())}
          >
            <Icon name={s.playing ? "pause" : "play"} size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Next frame"
            title="Next frame · 1/30 s"
            onClick={() => editor.navigate(s.project.playhead + 1 / 30)}
          >
            <Icon name="forward" size={13} />
          </button>
          <button
            className="icon-button"
            aria-label="Next keyframe"
            title="Next keyframe"
            disabled={!s.project.keyframes.length}
            onClick={() => editor.jumpKeyframe(1)}
          >
            <Icon name="next" />
          </button>
          <button
            className="icon-button"
            aria-label="Stop"
            title="Stop · return to zero"
            onClick={() => editor.stop()}
          >
            <Icon name="stop" size={13} />
          </button>
        </div>
        <div className="time-display">
          <NumberField
            label="Current time"
            value={s.project.playhead}
            step={1 / 30}
            min={0}
            max={s.project.duration}
            onCommit={(n) => editor.navigate(n)}
          />
          <span>/ {s.project.duration.toFixed(2)} s</span>
        </div>
        <div className="timeline-options">
          <label className="speed-label">
            <select
              aria-label="Playback speed"
              value={s.speed}
              onChange={(e) => editor.setSpeed(Number(e.target.value))}
            >
              {[0.25, 0.5, 1, 1.5, 2].map((v) => (
                <option value={v} key={v}>
                  {v}×
                </option>
              ))}
            </select>
          </label>
          <button
            className={
              "smooth-button" +
              (s.project.interpolation === "smooth" ? " active" : "")
            }
            onClick={() =>
              editor.setInterpolation(
                s.project.interpolation === "smooth" ? "step" : "smooth",
              )
            }
            title="Toggle smooth interpolation"
          >
            {s.project.interpolation === "smooth" ? "⌁ Smooth" : "▥ Step"}
          </button>
          <button className="add-key" onClick={() => editor.addKeyframe()}>
            <Icon name="plus" size={14} />
            {atKey ? "Update Keyframe" : "Add Keyframe"}
          </button>
        </div>
      </div>
      <div className="timeline-body">
        <div className="track-label">
          <span className="track-dot" />
          Full stand<small>72 students · both arms</small>
        </div>
        <div
          className="track-area"
          ref={track}
          onPointerDown={scrub}
          onPointerMove={(e) => {
            if (
              e.currentTarget.hasPointerCapture(e.pointerId) &&
              e.buttons === 1
            )
              editor.navigate(timeAt(e.clientX));
          }}
        >
          <div className="time-ruler">
            {ticks.map((t, i) => (
              <div
                className="ruler-tick"
                key={i}
                style={{ left: (t / s.project.duration) * 100 + "%" }}
              >
                <span>{Number(t.toFixed(2))}s</span>
              </div>
            ))}
          </div>
          <div className="keyframe-lane">
            <div className="lane-line" />
            {s.project.keyframes.map((k) => (
              <button
                key={k.id}
                title={"Keyframe at " + k.time.toFixed(2) + " s"}
                aria-label={"Keyframe " + k.time.toFixed(2) + " seconds"}
                className={
                  "keyframe-marker" +
                  (s.selectedKeyframe === k.id ? " selected" : "")
                }
                style={{
                  left:
                    ((drag?.id === k.id ? drag.time : k.time) /
                      s.project.duration) *
                      100 +
                    "%",
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  editor.selectKeyframe(k.id);
                  editor.navigate(k.time);
                  setDrag({ id: k.id, time: k.time });
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    setDrag({ id: k.id, time: timeAt(e.clientX) });
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  const finalTime = timeAt(e.clientX);
                  if (drag && Math.abs(finalTime - k.time) > 1e-6)
                    editor.moveKeyframe(k.id, finalTime);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}
              >
                <span />
              </button>
            ))}
            {!s.project.keyframes.length && (
              <span className="empty-track">
                Your routine starts here. Create a pose, then add a keyframe.
              </span>
            )}
          </div>
          <div
            className="playhead"
            style={{
              left: (s.project.playhead / s.project.duration) * 100 + "%",
            }}
          >
            <span />
            <i />
          </div>
        </div>
      </div>
      <div className="timeline-footer">
        <span
          className={
            s.draft && s.project.keyframes.length
              ? "draft-status"
              : "timeline-status"
          }
        >
          {s.draft && s.project.keyframes.length
            ? "● Pose changes not keyframed"
            : s.playing
              ? "● Playing · " + s.speed + "×"
              : "○ " +
                (s.project.keyframes.length
                  ? "Ready to play"
                  : "No animation yet")}
        </span>
        <div className="keyframe-details">
          {selected && (
            <>
              <NumberField
                label="Keyframe time"
                value={selected.time}
                step={1 / 30}
                min={0}
                max={s.project.duration}
                onCommit={(n) => editor.moveKeyframe(selected.id, n)}
              />
              <button
                onClick={() => editor.deleteKeyframe()}
                title="Delete selected keyframe"
              >
                Delete keyframe
              </button>
            </>
          )}
        </div>
        <div className="duration-control">
          <NumberField
            label="Duration"
            value={s.project.duration}
            min={1 / 30}
            step={1}
            onCommit={(n) => editor.setDuration(n)}
          />
          <span>seconds</span>
        </div>
      </div>
    </section>
  );
}

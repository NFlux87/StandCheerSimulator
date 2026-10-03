import { useEffect, useRef, useState } from "react";
export function NumberField({
  value,
  onCommit,
  label,
  step = 0.01,
  min,
  max,
  mixed = false,
}: {
  value: number;
  onCommit: (n: number) => void;
  label: string;
  step?: number;
  min?: number;
  max?: number;
  mixed?: boolean;
}) {
  const format = (n: number) => Number(n.toFixed(3)).toString();
  const [text, setText] = useState(format(value));
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value]);
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const n = Number(text);
    if (text.trim() && Number.isFinite(n))
      onCommit(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n)));
    else setText(format(value));
  };
  return (
    <label
      className={"number-field" + (mixed ? " mixed" : "")}
      title={mixed ? "Mixed values · editing unifies this control" : label}
    >
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={text}
        step={step}
        min={min}
        max={max}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            cancelled.current = true;
            setText(format(value));
            event.currentTarget.blur();
          }
        }}
      />
      {mixed && <i title="Mixed values" />}
    </label>
  );
}

import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  play: "m9 5 10 7-10 7Z",
  pause: "M8 5v14M16 5v14",
  stop: "M6 6h12v12H6Z",
  undo: "M9 6 4 11l5 5M4 11h10a6 6 0 0 1 6 6",
  redo: "m15 6 5 5-5 5M20 11H10a6 6 0 0 0-6 6",
  chevron: "m8 10 4 4 4-4",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  save: "M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7",
  folder: "M3 7V5h7l2 2h9v13H3Z",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  upload: "M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5",
  cursor: "m5 3 14 10-7 1-3 7Z",
  orbit: "M20 10c3 3 0 7-6 8S2 16 3 13M4 14C1 11 4 7 10 6s12 2 11 5M12 3v18",
  copy: "M9 9h11v12H9ZM4 15H2V2h13v3",
  mirror: "M12 3v18M9 6 3 12l6 6Zm6 0 6 6-6 6Z",
  reset: "M3 10a9 9 0 1 1 1 8M3 3v7h7",
  grid: "M3 3h18v18H3ZM3 9h18M3 15h18M9 3v18M15 3v18",
  key: "m12 3 9 9-9 9-9-9Z",
  prev: "M6 5v14m12-14-9 7 9 7Z",
  next: "M18 5v14M6 5l9 7-9 7Z",
  back: "m15 5-7 7 7 7",
  forward: "m9 5 7 7-7 7",
  sliders: "M4 7h16M4 17h16M8 3v8M16 13v8",
  cheer: "M4 20v-7l4-3 4 3 4-3 4 3v7M5 5h2M11 5h2M17 5h2",
  info: "M12 11v7M12 7v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
};
export function Icon({
  name,
  size = 16,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] || paths.grid} />
    </svg>
  );
}

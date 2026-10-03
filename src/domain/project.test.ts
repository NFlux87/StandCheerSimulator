import { describe, expect, it } from "vitest";
import { createProject, validateProject } from "./project";
import { captureKeyframe } from "./timeline";
import type { Project } from "./types";

function keyedProject() {
  const project = createProject();
  return captureKeyframe(
    captureKeyframe(project, 0, project.poses),
    2,
    project.poses,
  );
}

describe("version-one project envelope", () => {
  it("provides neutral independent editable students and requested defaults", () => {
    const project = createProject();
    expect(project.name).toBe("Untitled Cheer");
    expect(project.duration).toBe(8);
    expect(project.playhead).toBe(0);
    expect(project.gloveColors).toEqual({ palm: "#F8CF48", back: "#4268E8" });
    expect(project.interpolation).toBe("smooth");
    expect(project.poses.map((pose) => pose.id)).toContain("R6-C12");
    project.poses[0].right.hand[0] += 1;
    expect(project.poses[1].right.hand[0]).not.toBe(
      project.poses[0].right.hand[0],
    );
  });
  it("normalizes wrists and unreachable hands without changing imported data", () => {
    const project = keyedProject();
    project.poses[0].left.hand = [100, 100, 100];
    project.poses[0].right.wrist = -Math.PI / 2;
    project.keyframes[0].poses[2].right.hand = [1.7e308, 1.7e308, -1.7e308];
    const before = structuredClone(project),
      result = validateProject(project);
    expect(result.poses[0].right.wrist).toBeCloseTo(1.5 * Math.PI, 10);
    const hand = result.poses[0].left.hand;
    expect(Math.hypot(hand[0] - 0.24, hand[1] - 1.35, hand[2])).toBeCloseTo(
      0.799,
      8,
    );
    expect(result.keyframes[0].poses[2].right.hand.every(Number.isFinite)).toBe(
      true,
    );
    expect(result.poses[0].left.hand).not.toBe(project.poses[0].left.hand);
    expect(project).toEqual(before);
  });
  it("sorts valid keyframes without aliasing their full snapshots", () => {
    const project = keyedProject();
    project.keyframes.reverse();
    const parsed = validateProject(JSON.parse(JSON.stringify(project)));
    expect(parsed.keyframes.map((key) => key.time)).toEqual([0, 2]);
    expect(parsed.keyframes[0].poses[0].left.hand).not.toBe(
      parsed.poses[0].left.hand,
    );
  });
  const malformed: [string, (project: Project) => void, RegExp][] = [
    [
      "unsupported version",
      (project) => {
        Object.assign(project, { schemaVersion: 2 });
      },
      /schemaVersion/,
    ],
    [
      "bad color",
      (project) => {
        project.gloveColors.palm = "#fff";
      },
      /gloveColors.palm/,
    ],
    [
      "missing students",
      (project) => {
        project.poses.pop();
      },
      /72 students/,
    ],
    [
      "duplicate IDs",
      (project) => {
        project.poses[1].id = project.poses[0].id;
      },
      /id/,
    ],
    [
      "out-of-order IDs",
      (project) => {
        [project.poses[0], project.poses[1]] = [
          project.poses[1],
          project.poses[0],
        ];
      },
      /row-major/,
    ],
    [
      "nonfinite hand",
      (project) => {
        project.poses[0].left.hand[2] = Infinity;
      },
      /poses\[0\].left.hand.z/,
    ],
    [
      "nonfinite wrist",
      (project) => {
        project.poses[0].right.wrist = NaN;
      },
      /wrist/,
    ],
    [
      "zero duration",
      (project) => {
        project.duration = 0;
      },
      /duration/,
    ],
    [
      "negative playhead",
      (project) => {
        project.playhead = -0.1;
      },
      /playhead/,
    ],
    [
      "playhead beyond end",
      (project) => {
        project.playhead = 9;
      },
      /playhead/,
    ],
    [
      "duplicate key IDs",
      (project) => {
        project.keyframes[1].id = project.keyframes[0].id;
      },
      /unique/,
    ],
    [
      "duplicate key times",
      (project) => {
        project.keyframes[1].time = 0;
      },
      /duplicates/,
    ],
    [
      "key outside duration",
      (project) => {
        project.keyframes[1].time = 9;
      },
      /within the duration/,
    ],
    [
      "nonfinite key time",
      (project) => {
        project.keyframes[1].time = NaN;
      },
      /time.*finite/,
    ],
    [
      "invalid key student",
      (project) => {
        project.keyframes[1].poses[71].id = "R7-C12";
      },
      /keyframes\[1\].poses\[71\].id/,
    ],
    [
      "nonfinite key pole",
      (project) => {
        project.keyframes[0].poses[0].right.elbowPole[1] = Infinity;
      },
      /elbowPole.y/,
    ],
  ];
  malformed.forEach(([name, mutate, message]) =>
    it(`rejects ${name} with field-specific feedback`, () => {
      const project = keyedProject();
      mutate(project);
      expect(() => validateProject(project)).toThrow(message);
    }),
  );
  it("rejects absent envelope fields rather than filling in plausible defaults", () => {
    expect(() => validateProject({ schemaVersion: 1 })).toThrow(/name/);
    expect(() => validateProject(null)).toThrow(/object/);
    const value: Record<string, unknown> = createProject();
    delete value.keyframes;
    expect(() => validateProject(value)).toThrow(/keyframes/);
  });
});

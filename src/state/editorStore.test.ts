import { describe, expect, it, vi } from "vitest";
import { groupIds, STUDENT_IDS, studentIndex } from "../domain/formation";
import { applyPattern, canMirrorFormation } from "../domain/patterns";
import { clonePoses, mirrorPose, presetPose } from "../domain/poses";
import { createProject } from "../domain/project";
import { captureKeyframe, sampleTimeline } from "../domain/timeline";
import type { Project } from "../domain/types";
import { EditorStore } from "./editorStore";

function keyedProject(): Project {
  const project = createProject(),
    raised = STUDENT_IDS.map((id) => presetPose("Both Arms Up", id));
  return captureKeyframe(captureKeyframe(project, 0, project.poses), 4, raised);
}

describe("body-relative selection and pose edits", () => {
  it("unifies one row arm, then permits a genuinely independent individual override", () => {
    const store = new EditorStore(),
      initial = clonePoses(store.getSnapshot().displayPoses);
    store.selectGroup("row", 2);
    store.editArm("right", { hand: [-0.3, 1.9, 0.3] });
    const row = clonePoses(store.getSnapshot().displayPoses);
    for (const id of groupIds("row", 2))
      expect(row[studentIndex(id)].right).toEqual(row[12].right);
    for (let i = 0; i < 72; i++) {
      if (i < 12 || i >= 24) expect(row[i]).toEqual(initial[i]);
      expect(row[i].left).toEqual(initial[i].left);
    }
    store.select(["R2-C6"]);
    store.editArm("right", { hand: [-0.4, 1.65, 0.5] });
    const individual = store.getSnapshot().displayPoses;
    for (let i = 0; i < 72; i++)
      if (i !== 17) expect(individual[i]).toEqual(row[i]);
    expect(individual[17].right).not.toEqual(row[17].right);
  });
  it("wrist-only group edits preserve every individual hand and pole", () => {
    const store = new EditorStore();
    store.select(["R1-C1"]);
    store.posePreset("Left Arm Up");
    store.select(["R1-C2"]);
    store.posePreset("Arms Crossed");
    const before = clonePoses(store.getSnapshot().displayPoses);
    store.selectGroup("row", 1);
    store.editArm("left", { wrist: Math.PI });
    for (let i = 0; i < 72; i++) {
      const pose = store.getSnapshot().displayPoses[i];
      expect(pose.left.hand).toEqual(before[i].left.hand);
      expect(pose.left.elbowPole).toEqual(before[i].left.elbowPole);
      expect(pose.right).toEqual(before[i].right);
      expect(pose.left.wrist).toBe(i < 12 ? Math.PI : before[i].left.wrist);
    }
  });
  it("elbow-pole changes keep the active hand fixed and copy the complete addressed arm only", () => {
    const store = new EditorStore();
    store.selectGroup("column", 3);
    const before = clonePoses(store.getSnapshot().displayPoses),
      hand = before[2].right.hand;
    store.editArm("right", { elbowPole: [-0.8, 1.6, -0.5] });
    for (const id of groupIds("column", 3)) {
      const pose = store.getSnapshot().displayPoses[studentIndex(id)];
      expect(pose.right.hand).toEqual(hand);
      expect(pose.right.elbowPole).toEqual([-0.8, 1.6, -0.5]);
      expect(pose.left).toEqual(before[studentIndex(id)].left);
    }
  });
  it("copies both arms independently and refuses ambiguous copy selection", () => {
    const store = new EditorStore();
    store.select(["R2-C6"]);
    store.posePreset("Arms Crossed");
    store.copyPose();
    const clipboard = store.clipboard!;
    store.selectGroup("row", 3);
    store.pastePose();
    const pasted = clonePoses(store.getSnapshot().displayPoses);
    store.copyPose();
    expect(store.getSnapshot().error).toMatch(/exactly one/);
    store.select(["R2-C6"]);
    store.posePreset("Both Arms Up");
    for (const id of groupIds("row", 3)) {
      const pose = store.getSnapshot().displayPoses[studentIndex(id)];
      expect(pose).toEqual(pasted[studentIndex(id)]);
      expect(pose.left).toEqual(clipboard.left);
    }
    const externalClipboard = store.clipboard!;
    externalClipboard.left.hand[0] += 20;
    expect(store.clipboard!.left.hand).toEqual(clipboard.left.hand);
  });
  it("implements shift row/column selection and active-student order without linkage", () => {
    const store = new EditorStore();
    store.selectGroup("row", 3);
    store.selectGroup("column", 4, true);
    expect(store.getSnapshot().selection.size).toBe(17);
    expect(store.getSnapshot().activeId).toBe("R1-C4");
    store.selectGroup("row", 3, true);
    expect(store.getSnapshot().selection.size).toBe(5);
    store.toggleStudent("R2-C4");
    expect(store.getSnapshot().selection.has("R2-C4")).toBe(false);
    store.toggleStudent("R6-C12");
    expect(store.getSnapshot().activeId).toBe("R6-C12");
    store.setActive("left", "elbow");
    store.select(["R2-C2"]);
    expect(store.getSnapshot().activeSide).toBe("right");
    expect(store.getSnapshot().activeControl).toBe("hand");
    store.select([]);
    store.posePreset("Both Arms Up");
    expect(store.getSnapshot().canUndo).toBe(false);
  });
});

describe("undoable transactions and saved baselines", () => {
  it("records exactly one changed drag and restores the full pose and time with selection preserved", () => {
    const store = new EditorStore();
    store.navigate(2.5);
    store.selectGroup("row", 4);
    const before = clonePoses(store.getSnapshot().displayPoses);
    store.beginEdit("Drag right hand");
    store.previewArm("right", { hand: [-0.3, 1.3, 0.3] });
    store.previewArm("right", { hand: [-0.3, 1.9, 0.3] });
    expect(store.getSnapshot().canUndo).toBe(false);
    store.commitEdit();
    const after = clonePoses(store.getSnapshot().displayPoses);
    store.navigate(5);
    store.undo();
    expect(store.getSnapshot().displayPoses).toEqual(before);
    expect(store.getSnapshot().project.playhead).toBe(2.5);
    expect(store.getSnapshot().selection.size).toBe(12);
    expect(store.getSnapshot().canUndo).toBe(false);
    expect(store.getSnapshot().dirty).toBe(false);
    store.redo();
    expect(store.getSnapshot().displayPoses).toEqual(after);
    expect(store.getSnapshot().canRedo).toBe(false);
  });
  it("canceled, unchanged and invalid drags create no history and never mutate caller snapshots", () => {
    const store = new EditorStore();
    store.select(["R1-C1"]);
    const before = clonePoses(store.getSnapshot().displayPoses),
      caller = clonePoses(before);
    caller[0].right.hand[1] += 0.25;
    store.beginEdit("Drag");
    store.previewEdit(caller);
    store.cancelEdit();
    expect(store.getSnapshot().displayPoses).toEqual(before);
    expect(store.getSnapshot().canUndo).toBe(false);
    expect(store.getSnapshot().draft).toBe(false);
    store.beginEdit("No movement");
    store.previewEdit(before);
    store.commitEdit();
    expect(store.getSnapshot().canUndo).toBe(false);
    store.editArm("right", { hand: [NaN, 0, 0] });
    expect(store.getSnapshot().displayPoses).toEqual(before);
    expect(store.getSnapshot().canUndo).toBe(false);
    expect(caller[0].right.hand[1]).toBe(before[0].right.hand[1] + 0.25);
  });
  it("keeps committed history independent of later live pose buffers", () => {
    const store = new EditorStore();
    store.select(["R1-C1"]);
    store.posePreset("T Pose");
    const first = clonePoses(store.getSnapshot().displayPoses);
    store.beginEdit("New live drag");
    store.previewArm("right", { hand: [-0.3, 1.9, 0.2] });
    store.commitEdit();
    store.undo();
    expect(store.getSnapshot().displayPoses).toEqual(first);
    store.redo();
    store.undo();
    expect(store.getSnapshot().displayPoses).toEqual(first);
  });
  it("continuous global color updates form one transaction and canceled colors restore both materials", () => {
    const store = new EditorStore(),
      before = store.getSnapshot().project.gloveColors;
    store.beginColorEdit("palm");
    store.previewColor("palm", "#123456");
    store.previewColor("palm", "#ABCDEF");
    expect(store.getSnapshot().project.gloveColors.palm).toBe("#ABCDEF");
    expect(store.getSnapshot().canUndo).toBe(false);
    store.commitColorEdit();
    store.undo();
    expect(store.getSnapshot().project.gloveColors).toEqual(before);
    expect(store.getSnapshot().canUndo).toBe(false);
    store.redo();
    store.markSaved();
    expect(store.getSnapshot().dirty).toBe(false);
    store.undo();
    expect(store.getSnapshot().dirty).toBe(true);
    store.redo();
    expect(store.getSnapshot().dirty).toBe(false);
    store.beginColorEdit("back");
    store.previewColor("back", "#010203");
    store.cancelColorEdit();
    expect(store.getSnapshot().project.gloveColors.back).toBe(before.back);
  });
  it("retains at most 100 edits and clears redo on a new transaction", () => {
    const store = new EditorStore();
    for (let i = 1; i <= 105; i++) store.setName(`Routine ${i}`);
    for (let i = 0; i < 100; i++) store.undo();
    expect(store.getSnapshot().project.name).toBe("Routine 5");
    expect(store.getSnapshot().canUndo).toBe(false);
    store.setName("New branch");
    expect(store.getSnapshot().canRedo).toBe(false);
  });
});

describe("keyframes, playback and draft decisions", () => {
  it("captures a full sampled stand with a row-only override at 2.5 seconds without aliases", () => {
    const store = new EditorStore(keyedProject());
    store.navigate(2.5);
    const sampled = clonePoses(store.getSnapshot().displayPoses);
    store.selectGroup("row", 4);
    store.posePreset("T Pose");
    const edited = clonePoses(store.getSnapshot().displayPoses);
    store.addKeyframe();
    const captured = store
      .getSnapshot()
      .project.keyframes.find((key) => key.time === 2.5)!;
    expect(captured.poses).toEqual(edited);
    expect(store.getSnapshot().draft).toBe(false);
    for (let i = 0; i < 72; i++)
      if (i < 36 || i >= 48) expect(captured.poses[i]).toEqual(sampled[i]);
    store.posePreset("Both Arms Down");
    expect(captured.poses).toEqual(edited);
    store.addKeyframe();
    expect(
      store.getSnapshot().project.keyframes.find((key) => key.time === 2.5)!.id,
    ).toBe(captured.id);
    expect(store.getSnapshot().project.keyframes).toHaveLength(3);
  });
  it("rejects collisions and shortened choreography without changing any snapshots or history", () => {
    const store = new EditorStore(keyedProject()),
      before = store.serializedProject();
    store.moveKeyframe(before.keyframes[1].id, 0);
    expect(store.getSnapshot().error).toBe(
      "A keyframe already exists at this time.",
    );
    expect(store.serializedProject()).toEqual(before);
    store.setDuration(3);
    expect(store.getSnapshot().error).toBe(
      "Duration cannot end before the last keyframe.",
    );
    expect(store.serializedProject()).toEqual(before);
    expect(store.getSnapshot().canUndo).toBe(false);
  });
  it("moves and deletes keys atomically, resamples, and undo/redo restores marker data and geometry", () => {
    const store = new EditorStore(keyedProject());
    store.navigate(1);
    const before = clonePoses(store.getSnapshot().displayPoses),
      id = store.getSnapshot().project.keyframes[1].id;
    store.moveKeyframe(id, 2);
    const moved = clonePoses(store.getSnapshot().displayPoses);
    expect(moved).not.toEqual(before);
    store.undo();
    expect(store.getSnapshot().displayPoses).toEqual(before);
    expect(store.getSnapshot().project.keyframes[1].time).toBe(4);
    store.redo();
    expect(store.getSnapshot().displayPoses).toEqual(moved);
    store.selectKeyframe(id);
    store.deleteKeyframe();
    expect(store.getSnapshot().project.keyframes).toHaveLength(1);
    expect(store.getSnapshot().displayPoses).toEqual(
      store.getSnapshot().project.keyframes[0].poses,
    );
    store.undo();
    expect(store.getSnapshot().project.keyframes).toHaveLength(2);
    expect(store.getSnapshot().displayPoses).toEqual(moved);
  });
  it("supports cancel, capture-and-continue, discard and play through the draft guard", () => {
    const store = new EditorStore(keyedProject());
    store.navigate(2.5);
    store.selectGroup("row", 4);
    store.posePreset("T Pose");
    const edited = clonePoses(store.getSnapshot().displayPoses);
    store.navigate(3);
    expect(store.getSnapshot().pending).toBe("draft");
    expect(store.getSnapshot().project.playhead).toBe(2.5);
    store.resolveDraft("cancel");
    expect(store.getSnapshot().displayPoses).toEqual(edited);
    expect(store.getSnapshot().pending).toBeNull();
    store.navigate(3);
    store.resolveDraft("capture");
    expect(
      store.getSnapshot().project.keyframes.find((key) => key.time === 2.5)!
        .poses,
    ).toEqual(edited);
    expect(store.getSnapshot().project.playhead).toBe(3);
    expect(store.getSnapshot().draft).toBe(false);
    store.posePreset("Arms Crossed");
    store.play();
    expect(store.getSnapshot().pending).toBe("draft");
    expect(store.getSnapshot().playing).toBe(false);
    store.resolveDraft("discard");
    expect(store.getSnapshot().playing).toBe(true);
    expect(store.getSnapshot().draft).toBe(false);
  });
  it("draft guards a duration clamp, and undo restores the pre-clamp time and displayed draft", () => {
    const project = keyedProject();
    project.keyframes = project.keyframes.filter((key) => key.time === 0);
    const store = new EditorStore(project);
    store.navigate(6);
    store.select(["R1-C1"]);
    store.posePreset("Both Arms Up");
    const before = clonePoses(store.getSnapshot().displayPoses);
    store.setDuration(5);
    expect(store.getSnapshot().pending).toBe("draft");
    expect(store.getSnapshot().project.duration).toBe(8);
    store.resolveDraft("discard");
    expect(store.getSnapshot().project.duration).toBe(5);
    expect(store.getSnapshot().project.playhead).toBe(5);
    store.undo();
    expect(store.getSnapshot().project.playhead).toBe(6);
    expect(store.getSnapshot().displayPoses).toEqual(before);
    expect(store.getSnapshot().draft).toBe(true);
  });
  it("playback uses elapsed seconds and speed, does not dirty or add history, holds final frame and restarts", () => {
    const store = new EditorStore(keyedProject());
    const keyframes = structuredClone(store.getSnapshot().project.keyframes);
    store.setSpeed(2);
    store.play();
    store.tick(0.5);
    expect(store.getSnapshot().project.playhead).toBe(1);
    expect(store.getSnapshot().dirty).toBe(false);
    expect(store.getSnapshot().canUndo).toBe(false);
    store.pause();
    store.tick(1);
    expect(store.getSnapshot().project.playhead).toBe(1);
    store.play();
    store.tick(10);
    expect(store.getSnapshot().project.playhead).toBe(8);
    expect(store.getSnapshot().playing).toBe(false);
    expect(store.getSnapshot().displayPoses).toEqual(keyframes[1].poses);
    store.play();
    expect(store.getSnapshot().project.playhead).toBe(0);
    store.tick(0.5);
    store.stop();
    expect(store.getSnapshot().project.playhead).toBe(0);
    expect(store.getSnapshot().playing).toBe(false);
    expect(store.getSnapshot().project.keyframes).toEqual(keyframes);
    expect(store.getSnapshot().dirty).toBe(false);
  });
  it("unkeyed playback holds the current working pose without prompting and loaded drafts stay clean", () => {
    const store = new EditorStore();
    store.select(["R1-C1"]);
    store.posePreset("Arms Crossed");
    store.markSaved();
    const working = clonePoses(store.getSnapshot().displayPoses);
    store.navigate(3);
    store.play();
    store.tick(1);
    expect(store.getSnapshot().displayPoses).toEqual(working);
    expect(store.getSnapshot().pending).toBeNull();
    expect(store.getSnapshot().dirty).toBe(false);
    const saved = keyedProject();
    saved.playhead = 2.5;
    saved.poses = STUDENT_IDS.map((id) => presetPose("T Pose", id));
    store.load(saved);
    expect(store.getSnapshot().displayPoses).toEqual(saved.poses);
    expect(store.getSnapshot().draft).toBe(true);
    expect(store.getSnapshot().dirty).toBe(false);
    store.navigate(3);
    expect(store.getSnapshot().pending).toBe("draft");
  });
  it("serializes display/playhead without modifying stored keys or giving callers mutable aliases", () => {
    const store = new EditorStore(keyedProject());
    store.navigate(2.5);
    const keysBefore = structuredClone(store.getSnapshot().project.keyframes),
      serialized = store.serializedProject();
    expect(serialized.poses).toEqual(store.getSnapshot().displayPoses);
    expect(serialized.playhead).toBe(2.5);
    serialized.poses[0].left.hand[0] += 10;
    serialized.keyframes[0].poses[0].right.wrist += 1;
    expect(store.getSnapshot().project.keyframes).toEqual(keysBefore);
    expect(store.getSnapshot().dirty).toBe(false);
    store.markSaved();
    store.play();
    store.tick(0.3);
    expect(store.getSnapshot().dirty).toBe(false);
  });
  it("jumps strictly earlier/later and changes interpolation without recording navigation", () => {
    const store = new EditorStore(keyedProject());
    store.navigate(2);
    store.jumpKeyframe(1);
    expect(store.getSnapshot().project.playhead).toBe(4);
    store.jumpKeyframe(-1);
    expect(store.getSnapshot().project.playhead).toBe(0);
    store.jumpKeyframe(-1);
    expect(store.getSnapshot().project.playhead).toBe(0);
    expect(store.getSnapshot().canUndo).toBe(false);
    store.navigate(2);
    store.setInterpolation("step");
    expect(store.getSnapshot().displayPoses).toEqual(
      store.getSnapshot().project.keyframes[0].poses,
    );
    store.undo();
    expect(store.getSnapshot().project.interpolation).toBe("smooth");
    expect(store.getSnapshot().project.playhead).toBe(2);
  });
});

describe("subscriptions and atomic replacement", () => {
  it("keeps getSnapshot stable, publishes frame samples immediately and throttles playback UI to 30Hz", () => {
    const store = new EditorStore(keyedProject()),
      initial = store.getSnapshot(),
      ui = vi.fn(),
      frames = vi.fn();
    expect(store.getSnapshot()).toBe(initial);
    const unsubscribe = store.subscribe(ui),
      unsubscribeFrame = store.subscribeFrame(frames);
    store.play();
    ui.mockClear();
    frames.mockClear();
    for (let i = 0; i < 120; i++) store.tick(1 / 120);
    expect(frames).toHaveBeenCalledTimes(120);
    expect(ui.mock.calls.length).toBeLessThanOrEqual(30);
    expect(ui.mock.calls.length).toBeGreaterThanOrEqual(24);
    const sample = store.getSnapshot();
    expect(store.getSnapshot()).toBe(sample);
    unsubscribe();
    unsubscribeFrame();
    store.pause();
    expect(frames).toHaveBeenCalledTimes(120);
  });
  it("invalid load preserves project, geometry, history, selection and clipboard atomically", () => {
    const store = new EditorStore();
    store.select(["R2-C6"]);
    store.posePreset("Arms Crossed");
    store.copyPose();
    const snapshot = store.getSnapshot(),
      clipboard = store.clipboard,
      invalid = createProject();
    invalid.poses[1].id = invalid.poses[0].id;
    expect(() => store.load(invalid)).toThrow(/id/);
    expect(store.getSnapshot()).toBe(snapshot);
    expect(store.clipboard).toEqual(clipboard);
    store.undo();
    expect(store.getSnapshot().displayPoses[17]).toEqual(
      presetPose("Neutral", "R2-C6"),
    );
    store.load(keyedProject());
    expect(store.getSnapshot().selection.size).toBe(0);
    expect(store.clipboard).toBeNull();
    expect(store.getSnapshot().canUndo).toBe(false);
  });
});

describe("atomic group patterns", () => {
  it("applies alternating presets in column-then-row order as one undo and leaves unselected overrides", () => {
    const store = new EditorStore();
    store.select(["R6-C12"]);
    store.posePreset("Arms Crossed");
    const before = clonePoses(store.getSnapshot().displayPoses);
    store.select(["R1-C1", "R1-C2", "R2-C1", "R2-C2"]);
    store.applyPattern({
      type: "alternate",
      presetA: "Left Arm Up",
      presetB: "Right Arm Up",
    });
    const result = store.getSnapshot().displayPoses;
    expect(result[0]).toEqual(presetPose("Left Arm Up", "R1-C1"));
    expect(result[12]).toEqual(presetPose("Right Arm Up", "R2-C1"));
    expect(result[1]).toEqual(presetPose("Left Arm Up", "R1-C2"));
    expect(result[13]).toEqual(presetPose("Right Arm Up", "R2-C2"));
    expect(result[71]).toEqual(before[71]);
    store.undo();
    expect(store.getSnapshot().displayPoses).toEqual(before);
  });
  it("produces body-relative gradients and reversible waves while retaining wrists, poles and untouched arms", () => {
    const poses = createProject().poses,
      selection = new Set(["R1-C1", "R1-C2", "R1-C3", "R1-C4", "R1-C5"]);
    poses[0].right.wrist = 1;
    const gradient = applyPattern(poses, selection, {
      type: "gradient",
      start: 0,
      end: 180,
    });
    expect(gradient[0].right.hand[1]).toBeCloseTo(0.59, 8);
    expect(gradient[4].right.hand[1]).toBeCloseTo(2.11, 8);
    expect(gradient[0].right.wrist).toBe(1);
    expect(gradient[0].right.elbowPole).toEqual(poses[0].right.elbowPole);
    for (let i = 0; i < 72; i++)
      expect(gradient[i].left).toEqual(poses[i].left);
    const forward = applyPattern(poses, selection, { type: "wave" }),
      reverse = applyPattern(poses, selection, { type: "wave", reverse: true });
    expect(forward[1].right.hand[1]).toBeGreaterThan(forward[3].right.hand[1]);
    expect(reverse[1].right.hand[1]).toBeLessThan(reverse[3].right.hand[1]);
    expect(() =>
      applyPattern(poses, selection, { type: "gradient", start: NaN }),
    ).toThrow(/finite/);
    expect(
      applyPattern(poses, new Set(["R1-C1"]), { type: "gradient" })[0].right
        .hand[1],
    ).toBeCloseTo(0.59, 8);
  });
  it("mirrors only complete selected pairs from an immutable left-half source snapshot", () => {
    const poses = createProject().poses;
    poses[0] = presetPose("Arms Crossed", "R1-C1");
    poses[11] = presetPose("Both Arms Up", "R1-C12");
    const before = clonePoses(poses),
      selection = new Set(["R1-C1", "R1-C12", "R2-C2"]);
    expect(canMirrorFormation(selection)).toBe(true);
    expect(canMirrorFormation(new Set(["R1-C1"]))).toBe(false);
    const result = applyPattern(poses, selection, { type: "mirror" });
    expect(result[11]).toEqual({ ...mirrorPose(before[0]), id: "R1-C12" });
    expect(result[0]).toEqual(before[0]);
    for (let i = 0; i < 72; i++)
      if (i !== 11) expect(result[i]).toEqual(before[i]);
    expect(poses).toEqual(before);
  });
  it("sample buffers are not shared with generator results or key snapshots", () => {
    const project = keyedProject(),
      out = clonePoses(project.poses);
    sampleTimeline(project.keyframes, 2.5, project.poses, "smooth", out);
    const result = applyPattern(out, new Set(groupIds("row", 4)), {
      type: "wave",
      arm: "both",
    });
    const saved = clonePoses(result);
    sampleTimeline(project.keyframes, 1, project.poses, "smooth", out);
    expect(result).toEqual(saved);
    expect(result[0].right.hand).not.toBe(out[0].right.hand);
  });
});

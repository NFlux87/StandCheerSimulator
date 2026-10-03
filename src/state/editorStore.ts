import { groupIds, STUDENT_IDS, studentIndex } from "../domain/formation";
import { makeArmSolution, solveArm, wrapWrist } from "../domain/ik";
import {
  applyPattern as generatePattern,
  canMirrorFormation,
  type PatternOptions,
} from "../domain/patterns";
import { clonePose, clonePoses, mirrorPose, presetPose } from "../domain/poses";
import { createProject, validateProject } from "../domain/project";
import {
  captureKeyframe,
  quantizeTime,
  sampleTimeline,
} from "../domain/timeline";
import type {
  ArmPose,
  ArmSide,
  ControlPoint,
  Project,
  StudentPose,
} from "../domain/types";

export interface EditorSnapshot {
  project: Project;
  displayPoses: StudentPose[];
  selection: Set<string>;
  activeId: string | null;
  activeSide: ArmSide;
  activeControl: ControlPoint;
  playing: boolean;
  speed: number;
  mode: "select" | "orbit";
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  draft: boolean;
  error: string | null;
  message: string | null;
  selectedKeyframe: string | null;
  pending: null | "draft";
}

type WorkingState = { project: Project; poses: StudentPose[]; draft: boolean };
type HistoryEntry = {
  label: string;
  before: WorkingState;
  after: WorkingState;
};
type Transaction = {
  label: string;
  before: WorkingState;
  kind: "pose" | "color";
};
type Navigation =
  | { kind: "navigate"; time: number }
  | { kind: "play" }
  | { kind: "duration"; value: number };
const SIDES: ArmSide[] = ["left", "right"];

/** Coordinates tolerate imported/solved roundoff; wrists compare modulo a turn. */
function equalPoses(
  a: readonly StudentPose[],
  b: readonly StudentPose[],
  tolerance = 1e-6,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    for (const side of SIDES) {
      const left = a[i][side],
        right = b[i][side];
      if (
        Math.abs(
          Math.atan2(
            Math.sin(left.wrist - right.wrist),
            Math.cos(left.wrist - right.wrist),
          ),
        ) > tolerance
      )
        return false;
      for (let axis = 0; axis < 3; axis++) {
        if (
          Math.abs(left.hand[axis] - right.hand[axis]) > tolerance ||
          Math.abs(left.elbowPole[axis] - right.elbowPole[axis]) > tolerance
        )
          return false;
      }
    }
  }
  return true;
}
function projectSignature(project: Project): string {
  // Navigation is deliberately excluded: playback/scrubbing must never dirty a save.
  return JSON.stringify({ ...project, playhead: 0 });
}
function ownedProject(project: Project): Project {
  return {
    ...project,
    gloveColors: { ...project.gloveColors },
    poses: clonePoses(project.poses),
    keyframes: project.keyframes.map((key) => ({
      ...key,
      poses: clonePoses(key.poses),
    })),
  };
}

export class EditorStore {
  private state: EditorSnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly frameListeners = new Set<() => void>();
  private history: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private transaction: Transaction | null = null;
  private pendingNavigation: Navigation | null = null;
  private copied: StudentPose | null = null;
  private baseline: string;
  private sampleBuffer: StudentPose[];
  private uiElapsed = 0;
  private readonly armSolution = makeArmSolution();
  private readonly armScratch: ArmPose = {
    hand: [0, 0, 0],
    elbowPole: [0, 0, 0],
    wrist: 0,
  };

  constructor(project: Project = createProject()) {
    const initial = validateProject(project);
    this.sampleBuffer = clonePoses(initial.poses);
    const displayPoses = clonePoses(initial.poses);
    const draft =
      initial.keyframes.length > 0 &&
      !equalPoses(
        displayPoses,
        sampleTimeline(
          initial.keyframes,
          initial.playhead,
          initial.poses,
          initial.interpolation,
          this.sampleBuffer,
        ),
      );
    this.state = {
      project: initial,
      displayPoses,
      selection: new Set(),
      activeId: null,
      activeSide: "right",
      activeControl: "hand",
      playing: false,
      speed: 1,
      mode: "select",
      dirty: false,
      canUndo: false,
      canRedo: false,
      draft,
      error: null,
      message: null,
      selectedKeyframe: null,
      pending: null,
    };
    this.baseline = projectSignature(initial);
  }

  getSnapshot = (): EditorSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  subscribeFrame = (listener: () => void): (() => void) => {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  };
  get clipboard(): StudentPose | null {
    return this.copied ? clonePose(this.copied) : null;
  }

  private publish(changes: Partial<EditorSnapshot> = {}, ui = true): void {
    this.state = { ...this.state, ...changes };
    for (const listener of this.frameListeners) listener();
    if (ui) {
      this.uiElapsed = 0;
      for (const listener of this.listeners) listener();
    }
  }
  private workingState(): WorkingState {
    return {
      project: this.state.project,
      poses: clonePoses(this.state.displayPoses),
      draft: this.state.draft,
    };
  }
  private pushHistory(label: string, before: WorkingState): void {
    this.history.push({ label, before, after: this.workingState() });
    if (this.history.length > 100) this.history.shift();
    this.future = [];
    this.publish({
      canUndo: true,
      canRedo: false,
      dirty: projectSignature(this.state.project) !== this.baseline,
      error: null,
    });
  }
  private resample(time: number): StudentPose[] {
    sampleTimeline(
      this.state.project.keyframes,
      time,
      this.state.project.poses,
      this.state.project.interpolation,
      this.sampleBuffer,
    );
    // Exchange owned buffers: both remain independent of immutable history/keyframes.
    const next = this.sampleBuffer;
    this.sampleBuffer = this.state.displayPoses;
    return next;
  }
  private finishTransaction(): void {
    if (this.transaction?.kind === "color") this.commitColorEdit();
    else if (this.transaction) this.commitEdit();
  }

  select(ids: string[], activeId?: string): void {
    const selection = new Set(STUDENT_IDS.filter((id) => ids.includes(id)));
    const active =
      activeId && selection.has(activeId)
        ? activeId
        : (STUDENT_IDS.find((id) => selection.has(id)) ?? null);
    this.publish({
      selection,
      activeId: active,
      activeSide: "right",
      activeControl: "hand",
    });
  }
  toggleStudent(id: string): void {
    if (!STUDENT_IDS.includes(id)) return;
    const selection = new Set(this.state.selection);
    if (selection.has(id)) selection.delete(id);
    else selection.add(id);
    this.select([...selection], selection.has(id) ? id : undefined);
  }
  selectGroup(kind: "row" | "column", value: number, shift = false): void {
    const ids = groupIds(kind, value);
    if (!shift) {
      this.select(ids);
      return;
    }
    const selection = new Set(this.state.selection),
      remove = ids.every((id) => selection.has(id));
    for (const id of ids) {
      if (remove) selection.delete(id);
      else selection.add(id);
    }
    this.select([...selection]);
  }
  setActive(side: ArmSide, control: ControlPoint): void {
    this.publish({ activeSide: side, activeControl: control });
  }
  setMode(mode: "select" | "orbit"): void {
    this.publish({ mode });
  }
  setSpeed(speed: number): void {
    if (![0.25, 0.5, 1, 1.5, 2].includes(speed)) {
      this.report("Choose a playback speed of 0.25×, 0.5×, 1×, 1.5×, or 2×.");
      return;
    }
    this.publish({ speed });
  }

  beginEdit(label: string): void {
    if (this.transaction?.kind === "color") this.commitColorEdit();
    if (this.transaction) return;
    this.pause();
    this.transaction = { label, before: this.workingState(), kind: "pose" };
  }
  previewEdit(poses: readonly StudentPose[]): void {
    if (!this.transaction || this.transaction.kind !== "pose") return;
    if (
      poses.length !== STUDENT_IDS.length ||
      poses.some((pose, i) => pose.id !== STUDENT_IDS[i])
    ) {
      this.report("An edit must include all 72 students in row-major order.");
      return;
    }
    // Caller-owned gesture arrays must not alias the published buffer or history.
    for (let i = 0; i < poses.length; i++)
      for (const side of SIDES) {
        const input = poses[i][side];
        if (
          !Number.isFinite(input.wrist) ||
          !input.hand.every(Number.isFinite) ||
          !input.elbowPole.every(Number.isFinite)
        ) {
          this.report("Arm coordinates and wrist angle must be finite.");
          return;
        }
      }
    const displayPoses = this.state.displayPoses;
    for (let i = 0; i < poses.length; i++)
      for (const side of SIDES) {
        const source = poses[i][side],
          target = displayPoses[i][side];
        const distance = Math.hypot(
          source.hand[0] - (side === "left" ? 0.24 : -0.24),
          source.hand[1] - 1.35,
          source.hand[2],
        );
        const hand =
          distance >= 0.001 && distance <= 0.799
            ? source.hand
            : solveArm(side, source, this.armSolution).hand;
        for (let axis = 0; axis < 3; axis++) {
          target.hand[axis] = hand[axis];
          target.elbowPole[axis] = source.elbowPole[axis];
        }
        target.wrist = wrapWrist(source.wrist);
      }
    this.publish({ displayPoses, draft: true, error: null });
  }
  commitEdit(): void {
    const transaction = this.transaction;
    if (!transaction || transaction.kind !== "pose") return;
    this.transaction = null;
    if (equalPoses(transaction.before.poses, this.state.displayPoses, 1e-12)) {
      this.publish({
        displayPoses: clonePoses(transaction.before.poses),
        draft: transaction.before.draft,
      });
      return;
    }
    this.state = {
      ...this.state,
      project: {
        ...this.state.project,
        poses: clonePoses(this.state.displayPoses),
      },
      draft: true,
    };
    this.pushHistory(transaction.label, transaction.before);
  }
  cancelEdit(): void {
    if (!this.transaction) return;
    const before = this.transaction.before;
    this.transaction = null;
    this.publish({
      project: before.project,
      displayPoses: clonePoses(before.poses),
      draft: before.draft,
      error: null,
    });
  }
  applyProjectEdit(label: string, next: Project): void {
    this.finishTransaction();
    this.pause();
    const before = this.workingState();
    if (
      projectSignature(before.project) === projectSignature(next) &&
      before.project.playhead === next.playhead
    )
      return;
    // Share only unchanged, already-owned immutable keyframes across history.
    const project: Project = {
      ...next,
      gloveColors: { ...next.gloveColors },
      poses: clonePoses(next.poses),
      keyframes: next.keyframes.map((key) => {
        const previous = before.project.keyframes.find(
          (frame) => frame.id === key.id,
        );
        return key === previous
          ? key
          : {
              ...key,
              poses:
                key.poses === previous?.poses
                  ? key.poses
                  : clonePoses(key.poses),
            };
      }),
    };
    this.state = {
      ...this.state,
      project,
      displayPoses: clonePoses(project.poses),
    };
    this.pushHistory(label, before);
  }

  previewArm(side: ArmSide, change: Partial<ArmPose>): void {
    if (!this.state.selection.size || !this.state.activeId) return;
    const hasGeometry =
      change.hand !== undefined || change.elbowPole !== undefined;
    const active =
      this.state.displayPoses[studentIndex(this.state.activeId)][side];
    const input = this.armScratch;
    for (let axis = 0; axis < 3; axis++) {
      input.hand[axis] = (change.hand ?? active.hand)[axis];
      input.elbowPole[axis] = (change.elbowPole ?? active.elbowPole)[axis];
    }
    input.wrist = change.wrist ?? active.wrist;
    if (
      !Number.isFinite(input.wrist) ||
      !input.hand.every(Number.isFinite) ||
      !input.elbowPole.every(Number.isFinite)
    ) {
      this.report("Arm coordinates and wrist angle must be finite.");
      return;
    }
    if (!this.transaction) this.beginEdit("Edit arm");
    if (this.transaction?.kind !== "pose") return;
    const hand =
      change.hand === undefined
        ? input.hand
        : solveArm(side, input, this.armSolution).hand;
    const wrist = wrapWrist(input.wrist);
    for (const pose of this.state.displayPoses) {
      if (!this.state.selection.has(pose.id)) continue;
      const target = pose[side];
      if (hasGeometry)
        for (let axis = 0; axis < 3; axis++) {
          target.hand[axis] = hand[axis];
          target.elbowPole[axis] = input.elbowPole[axis];
        }
      target.wrist = wrist;
    }
    this.publish({
      displayPoses: this.state.displayPoses,
      draft: true,
      error: null,
    });
  }
  editArm(side: ArmSide, change: Partial<ArmPose>, label = "Edit arm"): void {
    if (!this.state.selection.size) return;
    this.beginEdit(label);
    this.previewArm(side, change);
    this.commitEdit();
  }
  posePreset(name: string): void {
    if (!this.state.selection.size) return;
    try {
      const poses = this.state.displayPoses.map((pose) =>
        this.state.selection.has(pose.id)
          ? presetPose(name, pose.id)
          : clonePose(pose),
      );
      this.beginEdit(name);
      this.previewEdit(poses);
      this.commitEdit();
    } catch (error) {
      this.report(error instanceof Error ? error.message : String(error));
    }
  }
  copyPose(): void {
    if (this.state.selection.size !== 1 || !this.state.activeId) {
      this.report("Select exactly one student to copy a pose.");
      return;
    }
    this.copied = clonePose(
      this.state.displayPoses[studentIndex(this.state.activeId)],
    );
    this.publish({
      message: `Copied pose from ${this.copied.id}.`,
      error: null,
    });
  }
  pastePose(): void {
    if (!this.copied || !this.state.selection.size) return;
    const poses = this.state.displayPoses.map((pose) =>
      this.state.selection.has(pose.id)
        ? { ...clonePose(this.copied!), id: pose.id }
        : clonePose(pose),
    );
    this.beginEdit("Paste pose");
    this.previewEdit(poses);
    this.commitEdit();
  }
  mirrorSelected(): void {
    if (!this.state.selection.size) return;
    const poses = this.state.displayPoses.map((pose) =>
      this.state.selection.has(pose.id) ? mirrorPose(pose) : clonePose(pose),
    );
    this.beginEdit("Mirror pose");
    this.previewEdit(poses);
    this.commitEdit();
  }
  resetPose(): void {
    this.posePreset("Neutral");
  }
  applyPattern(options: PatternOptions): void {
    if (!this.state.selection.size) return;
    if (
      options.type === "mirror" &&
      !canMirrorFormation(this.state.selection)
    ) {
      this.report(
        "Select both members of at least one mirrored column pair in a row.",
      );
      return;
    }
    try {
      const poses = generatePattern(
        this.state.displayPoses,
        this.state.selection,
        options,
      );
      this.beginEdit(`${options.type} pattern`);
      this.previewEdit(poses);
      this.commitEdit();
    } catch (error) {
      this.report(error instanceof Error ? error.message : String(error));
    }
  }

  private restore(working: WorkingState): void {
    this.transaction = null;
    this.pendingNavigation = null;
    const selectedKeyframe =
      this.state.selectedKeyframe &&
      working.project.keyframes.some(
        (key) => key.id === this.state.selectedKeyframe,
      )
        ? this.state.selectedKeyframe
        : null;
    this.publish({
      project: working.project,
      displayPoses: clonePoses(working.poses),
      draft: working.draft,
      playing: false,
      pending: null,
      selectedKeyframe,
      canUndo: this.history.length > 0,
      canRedo: this.future.length > 0,
      dirty: projectSignature(working.project) !== this.baseline,
      error: null,
    });
  }
  undo(): void {
    if (this.transaction) this.cancelEdit();
    const entry = this.history.pop();
    if (!entry) return;
    this.future.push(entry);
    this.restore(entry.before);
  }
  redo(): void {
    if (this.transaction) this.cancelEdit();
    const entry = this.future.pop();
    if (!entry) return;
    this.history.push(entry);
    this.restore(entry.after);
  }

  private requestNavigation(action: Navigation): void {
    this.finishTransaction();
    if (this.state.draft && this.state.project.keyframes.length > 0) {
      this.pendingNavigation = action;
      this.publish({ pending: "draft" });
      return;
    }
    this.performNavigation(action);
  }
  private performNavigation(action: Navigation): void {
    this.pendingNavigation = null;
    if (action.kind === "duration") {
      this.changeDuration(action.value);
      return;
    }
    const project = this.state.project;
    const time =
      action.kind === "play"
        ? project.playhead >= project.duration
          ? 0
          : project.playhead
        : action.time;
    const displayPoses = this.resample(time);
    this.publish({
      project: { ...project, playhead: time },
      displayPoses,
      playing: action.kind === "play",
      draft: project.keyframes.length ? false : this.state.draft,
      pending: null,
      error: null,
    });
  }
  navigate(time: number): void {
    if (!Number.isFinite(time)) {
      this.report("Time must be a finite number.");
      return;
    }
    const clamped = Math.max(0, Math.min(this.state.project.duration, time));
    if (clamped === this.state.project.playhead) return;
    this.requestNavigation({ kind: "navigate", time: clamped });
  }
  play(): void {
    if (!this.state.playing) this.requestNavigation({ kind: "play" });
  }
  pause(): void {
    if (this.state.playing) this.publish({ playing: false });
  }
  stop(): void {
    this.requestNavigation({ kind: "navigate", time: 0 });
  }
  tick(elapsedSeconds: number): void {
    if (
      !this.state.playing ||
      !Number.isFinite(elapsedSeconds) ||
      elapsedSeconds <= 0
    )
      return;
    const project = this.state.project,
      time = Math.min(
        project.duration,
        project.playhead + elapsedSeconds * this.state.speed,
      );
    const displayPoses = this.resample(time),
      playing = time < project.duration;
    this.uiElapsed += elapsedSeconds;
    this.publish(
      { project: { ...project, playhead: time }, displayPoses, playing },
      !playing || this.uiElapsed >= 1 / 30,
    );
  }
  resolveDraft(choice: "capture" | "discard" | "cancel"): void {
    const action = this.pendingNavigation;
    if (!action) return;
    this.pendingNavigation = null;
    if (choice === "cancel") {
      this.publish({ pending: null });
      return;
    }
    if (choice === "capture") this.addKeyframe();
    this.performNavigation(action);
  }

  addKeyframe(): void {
    this.finishTransaction();
    const time = this.state.project.playhead;
    const project = captureKeyframe(
      { ...this.state.project, poses: clonePoses(this.state.displayPoses) },
      time,
      this.state.displayPoses,
    );
    this.applyProjectEdit("Capture keyframe", project);
    const key = project.keyframes.find(
      (frame) =>
        Math.abs(frame.time - quantizeTime(time, project.duration)) <= 1e-6,
    )!;
    this.publish({ draft: false, selectedKeyframe: key.id, error: null });
    // Capturing clears the draft in the history's after-state as well.
    const entry = this.history[this.history.length - 1];
    if (entry && entry.after.project === this.state.project)
      entry.after.draft = false;
  }
  selectKeyframe(id: string | null): void {
    if (
      id !== null &&
      !this.state.project.keyframes.some((key) => key.id === id)
    )
      return;
    this.publish({ selectedKeyframe: id });
  }
  deleteKeyframe(): void {
    const id = this.state.selectedKeyframe;
    if (!id) return;
    const project = {
      ...this.state.project,
      poses: clonePoses(this.state.displayPoses),
      keyframes: this.state.project.keyframes.filter((key) => key.id !== id),
    };
    sampleTimeline(
      project.keyframes,
      project.playhead,
      project.poses,
      project.interpolation,
      this.sampleBuffer,
    );
    project.poses = clonePoses(this.sampleBuffer);
    this.applyProjectEdit("Delete keyframe", project);
    this.publish({ selectedKeyframe: null, draft: false });
    const entry = this.history[this.history.length - 1];
    if (entry && entry.after.project === this.state.project)
      entry.after.draft = false;
  }
  moveKeyframe(id: string, time: number): void {
    if (!Number.isFinite(time)) {
      this.report("Keyframe time must be finite.");
      return;
    }
    const project = this.state.project,
      original = project.keyframes.find((key) => key.id === id);
    if (!original) return;
    const snapped = quantizeTime(time, project.duration);
    if (
      project.keyframes.some(
        (key) => key.id !== id && Math.abs(key.time - snapped) <= 1e-6,
      )
    ) {
      this.report("A keyframe already exists at this time.");
      return;
    }
    if (original.time === snapped) return;
    const next = {
      ...project,
      poses: clonePoses(this.state.displayPoses),
      keyframes: project.keyframes
        .map((key) => (key.id === id ? { ...key, time: snapped } : key))
        .sort((a, b) => a.time - b.time),
    };
    if (!this.state.draft) {
      sampleTimeline(
        next.keyframes,
        next.playhead,
        next.poses,
        next.interpolation,
        this.sampleBuffer,
      );
      next.poses = clonePoses(this.sampleBuffer);
    }
    this.applyProjectEdit("Move keyframe", next);
  }
  jumpKeyframe(direction: -1 | 1): void {
    const keys = this.state.project.keyframes,
      time = this.state.project.playhead;
    if (!keys.length) return;
    const key =
      direction < 0
        ? ([...keys].reverse().find((frame) => frame.time < time - 1e-6) ??
          keys[0])
        : (keys.find((frame) => frame.time > time + 1e-6) ??
          keys[keys.length - 1]);
    this.navigate(key.time);
  }
  setDuration(value: number): void {
    if (!Number.isFinite(value) || value < 1 / 30) {
      this.report("Duration must be at least 1/30 second.");
      return;
    }
    const last =
      this.state.project.keyframes[this.state.project.keyframes.length - 1];
    if (last && value < last.time) {
      this.report("Duration cannot end before the last keyframe.");
      return;
    }
    if (value === this.state.project.duration) return;
    if (this.state.project.playhead > value) {
      this.requestNavigation({ kind: "duration", value });
      return;
    }
    this.changeDuration(value);
  }
  private changeDuration(value: number): void {
    const current = this.state.project,
      playhead = Math.min(current.playhead, value);
    const next = {
      ...current,
      duration: value,
      playhead,
      poses: clonePoses(this.state.displayPoses),
    };
    const resampled = playhead !== current.playhead;
    if (resampled) {
      sampleTimeline(
        next.keyframes,
        playhead,
        next.poses,
        next.interpolation,
        this.sampleBuffer,
      );
      next.poses = clonePoses(this.sampleBuffer);
    }
    this.applyProjectEdit("Change duration", next);
    if (resampled) {
      this.publish({
        draft: next.keyframes.length > 0 ? false : this.state.draft,
        pending: null,
      });
      const entry = this.history[this.history.length - 1];
      if (entry && entry.after.project === this.state.project)
        entry.after.draft = this.state.draft;
    }
  }
  setInterpolation(value: "smooth" | "step"): void {
    if (value === this.state.project.interpolation) return;
    const next = {
      ...this.state.project,
      interpolation: value,
      poses: clonePoses(this.state.displayPoses),
    };
    if (!this.state.draft) {
      sampleTimeline(
        next.keyframes,
        next.playhead,
        next.poses,
        value,
        this.sampleBuffer,
      );
      next.poses = clonePoses(this.sampleBuffer);
    }
    this.applyProjectEdit("Change interpolation", next);
  }
  setName(name: string): void {
    if (name === this.state.project.name) return;
    this.applyProjectEdit("Rename project", {
      ...this.state.project,
      name,
      poses: clonePoses(this.state.displayPoses),
    });
  }
  setColor(side: "palm" | "back", color: string): void {
    if (!/^#[\da-f]{6}$/i.test(color)) {
      this.report("Glove color must be a six-digit hex color.");
      return;
    }
    if (color === this.state.project.gloveColors[side]) return;
    this.applyProjectEdit("Change glove color", {
      ...this.state.project,
      poses: clonePoses(this.state.displayPoses),
      gloveColors: { ...this.state.project.gloveColors, [side]: color },
    });
  }
  beginColorEdit(side: "palm" | "back"): void {
    if (this.transaction?.kind === "pose") this.commitEdit();
    if (this.transaction) return;
    this.pause();
    this.transaction = {
      label: `Change ${side} color`,
      before: this.workingState(),
      kind: "color",
    };
  }
  previewColor(side: "palm" | "back", color: string): void {
    if (!/^#[\da-f]{6}$/i.test(color)) {
      this.report("Glove color must be a six-digit hex color.");
      return;
    }
    if (!this.transaction) this.beginColorEdit(side);
    if (this.transaction?.kind !== "color") return;
    this.publish({
      project: {
        ...this.state.project,
        gloveColors: { ...this.state.project.gloveColors, [side]: color },
      },
      error: null,
    });
  }
  commitColorEdit(): void {
    const transaction = this.transaction;
    if (!transaction || transaction.kind !== "color") return;
    this.transaction = null;
    if (
      projectSignature(transaction.before.project) ===
      projectSignature(this.state.project)
    )
      return;
    this.pushHistory(transaction.label, transaction.before);
  }
  cancelColorEdit(): void {
    if (this.transaction?.kind === "color") this.cancelEdit();
  }

  serializedProject(): Project {
    this.finishTransaction();
    return ownedProject({
      ...this.state.project,
      poses: this.state.displayPoses,
    });
  }
  load(project: Project): void {
    // Validation is entirely completed before touching current selection/history.
    const next = validateProject(project);
    this.history = [];
    this.future = [];
    this.transaction = null;
    this.pendingNavigation = null;
    this.copied = null;
    this.sampleBuffer = clonePoses(next.poses);
    const displayPoses = clonePoses(next.poses);
    const draft =
      next.keyframes.length > 0 &&
      !equalPoses(
        displayPoses,
        sampleTimeline(
          next.keyframes,
          next.playhead,
          next.poses,
          next.interpolation,
          this.sampleBuffer,
        ),
      );
    this.baseline = projectSignature(next);
    this.publish({
      project: next,
      displayPoses,
      selection: new Set(),
      activeId: null,
      activeSide: "right",
      activeControl: "hand",
      playing: false,
      dirty: false,
      canUndo: false,
      canRedo: false,
      draft,
      selectedKeyframe: null,
      pending: null,
      error: null,
      message: "Project loaded.",
    });
  }
  markSaved(): void {
    this.finishTransaction();
    // Saving navigation-only samples does not turn navigation into an edit.
    this.baseline = projectSignature(this.state.project);
    this.publish({ dirty: false, message: "Project saved.", error: null });
  }
  report(error: string | null): void {
    this.publish({ error });
  }
  inform(message: string | null): void {
    this.publish({ message });
  }
}

export const editor = new EditorStore();

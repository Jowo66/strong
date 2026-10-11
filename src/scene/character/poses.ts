// Procedural pose library. Every sim `anim` (and, while lifting, every exercise) maps to a pose function of time.
// Joint conventions (rest = standing, arms down, facing +Z):
//   arm/fore/thigh x < 0 swings the limb forward; shin x > 0 bends the knee; spine x > 0 leans forward.
//   armL z < 0 / armR z > 0 raises the arm out to the side.
import { HIP_Y, THIGH_LEN, SHIN_LEN } from './rig';
import type { Anim } from '../../sim/types';

export type V3 = [number, number, number];
export interface Pose {
  hips: V3;       // absolute hips position (rig units, root space)
  hipsRot: V3;    // whole-body orientation (Euler XYZ)
  spine: V3; head: V3;
  armL: V3; foreL: V3; armR: V3; foreR: V3;
  thighL: V3; shinL: V3; thighR: V3; shinR: V3;
  mouth: number;  // 0 closed … 1 wide open
  brows: number;  // -1 frown/focused … 0 neutral … 1 raised/surprised
  blink: number;  // 1 open … 0.1 shut
}
export type Prop = 'none' | 'barbell' | 'ezbar' | 'dumbbells' | 'dumbbell' | 'phone' | 'bottle' | 'chalk' | 'plank';

export interface PoseContext {
  anim: Anim;
  exercise?: string;     // exercise id while lifting
  resting?: boolean;     // resting between sets at a station
  stationType?: string;
  t: number;             // seconds, with a per-member phase offset
  variant: number;       // stable per member, 0..1
  reduced: boolean;
  carry?: boolean;       // crew carrying a plank
}

const PI = Math.PI;
const zero = (): V3 => [0, 0, 0];

export function restPose(): Pose {
  return {
    hips: [0, HIP_Y, 0], hipsRot: zero(), spine: zero(), head: zero(),
    armL: [0, 0, -0.08], foreL: [-0.15, 0, 0], armR: [0, 0, 0.08], foreR: [-0.15, 0, 0],
    thighL: zero(), shinL: zero(), thighR: zero(), shinR: zero(),
    mouth: 0, brows: 0, blink: 1,
  };
}

/** Hips height that keeps the feet on the floor for a given thigh flexion (a > 0 = forward) and knee bend (b). */
const grounded = (a: number, b: number) => THIGH_LEN * Math.cos(a) + SHIN_LEN * Math.cos(b - a);
/** 0..1..0 smooth repetition curve. */
const rep = (t: number, period: number) => (1 - Math.cos((t / period) * 2 * PI)) / 2;
const lerp = (a: number, b: number, s: number) => a + (b - a) * s;

function legsSquat(p: Pose, depth: number): void {
  const a = 1.35 * depth, k = 2.1 * depth;
  p.thighL = [-a, 0, -0.12 * depth]; p.thighR = [-a, 0, 0.12 * depth];
  p.shinL = [k, 0, 0]; p.shinR = [k, 0, 0];
  p.hips[1] = grounded(a, k) + 0.01;
  p.spine = [0.55 * depth, 0, 0];
}

function seated(p: Pose, seatY: number): void {
  p.hips[1] = seatY;
  p.thighL = [-PI / 2, 0, -0.1]; p.thighR = [-PI / 2, 0, 0.1];
  p.shinL = [PI / 2 - 0.1, 0, 0]; p.shinR = [PI / 2 - 0.1, 0, 0];
}

/** Lying face-up, head towards +Z (the bar), on a bench of the given pad height (rig units). */
function lyingOnBench(p: Pose, padY: number, incline = 0): void {
  p.hipsRot = [-PI / 2 + incline, PI, 0];
  p.hips = [0, padY + 0.12, -0.32 + incline * 0.15];
  // feet planted: thighs along the bench then shins down to the floor
  p.thighL = [-0.25 - incline * 0.5, 0, -0.25]; p.thighR = [-0.25 - incline * 0.5, 0, 0.25];
  p.shinL = [PI / 2 + 0.1, 0, 0]; p.shinR = [PI / 2 + 0.1, 0, 0];
}

function hinge(p: Pose, lean: number, knee: number): void {
  p.spine = [lean, 0, 0];
  p.thighL = [-knee * 0.6, 0, -0.06]; p.thighR = [-knee * 0.6, 0, 0.06];
  p.shinL = [knee, 0, 0]; p.shinR = [knee, 0, 0];
  p.hips[1] = grounded(knee * 0.6, knee);
  p.hips[2] = -0.06 * lean;
  // arms hang straight down regardless of the lean
  p.armL = [-lean, 0, -0.12]; p.armR = [-lean, 0, 0.12];
  p.foreL = [0, 0, 0]; p.foreR = [0, 0, 0];
}

function walkCycle(p: Pose, t: number, speed: number, stride: number): void {
  const w = Math.sin(t * speed);
  p.thighL = [-w * stride, 0, 0]; p.thighR = [w * stride, 0, 0];
  p.shinL = [Math.max(0, Math.sin(t * speed + 1.2)) * stride * 1.3, 0, 0];
  p.shinR = [Math.max(0, Math.sin(t * speed + 1.2 + PI)) * stride * 1.3, 0, 0];
  p.armL = [w * stride * 0.8, 0, -0.1]; p.armR = [-w * stride * 0.8, 0, 0.1];
  p.foreL = [-0.35, 0, 0]; p.foreR = [-0.35, 0, 0];
  p.hips[1] = HIP_Y - 0.01 + Math.abs(Math.cos(t * speed)) * 0.025;
}

// ---------- exercises ----------

export function propFor(exercise: string | undefined): Prop {
  switch (exercise) {
    case 'bench_press': case 'incline_press': case 'back_squat': case 'front_squat': case 'overhead_press':
    case 'deadlift': case 'romanian_deadlift': case 'barbell_row': case 'hip_thrust': case 'rack_curl':
      return 'barbell';
    case 'skull_crusher':
      return 'ezbar';
    case 'db_bench': case 'seated_shoulder_press': case 'db_curl': case 'hammer_curl': case 'lateral_raise':
    case 'shrug': case 'walking_lunge':
      return 'dumbbells';
    case 'goblet_squat':
      return 'dumbbell';
    default:
      return 'none';
  }
}

function exercisePose(p: Pose, ex: string, t: number, reduced: boolean): void {
  const amp = reduced ? 0.45 : 1;
  const s = rep(t, 2.6) * amp;          // lift repetition
  const sFast = rep(t, 1.6) * amp;
  p.brows = -0.7; p.mouth = 0.05;
  switch (ex) {
    case 'bench_press': case 'db_bench': case 'incline_press': {
      const incline = ex === 'incline_press' ? 0.55 : 0;
      lyingOnBench(p, 0.355 + incline * 0.1, incline);
      p.armL = [lerp(-0.55, -1.5, s), 0, -0.35]; p.armR = [lerp(-0.55, -1.5, s), 0, 0.35];
      p.foreL = [lerp(-1.7, -0.1, s), 0, 0]; p.foreR = [lerp(-1.7, -0.1, s), 0, 0];
      p.mouth = s > 0.8 ? 0.4 : 0.05;
      return;
    }
    case 'skull_crusher':
      lyingOnBench(p, 0.355);
      p.armL = [-1.9, 0, -0.15]; p.armR = [-1.9, 0, 0.15];
      p.foreL = [lerp(-1.9, -0.05, s), 0, 0]; p.foreR = [lerp(-1.9, -0.05, s), 0, 0];
      return;
    case 'hip_thrust': {
      lyingOnBench(p, 0.1);
      p.hipsRot = [-PI / 2 + 0.25 + s * 0.35, PI, 0];
      p.hips = [0, 0.3 + s * 0.12, -0.15];
      p.armL = [-1.2, 0, -0.5]; p.armR = [-1.2, 0, 0.5];
      p.foreL = [-1.2, 0, 0]; p.foreR = [-1.2, 0, 0];
      p.thighL = [-0.9 + s * 0.4, 0, -0.2]; p.thighR = [-0.9 + s * 0.4, 0, 0.2];
      p.shinL = [1.7 - s * 0.2, 0, 0]; p.shinR = [1.7 - s * 0.2, 0, 0];
      return;
    }
    case 'seated_shoulder_press':
      seated(p, 0.43);
      p.armL = [-0.4 - s * 2.5, 0, -1.1 + s * 0.85]; p.armR = [-0.4 - s * 2.5, 0, 1.1 - s * 0.85];
      p.foreL = [-2.3 + s * 2.2, 0, 0]; p.foreR = [-2.3 + s * 2.2, 0, 0];
      return;
    case 'back_squat': case 'front_squat':
      legsSquat(p, s * 0.95);
      if (ex === 'back_squat') { p.armL = [0.2, 0, -1.25]; p.armR = [0.2, 0, 1.25]; p.foreL = [-2.2, 0, 0]; p.foreR = [-2.2, 0, 0]; }
      else { p.armL = [-1.45, 0, -0.35]; p.armR = [-1.45, 0, 0.35]; p.foreL = [-1.9, 0, 0]; p.foreR = [-1.9, 0, 0]; }
      p.mouth = s > 0.85 ? 0.5 : 0.05;
      return;
    case 'goblet_squat':
      legsSquat(p, s * 0.9);
      p.armL = [-0.7, 0, -0.25]; p.armR = [-0.7, 0, 0.25]; p.foreL = [-2.2, 0, 0.3]; p.foreR = [-2.2, 0, -0.3];
      return;
    case 'overhead_press':
      p.armL = [-0.3 - s * 2.7, 0, -1.2 + s * 1.05]; p.armR = [-0.3 - s * 2.7, 0, 1.2 - s * 1.05];
      p.foreL = [-2.4 + s * 2.35, 0, 0]; p.foreR = [-2.4 + s * 2.35, 0, 0];
      p.spine = [-0.08 * s, 0, 0];
      return;
    case 'deadlift':
      hinge(p, lerp(1.0, 0, s), lerp(0.75, 0, s));
      p.mouth = s < 0.2 ? 0.45 : 0.05;
      return;
    case 'romanian_deadlift':
      hinge(p, lerp(1.1, 0.05, s), 0.18);
      return;
    case 'barbell_row':
      hinge(p, 0.95, 0.35);
      p.armL = [-0.95 + s * 0.85, 0, -0.15]; p.armR = [-0.95 + s * 0.85, 0, 0.15];
      p.foreL = [-s * 1.5, 0, 0]; p.foreR = [-s * 1.5, 0, 0];
      return;
    case 'rack_curl':
      p.armL = [-0.1, 0, -0.2]; p.armR = [-0.1, 0, 0.2];
      p.foreL = [-0.2 - 2.0 * s, 0, 0]; p.foreR = [-0.2 - 2.0 * s, 0, 0];
      p.spine = [-0.12 * s, 0, 0]; // the tell-tale lean back
      p.mouth = s > 0.8 ? 0.4 : 0.1;
      return;
    case 'db_curl': case 'hammer_curl':
      p.armL = [-0.1, 0, -0.12]; p.armR = [-0.1, 0, 0.12];
      p.foreL = [-0.2 - 2.0 * s, 0, 0]; p.foreR = [-0.2 - 2.0 * rep(t + 1.3, 2.6) * amp, 0, 0];
      return;
    case 'lateral_raise':
      p.armL = [-0.15, 0, -0.15 - 1.35 * s]; p.armR = [-0.15, 0, 0.15 + 1.35 * s];
      p.foreL = [-0.25, 0, 0]; p.foreR = [-0.25, 0, 0];
      return;
    case 'shrug':
      p.armL = [0, 0, -0.14]; p.armR = [0, 0, 0.14];
      p.hips[1] = HIP_Y + sFast * 0.03; p.head = [0.15 * sFast, 0, 0];
      return;
    case 'walking_lunge': {
      const k = rep(t, 3.2) * amp;
      p.thighL = [-1.35 * k, 0, -0.05]; p.shinL = [1.45 * k, 0, 0];
      p.thighR = [0.55 * k, 0, 0.05]; p.shinR = [1.5 * k, 0, 0];
      p.hips[1] = HIP_Y - 0.17 * k; p.spine = [-0.05, 0, 0];
      p.armL = [0, 0, -0.1]; p.armR = [0, 0, 0.1];
      return;
    }
    case 'lat_pulldown':
      seated(p, 0.43);
      p.armL = [-2.95 + s * 0.4, 0, -0.45 - s * 0.6]; p.armR = [-2.95 + s * 0.4, 0, 0.45 + s * 0.6];
      p.foreL = [-s * 1.7, 0, 0]; p.foreR = [-s * 1.7, 0, 0];
      p.spine = [-0.15, 0, 0];
      return;
    case 'seated_row':
      seated(p, 0.3);
      p.thighL = [-1.35, 0, -0.1]; p.thighR = [-1.35, 0, 0.1]; p.shinL = [0.7, 0, 0]; p.shinR = [0.7, 0, 0];
      p.armL = [-1.45 + s * 1.0, 0, -0.15]; p.armR = [-1.45 + s * 1.0, 0, 0.15];
      p.foreL = [-s * 1.6, 0, 0]; p.foreR = [-s * 1.6, 0, 0];
      p.spine = [0.25 - s * 0.35, 0, 0];
      return;
    case 'tricep_pushdown':
      p.spine = [0.2, 0, 0];
      p.armL = [-0.35, 0, -0.1]; p.armR = [-0.35, 0, 0.1];
      p.foreL = [-1.7 + s * 1.55, 0, 0]; p.foreR = [-1.7 + s * 1.55, 0, 0];
      return;
    case 'cable_fly':
      p.spine = [0.15, 0, 0];
      p.armL = [-1.25, 0, -1.2 + s * 1.05]; p.armR = [-1.25, 0, 1.2 - s * 1.05];
      p.foreL = [-0.3, 0, 0]; p.foreR = [-0.3, 0, 0];
      return;
    case 'face_pull':
      p.armL = [-1.6, 0, -0.2 - s * 0.7]; p.armR = [-1.6, 0, 0.2 + s * 0.7];
      p.foreL = [-s * 1.8, 0, 0]; p.foreR = [-s * 1.8, 0, 0];
      return;
    case 'pull_up': case 'hanging_leg_raise': {
      const up = ex === 'pull_up' ? s : 0;
      p.hips = [0, 1.02 + up * 0.24, 0];
      p.armL = [-PI + 0.05, 0, -0.3 - up * 0.55]; p.armR = [-PI + 0.05, 0, 0.3 + up * 0.55];
      p.foreL = [-up * 1.9, 0, 0]; p.foreR = [-up * 1.9, 0, 0];
      if (ex === 'hanging_leg_raise') { p.thighL = [-1.45 * s, 0, -0.05]; p.thighR = [-1.45 * s, 0, 0.05]; }
      else { p.thighL = [-0.2, 0, 0]; p.thighR = [-0.2, 0, 0]; p.shinL = [0.6, 0, 0]; p.shinR = [0.6, 0, 0]; }
      p.mouth = up > 0.8 ? 0.4 : 0.05;
      return;
    }
    case 'treadmill_run': case 'incline_walk': {
      const run = ex === 'treadmill_run';
      walkCycle(p, t, run ? 13 : 7.5, run ? 0.8 : 0.45);
      if (run) { p.foreL = [-1.5, 0, 0]; p.foreR = [-1.5, 0, 0]; p.spine = [0.18, 0, 0]; p.hips[1] += Math.abs(Math.sin(t * 13)) * 0.04; }
      p.hips[2] = 0.1;
      p.mouth = run ? 0.3 : 0.05; p.brows = run ? -0.3 : 0;
      return;
    }
    case 'bike_intervals': {
      const w = t * 9;
      p.hips = [0, 0.78, -0.22];
      p.spine = [0.55, 0, 0];
      p.thighL = [-1.15 + 0.38 * Math.sin(w), 0, -0.05]; p.thighR = [-1.15 + 0.38 * Math.sin(w + PI), 0, 0.05];
      p.shinL = [1.05 + 0.5 * Math.sin(w + 1.2), 0, 0]; p.shinR = [1.05 + 0.5 * Math.sin(w + 1.2 + PI), 0, 0];
      p.armL = [-1.5, 0, -0.15]; p.armR = [-1.5, 0, 0.15]; p.foreL = [-0.3, 0, 0]; p.foreR = [-0.3, 0, 0];
      p.mouth = 0.25;
      return;
    }
    case 'rowing': {
      const k = rep(t, 2.2) * amp; // 0 = catch, 1 = finish
      p.hips = [0, 0.2, lerp(0.05, -0.38, k)];
      p.thighL = [lerp(-2.2, -1.5, k), 0, -0.08]; p.thighR = [lerp(-2.2, -1.5, k), 0, 0.08];
      p.shinL = [lerp(2.1, 0.08, k), 0, 0]; p.shinR = [lerp(2.1, 0.08, k), 0, 0];
      p.spine = [lerp(0.4, -0.3, k), 0, 0];
      p.armL = [lerp(-1.6, -0.3, k), 0, -0.15]; p.armR = [lerp(-1.6, -0.3, k), 0, 0.15];
      p.foreL = [lerp(0, -1.7, k), 0, 0]; p.foreR = [lerp(0, -1.7, k), 0, 0];
      return;
    }
    case 'plank': case 'push_up': {
      const push = ex === 'push_up' ? s : 0;
      p.hipsRot = [PI / 2 - 0.12 - push * 0.08, 0, 0];
      p.hips = [0, ex === 'push_up' ? 0.22 + push * 0.13 : 0.2, -0.25];
      if (ex === 'push_up') {
        p.armL = [-PI / 2 + 0.1, 0, -0.35]; p.armR = [-PI / 2 + 0.1, 0, 0.35];
        p.foreL = [-(1 - push) * 1.3, 0, 0]; p.foreR = [-(1 - push) * 1.3, 0, 0];
      } else {
        p.armL = [-PI / 2 + 0.15, 0, -0.15]; p.armR = [-PI / 2 + 0.15, 0, 0.15];
        p.foreL = [-PI / 2, 0, 0]; p.foreR = [-PI / 2, 0, 0];
      }
      p.head = [-0.5, 0, 0];
      return;
    }
    case 'stretch': default: {
      // seated forward fold on the mat, reaching for the toes
      p.hips = [0, 0.13, -0.25];
      p.thighL = [-PI / 2, 0, -0.08]; p.thighR = [-PI / 2, 0, 0.08];
      p.spine = [0.45 + rep(t, 4) * 0.35 * amp, 0, 0];
      p.armL = [-1.35, 0, -0.1]; p.armR = [-1.35, 0, 0.1];
      p.foreL = [-0.1, 0, 0]; p.foreR = [-0.1, 0, 0];
      p.head = [0.2, 0, 0];
      p.brows = 0.2;
    }
  }
}

// ---------- everything else ----------

export function computePose(ctx: PoseContext): Pose {
  const p = basePose(ctx);
  if (ctx.carry) { p.armL = [-1.15, 0, -0.3]; p.armR = [-1.15, 0, 0.3]; p.foreL = [-0.55, 0, 0.2]; p.foreR = [-0.55, 0, -0.2]; }
  return p;
}

function basePose(ctx: PoseContext): Pose {
  const p = restPose();
  const { t, reduced } = ctx;
  const m = reduced ? 0.35 : 1;
  // blink every ~3.5 s
  p.blink = (t % 3.7) < 0.12 ? 0.15 : 1;

  switch (ctx.anim) {
    case 'walk':
      walkCycle(p, t, 9, 0.55 * (reduced ? 0.7 : 1));
      return p;
    case 'search':
      walkCycle(p, t, 7, 0.4);
      p.head = [0.1, Math.sin(t * 2.6) * 0.8 * m, 0];
      p.armR = [-2.4, 0, 0.5]; p.foreR = [-1.8, 0, 0]; // hand shading the eyes
      p.brows = 0.8; p.mouth = 0.15;
      return p;
    case 'lift': case 'cardio': case 'stretch':
      exercisePose(p, ctx.exercise ?? (ctx.anim === 'cardio' ? 'treadmill_run' : ctx.anim === 'stretch' ? 'stretch' : 'db_curl'), t, reduced);
      return p;
    case 'flex': {
      const k = Math.floor(t / 2.2) % 3;
      if (k === 0) { // front double biceps
        p.armL = [0, 0, -1.45]; p.armR = [0, 0, 1.45];
        p.foreL = [0, 0, -1.7 + Math.sin(t * 5) * 0.12 * m]; p.foreR = [0, 0, 1.7 - Math.sin(t * 5) * 0.12 * m];
      } else if (k === 1) { // most muscular
        p.spine = [0.3, 0, 0];
        p.armL = [-0.6, 0, -0.45]; p.armR = [-0.6, 0, 0.45];
        p.foreL = [-1.2, 0, 0.6]; p.foreR = [-1.2, 0, -0.6];
        p.thighL = [-0.15, 0, -0.15]; p.thighR = [0.05, 0, 0.15]; p.shinL = [0.3, 0, 0];
      } else { // side chest
        p.spine = [0, 0.5, 0]; p.head = [0, -0.5, 0];
        p.armL = [-0.9, 0.3, -0.3]; p.armR = [-0.5, 0, 0.2];
        p.foreL = [-1.5, 0, 0]; p.foreR = [-1.6, 0, 0];
        p.thighL = [-0.35, 0, 0]; p.shinL = [0.6, 0, 0];
      }
      p.hips[1] = HIP_Y - 0.01 + Math.sin(t * 4) * 0.008 * m;
      p.mouth = 0.55; p.brows = -0.3;
      return p;
    }
    case 'clap': {
      const c = Math.sin(t * 22) * m;
      p.armL = [-1.25, 0, -0.35 - c * 0.22]; p.armR = [-1.25, 0, 0.35 + c * 0.22];
      p.foreL = [-0.75, 0, 0.35]; p.foreR = [-0.75, 0, -0.35];
      p.mouth = 0.6; p.brows = 0.5;
      return p;
    }
    case 'celebrate': {
      const j = Math.abs(Math.sin(t * 8)) * m;
      p.hips[1] = HIP_Y + j * 0.15;
      p.armL = [-PI + 0.35, 0, -0.45]; p.armR = [-PI + 0.35, 0, 0.45];
      p.foreL = [-0.2, 0, 0]; p.foreR = [-0.2, 0, 0];
      p.thighL = [-j * 0.35, 0, -0.08]; p.thighR = [-j * 0.35, 0, 0.08]; p.shinL = [j * 0.7, 0, 0]; p.shinR = [j * 0.7, 0, 0];
      p.mouth = 1; p.brows = 0.9;
      return p;
    }
    case 'talk': {
      const g = Math.sin(t * 4.5);
      p.armR = [-0.55 + g * 0.25 * m, 0, 0.25]; p.foreR = [-1.2 + g * 0.3 * m, 0, 0];
      p.armL = [-0.15, 0, -0.1]; p.foreL = [-0.5, 0, 0];
      p.head = [Math.sin(t * 2) * 0.08 * m, Math.sin(t * 1.3) * 0.15 * m, 0];
      p.mouth = 0.15 + Math.abs(Math.sin(t * 11)) * 0.45;
      p.brows = Math.sin(t * 1.7) * 0.4;
      return p;
    }
    case 'build': {
      const hit = Math.sin(t * 12) * m;
      legsSquat(p, 0.55);
      p.spine = [0.55, 0, 0];
      p.armR = [-1.5 - hit * 0.6, 0, 0.2]; p.foreR = [-0.9, 0, 0];
      p.armL = [-1.1, 0, -0.25]; p.foreL = [-0.6, 0, 0];
      p.brows = -0.5;
      return p;
    }
    case 'powerUp': {
      const k = Math.min(1, (t % 3.2) / 1.2);
      legsSquat(p, 0.45 * (1 - k));
      p.hips[1] += k * 0.12;
      p.armL = [-0.1, 0, -0.35 - k * 0.65]; p.armR = [-0.1, 0, 0.35 + k * 0.65];
      p.foreL = [-1.4 * (1 - k), 0, 0]; p.foreR = [-1.4 * (1 - k), 0, 0];
      p.head = [-0.35 * k, 0, 0];
      p.mouth = 0.9 * k; p.brows = -0.8;
      return p;
    }
    case 'spot': {
      p.spine = [0.45, 0, 0];
      p.armL = [-1.25, 0, -0.25]; p.armR = [-1.25, 0, 0.25];
      p.foreL = [-0.5, 0, 0]; p.foreR = [-0.5, 0, 0];
      p.head = [0.35, 0, 0];
      p.thighL = [-0.25, 0, -0.1]; p.thighR = [-0.25, 0, 0.1]; p.shinL = [0.45, 0, 0]; p.shinR = [0.45, 0, 0];
      p.hips[1] = grounded(0.25, 0.45);
      p.mouth = 0.35; p.brows = 0.4;
      return p;
    }
    case 'hype': {
      const j = Math.abs(Math.sin(t * 10)) * m;
      p.spine = [0.35, 0, 0];
      p.armL = [-2.2 - j * 0.5, 0, -0.5]; p.armR = [-2.2 - j * 0.5, 0, 0.5];
      p.foreL = [-0.8, 0, 0]; p.foreR = [-0.8, 0, 0];
      p.hips[1] = HIP_Y + j * 0.06;
      p.mouth = 1; p.brows = 1;
      return p;
    }
    case 'fistBump':
      p.armR = [-1.45, 0, 0.1]; p.foreR = [-0.15, 0, 0];
      p.mouth = 0.5; p.brows = 0.5;
      return p;
    case 'dramatic':
      walkCycle(p, t, 5, 0.65);
      p.head = [-0.35, 0, 0];
      p.armL = [-PI + 0.6, 0, -0.3]; p.foreL = [-1.6, 0, 0]; // back of the hand to the forehead
      p.mouth = 0.1; p.brows = 0.9;
      return p;
    case 'pretend':
      // studying the ceiling with great interest
      p.head = [-0.6, 0.4, 0];
      p.armL = [0.25, 0, -0.1]; p.armR = [0.25, 0, 0.1];
      p.foreL = [-0.3, 0, 0]; p.foreR = [-0.3, 0, 0];
      p.mouth = 0.2; p.brows = 0.6;
      return p;
    case 'podium': {
      p.armL = [-PI + 0.2, 0, -0.3]; p.foreL = [-0.3, 0, 0];
      p.armR = [0.1, 0, 0.6]; p.foreR = [-1.6, 0, 0]; // hand on hip
      p.mouth = 0.8; p.brows = 0.6;
      return p;
    }
    case 'drink': {
      const sip = (t % 2.2) < 1.1 ? 1 : 0.35;
      p.armR = [-0.9 * sip - 0.3, 0, 0.35]; p.foreR = [-2.1 * sip, 0, -0.2];
      p.head = [-0.35 * sip, 0, 0];
      p.armL = [0.1, 0, -0.5]; p.foreL = [-1.5, 0, 0];
      p.mouth = 0.3 * sip;
      return p;
    }
    case 'mirrorCheck': {
      const k = Math.floor(t / 1.5) % 3;
      p.spine = [0, [0.35, -0.35, 0][k] * m, 0];
      p.head = [0, [-0.25, 0.25, 0][k], 0];
      if (k === 2) { p.armL = [0, 0, -1.45]; p.armR = [0, 0, 1.45]; p.foreL = [0, 0, -1.6]; p.foreR = [0, 0, 1.6]; p.mouth = 0.4; } // a quick, private flex
      else { p.armR = [-2.5, 0, 0.6]; p.foreR = [-1.9, 0, 0]; p.mouth = 0.15; } // fixing the hair
      p.brows = 0.3;
      return p;
    }
    case 'chalk': {
      const r = Math.sin(t * 14) * m;
      p.armL = [-0.85, 0, -0.1]; p.armR = [-0.85, 0, 0.1];
      p.foreL = [-1.05, 0, 0.45 + r * 0.15]; p.foreR = [-1.05, 0, -0.45 + r * 0.15];
      p.head = [0.3, 0, 0]; p.brows = -0.6;
      return p;
    }
    case 'phone':
      p.armR = [-0.4, 0, 0.1]; p.foreR = [-1.5, 0, -0.35];
      p.armL = [-0.3, 0, -0.1]; p.foreL = [-1.3, 0, 0.3];
      p.head = [0.5, 0, 0]; p.mouth = (t % 6) < 0.6 ? 0.5 : 0.05; // the occasional chuckle
      return p;
    case 'change': {
      const w = Math.sin(t * 5) * m;
      p.armL = [-2.5 + w * 0.2, 0, -0.35]; p.armR = [-2.5 - w * 0.2, 0, 0.35];
      p.foreL = [-1.4, 0, 0]; p.foreR = [-1.4, 0, 0];
      p.head = [0.35, 0, 0]; p.spine = [0.1, 0, w * 0.06];
      return p;
    }
    case 'nod':
      p.head = [Math.abs(Math.sin(t * 6)) * 0.35 * m, 0, 0];
      p.armL = [0.05, 0, -0.1]; p.armR = [0.05, 0, 0.1];
      p.mouth = 0.15; p.brows = 0.3;
      return p;
    case 'doubleTake': {
      const k = (t % 1.6) / 1.6; // look, away, SNAP back
      p.head = [-0.1, (k < 0.3 ? 0.5 : k < 0.55 ? -0.2 : 0.7) * m, 0];
      p.spine = [-0.08, 0.15, 0];
      p.mouth = k > 0.55 ? 0.7 : 0.1; p.brows = 1;
      return p;
    }
    case 'idle': default:
      return idlePose(p, ctx);
  }
}

function idlePose(p: Pose, ctx: PoseContext): Pose {
  const { t, variant, reduced } = ctx;
  const m = reduced ? 0.35 : 1;
  p.hips[1] = HIP_Y - 0.004 + Math.sin(t * 1.6) * 0.006 * m;
  p.spine = [Math.sin(t * 1.6) * 0.015 * m, 0, 0];
  if (ctx.resting && (ctx.stationType === 'bench' || ctx.stationType === 'cable')) {
    seated(p, ctx.stationType === 'bench' ? 0.43 : 0.4);
    p.spine = [0.25, 0, 0];
    p.armL = [-0.6, 0, -0.1]; p.armR = [-0.6, 0, 0.1]; p.foreL = [-0.7, 0, 0]; p.foreR = [-0.7, 0, 0];
    p.head = [0.15, Math.sin(t * 0.5) * 0.3 * m, 0];
    return p;
  }
  // a member drifts between a few idle habits
  const k = Math.floor(t / 7 + variant * 4) % 4;
  switch (k) {
    case 0: // hands on hips
      p.armL = [0.1, 0, -0.55]; p.armR = [0.1, 0, 0.55]; p.foreL = [-1.5, 0, 0]; p.foreR = [-1.5, 0, 0];
      break;
    case 1: // arms crossed
      p.armL = [-0.55, 0, -0.1]; p.armR = [-0.6, 0, 0.1]; p.foreL = [-1.6, 0, 0.9]; p.foreR = [-1.6, 0, -0.9];
      break;
    case 2: // phone scrolling
      p.armR = [-0.4, 0, 0.1]; p.foreR = [-1.5, 0, -0.35];
      p.head = [0.45, 0, 0];
      break;
    default: // shoulder stretch
      p.armL = [-1.3, 0, 0.6]; p.foreL = [-0.1, 0, 0];
      p.armR = [-1.2, 0, 0.3]; p.foreR = [-1.8, 0, 0];
      break;
  }
  return p;
}

export function propForPose(ctx: PoseContext): Prop {
  if (ctx.anim === 'lift') return propFor(ctx.exercise);
  if (ctx.anim === 'drink') return 'bottle';
  if (ctx.anim === 'phone') return 'phone';
  if (ctx.anim === 'chalk') return 'chalk';
  if (ctx.carry) return 'plank';
  if (ctx.anim === 'idle' && !ctx.resting && Math.floor(ctx.t / 7 + ctx.variant * 4) % 4 === 2) return 'phone';
  return 'none';
}

/** Smoothly move `cur` towards `target` (in place). */
export function blendPose(cur: Pose, target: Pose, k: number): void {
  for (const key of Object.keys(target) as (keyof Pose)[]) {
    const tv = target[key];
    if (typeof tv === 'number') (cur as unknown as Record<string, number>)[key] += (tv - (cur[key] as number)) * k;
    else { const c = cur[key] as V3; c[0] += (tv[0] - c[0]) * k; c[1] += (tv[1] - c[1]) * k; c[2] += (tv[2] - c[2]) * k; }
  }
}

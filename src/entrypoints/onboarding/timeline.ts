import { type Accessor, createMemo, createSignal, onCleanup } from "solid-js";

type Act = readonly [target: string, at: number];

export type Step<StepId extends string> = {
  stepId: StepId;
  durationMs: number;
  cursor?: readonly Act[];
  tap?: readonly Act[];
};

type Ripple = { rippleId: number; x: number; y: number; };

export type Playback = {
  target: (name: string) => (element: HTMLElement) => void;
  setRoot: (element: HTMLElement) => void;
  pointer: Accessor<{ x: number; y: number; isVisible: boolean; isClicking: boolean; }>;
  ripples: Accessor<Ripple[]>;
  isPaused: Accessor<boolean>;
  isReduced: Accessor<boolean>;
  togglePaused: () => void;
};

export type Timeline<StepId extends string> = Playback & {
  is: (...stepIds: StepId[]) => boolean;
  within: (fromStepId: StepId, toStepId: StepId) => boolean;
  jump: (stepId: StepId, stillStepId: StepId) => void;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const pressMs = 220;
const travelMs = 700;

export const createTimeline = <StepId extends string>(steps: readonly Step<StepId>[], initialStillStepId: StepId, rest: { x: number; y: number; }): Timeline<StepId> => {
  const motion = matchMedia(REDUCED_MOTION_QUERY);
  const order = new Map(steps.map((step, index) => [step.stepId, index]));
  const totalMs = steps.reduce((sum, step) => sum + step.durationMs, 0);
  const targets = new Map<string, HTMLElement>();
  const [stillStepId, setStillStepId] = createSignal(initialStillStepId);
  const [playingIndex, setPlayingIndex] = createSignal(order.get(initialStillStepId) ?? 0);
  const [isVisible, setVisible] = createSignal(false);
  const [isReduced, setReduced] = createSignal(motion.matches);
  const [isPaused, setPaused] = createSignal(false);
  const [pointer, setPointer] = createSignal({ ...rest, isVisible: false, isClicking: false });
  const [ripples, setRipples] = createSignal<Ripple[]>([]);
  const index = createMemo(() => (isReduced() ? order.get(stillStepId()) ?? 0 : playingIndex()));
  let root: HTMLElement | undefined;
  let elapsedMs = 0;
  let previousMs = -1;
  let lastFrameMs = 0;
  let frame = 0;
  let moved = new Set<number>();
  let rippleCount = 0;

  const centerOf = (element: HTMLElement) => {
    if (!root) return { x: 0, y: 0 };

    const outer = root.getBoundingClientRect();
    const inner = element.getBoundingClientRect();
    const scale = outer.width / root.offsetWidth || 1;

    return {
      x: (inner.left - outer.left + inner.width * 0.55) / scale,
      y: (inner.top - outer.top + inner.height * 0.6) / scale,
    };
  };

  const press = (name: string, isTap: boolean) => {
    const element = targets.get(name);

    if (!element) return;

    element.dataset["pressed"] = "";
    setTimeout(() => delete element.dataset["pressed"], pressMs);

    if (!isTap) {
      setPointer(previous => ({ ...previous, isClicking: true }));
      setTimeout(() => setPointer(previous => ({ ...previous, isClicking: false })), pressMs);

      return;
    }

    rippleCount += 1;
    const ripple = { rippleId: rippleCount, ...centerOf(element) };

    setRipples(previous => [...previous, ripple]);
    setTimeout(() => setRipples(previous => previous.filter(entry => entry.rippleId !== ripple.rippleId)), 700);
  };

  const enter = (next: number) => {
    setPlayingIndex(next);
    previousMs = -1;
    moved = new Set();
    setPointer(previous => ({ ...previous, ...(next === 0 && rest), isVisible: (steps[next]?.cursor ?? []).length > 0 }));
  };

  const tick = (nowMs: number) => {
    elapsedMs = (elapsedMs + Math.min(nowMs - lastFrameMs, 100)) % totalMs;
    lastFrameMs = nowMs;

    let restMs = elapsedMs;
    let next = 0;

    for (const step of steps) {
      if (restMs < step.durationMs) break;

      restMs -= step.durationMs;
      next += 1;
    }

    const step = steps[next];

    if (!step) return;

    if (next !== playingIndex()) enter(next);

    const cursorActs = (step.cursor ?? []).entries();
    const tapActs = step.tap ?? [];

    for (const [actIndex, [name, at]] of cursorActs) {
      const atMs = at * step.durationMs;
      const element = targets.get(name);

      if (element && !moved.has(actIndex) && restMs >= Math.max(0, atMs - travelMs)) {
        moved.add(actIndex);
        setPointer(previous => ({ ...previous, ...centerOf(element), isVisible: true }));
      }

      if (previousMs < atMs && restMs >= atMs) press(name, false);
    }

    for (const [name, at] of tapActs) {
      const atMs = at * step.durationMs;

      if (previousMs < atMs && restMs >= atMs) press(name, true);
    }

    previousMs = restMs;
  };

  const loop = (nowMs: number) => {
    tick(nowMs);
    frame = requestAnimationFrame(loop);
  };

  const sync = () => {
    cancelAnimationFrame(frame);

    if (isReduced() || isPaused() || !isVisible()) return;

    lastFrameMs = performance.now();
    frame = requestAnimationFrame(loop);
  };

  const onMotion = () => {
    setReduced(motion.matches);
    sync();
  };

  motion.addEventListener("change", onMotion);

  const observer = new IntersectionObserver(([entry]) => {
    setVisible(entry?.isIntersecting ?? false);
    sync();
  });

  onCleanup(() => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    motion.removeEventListener("change", onMotion);
  });

  const at = (stepId: StepId) => order.get(stepId) ?? -1;

  return {
    is: (...stepIds) => stepIds.some(stepId => at(stepId) === index()),
    within: (fromStepId, toStepId) => index() >= at(fromStepId) && index() <= at(toStepId),
    target: name => (element) => {
      targets.set(name, element);
    },
    setRoot: (element) => {
      root = element;
      observer.observe(element);
    },
    pointer: () => ({ ...pointer(), isVisible: pointer().isVisible && !isReduced() }),
    ripples,
    isPaused,
    isReduced,
    togglePaused: () => {
      setPaused(!isPaused());
      sync();
    },
    jump: (stepId, stillStepId) => {
      setStillStepId(() => stillStepId);
      elapsedMs = steps.slice(0, at(stepId)).reduce((sum, step) => sum + step.durationMs, 0);
      enter(at(stepId));
    },
  };
};

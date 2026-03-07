import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Popover, Text, Button, Group } from '@mantine/core';
import type { TourStep } from './tourConfig';

/* ─── Context ─── */

type TourContextValue = {
  active: boolean;
  step: number;
  currentStep: TourStep | null;
  totalSteps: number;
  start: () => void;
  next: () => void;
  prev: () => void;
  finish: () => void;
  goTo: (step: number) => void;
};

const TourContext = createContext<TourContextValue>({
  active: false,
  step: 0,
  currentStep: null,
  totalSteps: 0,
  start: () => {},
  next: () => {},
  prev: () => {},
  finish: () => {},
  goTo: () => {}
});

export function useTour() {
  return useContext(TourContext);
}

/* ─── Provider ─── */

type TourProviderProps = {
  steps: TourStep[];
  children: ReactNode;
};

export function TourProvider({ steps, children }: TourProviderProps) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);

  const currentStep = useMemo(() => (active ? steps[step] ?? null : null), [active, step, steps]);

  const start = useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStep(prev => {
      const nextStep = prev + 1;
      if (nextStep >= steps.length) {
        setActive(false);
        return 0;
      }
      return nextStep;
    });
  }, [steps.length]);

  const prev = useCallback(() => {
    setStep(prev => Math.max(0, prev - 1));
  }, []);

  const finish = useCallback(() => {
    setActive(false);
    setStep(0);
  }, []);

  const goTo = useCallback(
    (target: number) => {
      if (target >= 0 && target < steps.length) {
        setStep(target);
        if (!active) setActive(true);
      }
    },
    [active, steps.length]
  );

  const value = useMemo<TourContextValue>(
    () => ({ active, step, currentStep, totalSteps: steps.length, start, next, prev, finish, goTo }),
    [active, step, currentStep, steps.length, start, next, prev, finish, goTo]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

/* ─── Popover Wrapper ─── */

type TourPopoverProps = {
  /** The step index this popover should appear on */
  stepIndex: number;
  /** Popover position */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';
  /** The trigger element */
  children: ReactNode;
};

export function TourPopover({ stepIndex, position = 'bottom-end', children }: TourPopoverProps) {
  const tour = useTour();
  const isVisible = tour.active && tour.step === stepIndex;
  const stepConfig = tour.active ? tour.currentStep : null;
  const isLast = stepIndex === tour.totalSteps - 1;

  return (
    <Popover opened={isVisible} position={position} withArrow shadow="md" width={280}>
      <Popover.Target>
        <div>{children}</div>
      </Popover.Target>
      <Popover.Dropdown>
        {stepConfig ? (
          <div className="space-y-3">
            <div>
              <Text size="sm" fw={600} className="text-slate-700 dark:text-slate-300">
                {stepConfig.title}
              </Text>
              {stepConfig.description ? (
                <Text size="sm" c="dimmed" className="mt-1">
                  {stepConfig.description}
                </Text>
              ) : null}
            </div>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {stepIndex + 1} / {tour.totalSteps}
              </Text>
              <Group gap="xs">
                {stepIndex > 0 ? (
                  <Button size="xs" variant="subtle" onClick={tour.prev}>
                    上一步
                  </Button>
                ) : null}
                {isLast ? (
                  <Button size="xs" onClick={tour.finish}>
                    完成
                  </Button>
                ) : (
                  <Button size="xs" onClick={tour.next}>
                    下一步
                  </Button>
                )}
                <Button size="xs" variant="subtle" color="gray" onClick={tour.finish}>
                  跳过
                </Button>
              </Group>
            </Group>
          </div>
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}

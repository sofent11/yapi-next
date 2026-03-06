import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useUpdateStudyMutation } from '../services/yapi-api';

type GuideContextValue = {
  active: boolean;
  step: number;
  next: () => void;
  finish: () => void;
};

const GUIDE_MAX_STEP = 3;
const GUIDE_STORAGE_PREFIX = 'yapi_legacy_study_tip';

const GuideContext = createContext<GuideContextValue>({
  active: false,
  step: -1,
  next: () => undefined,
  finish: () => undefined
});

function buildStorageKey(uid: number): string {
  return `${GUIDE_STORAGE_PREFIX}:${uid > 0 ? uid : 'guest'}`;
}

function readGuideStep(uid: number, study: boolean): number {
  if (study) return -1;
  try {
    const key = buildStorageKey(uid);
    const raw = window.localStorage.getItem(key);
    if (raw == null || raw === '') return 0;
    const value = Number(raw);
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return -1;
    if (value > GUIDE_MAX_STEP) return GUIDE_MAX_STEP;
    return value;
  } catch (_err) {
    return 0;
  }
}

function persistGuideStep(uid: number, step: number) {
  try {
    window.localStorage.setItem(buildStorageKey(uid), String(step));
  } catch (_err) {
    // Ignore localStorage write failures to avoid blocking main flow.
  }
}

type GuideProviderProps = {
  uid: number;
  study: boolean;
  children: ReactNode;
};

export function GuideProvider(props: GuideProviderProps) {
  const [step, setStep] = useState<number>(() => readGuideStep(props.uid, props.study));
  const [updateStudy] = useUpdateStudyMutation();

  const syncStudy = useCallback(() => {
    void updateStudy()
      .unwrap()
      .then(response => {
        if (response.errcode === 0) return;
        // eslint-disable-next-line no-console
        console.error('[guide] sync study rejected by server', response.errmsg || response.errcode);
      })
      .catch(error => {
        // Keep guide flow non-blocking while avoiding unhandled promise rejection.
        // eslint-disable-next-line no-console
        console.error('[guide] sync study failed', error);
      });
  }, [updateStudy]);

  useEffect(() => {
    setStep(readGuideStep(props.uid, props.study));
  }, [props.study, props.uid]);

  const finish = useCallback(() => {
    persistGuideStep(props.uid, -1);
    setStep(-1);
    syncStudy();
  }, [props.uid, syncStudy]);

  const next = useCallback(() => {
    setStep(prev => {
      if (prev < 0) return prev;
      const nextStep = prev + 1;
      if (nextStep > GUIDE_MAX_STEP) {
        persistGuideStep(props.uid, -1);
        syncStudy();
        return -1;
      }
      persistGuideStep(props.uid, nextStep);
      return nextStep;
    });
  }, [props.uid, syncStudy]);

  const value = useMemo<GuideContextValue>(
    () => ({
      active: !props.study && step >= 0,
      step,
      next,
      finish
    }),
    [finish, next, props.study, step]
  );

  return <GuideContext.Provider value={value}>{props.children}</GuideContext.Provider>;
}

export function useGuide() {
  return useContext(GuideContext);
}

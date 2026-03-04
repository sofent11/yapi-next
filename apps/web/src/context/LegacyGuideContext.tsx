import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type LegacyGuideContextValue = {
  active: boolean;
  step: number;
  next: () => void;
  finish: () => void;
};

const LEGACY_GUIDE_MAX_STEP = 3;
const LEGACY_GUIDE_STORAGE_PREFIX = 'yapi_legacy_study_tip';

const LegacyGuideContext = createContext<LegacyGuideContextValue>({
  active: false,
  step: -1,
  next: () => undefined,
  finish: () => undefined
});

function buildStorageKey(uid: number): string {
  return `${LEGACY_GUIDE_STORAGE_PREFIX}:${uid > 0 ? uid : 'guest'}`;
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
    if (value > LEGACY_GUIDE_MAX_STEP) return LEGACY_GUIDE_MAX_STEP;
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

type LegacyGuideProviderProps = {
  uid: number;
  study: boolean;
  children: ReactNode;
};

export function LegacyGuideProvider(props: LegacyGuideProviderProps) {
  const [step, setStep] = useState<number>(() => readGuideStep(props.uid, props.study));

  useEffect(() => {
    setStep(readGuideStep(props.uid, props.study));
  }, [props.study, props.uid]);

  const finish = useCallback(() => {
    persistGuideStep(props.uid, -1);
    setStep(-1);
    void fetch('/api/user/up_study', {
      method: 'GET',
      credentials: 'include'
    });
  }, [props.uid]);

  const next = useCallback(() => {
    setStep(prev => {
      if (prev < 0) return prev;
      const nextStep = prev + 1;
      if (nextStep > LEGACY_GUIDE_MAX_STEP) {
        persistGuideStep(props.uid, -1);
        void fetch('/api/user/up_study', {
          method: 'GET',
          credentials: 'include'
        });
        return -1;
      }
      persistGuideStep(props.uid, nextStep);
      return nextStep;
    });
  }, [props.uid]);

  const value = useMemo<LegacyGuideContextValue>(
    () => ({
      active: !props.study && step >= 0,
      step,
      next,
      finish
    }),
    [finish, next, props.study, step]
  );

  return <LegacyGuideContext.Provider value={value}>{props.children}</LegacyGuideContext.Provider>;
}

export function useLegacyGuide() {
  return useContext(LegacyGuideContext);
}


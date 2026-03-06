import { useCallback, useEffect, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';

type UseProjectInterfaceNavigationGuardParams = {
  dirty: boolean;
  navigate: NavigateFunction;
  setTab: (next: string) => void;
  tab: string;
};

export function useProjectInterfaceNavigationGuard({
  dirty,
  navigate,
  setTab,
  tab
}: UseProjectInterfaceNavigationGuardParams) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [nextTab, setNextTab] = useState<string | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const popstateForwardingRef = useRef(false);

  const cancelNavigation = useCallback(() => {
    setConfirmOpen(false);
    setNextTab(null);
    setPendingPath(null);
  }, []);

  const confirmNavigation = useCallback(() => {
    if (nextTab) {
      setTab(nextTab);
    }
    if (pendingPath) {
      navigate(pendingPath);
    }
    setConfirmOpen(false);
    setNextTab(null);
    setPendingPath(null);
  }, [navigate, nextTab, pendingPath, setTab]);

  const handleSwitch = useCallback(
    (next: string) => {
      if (tab === 'edit' && dirty) {
        setNextTab(next);
        setPendingPath(null);
        setConfirmOpen(true);
        return;
      }
      setTab(next);
    },
    [dirty, setTab, tab]
  );

  const navigateWithGuard = useCallback(
    (path: string, replace?: boolean) => {
      if (tab === 'edit' && dirty) {
        setNextTab(null);
        setPendingPath(path);
        setConfirmOpen(true);
        return;
      }
      navigate(path, replace ? { replace: true } : undefined);
    },
    [dirty, navigate, tab]
  );

  useEffect(() => {
    if (tab !== 'edit' || !dirty) return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, tab]);

  useEffect(() => {
    if (tab !== 'edit' || !dirty || confirmOpen) return;

    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      let nextPath = '';
      try {
        const nextUrl = new URL(href, window.location.href);
        if (nextUrl.origin !== window.location.origin) return;
        nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      } catch (_err) {
        return;
      }

      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextPath === currentPath) return;

      event.preventDefault();
      event.stopPropagation();
      setNextTab(null);
      setPendingPath(nextPath);
      setConfirmOpen(true);
    };

    const onPopState = () => {
      if (popstateForwardingRef.current) {
        popstateForwardingRef.current = false;
        return;
      }

      const targetPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      popstateForwardingRef.current = true;
      window.history.forward();
      window.setTimeout(() => {
        popstateForwardingRef.current = false;
      }, 300);
      setNextTab(null);
      setPendingPath(targetPath);
      setConfirmOpen(true);
    };

    document.addEventListener('click', onClickCapture, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, [confirmOpen, dirty, tab]);

  return {
    cancelNavigation,
    confirmNavigation,
    confirmOpen,
    handleSwitch,
    navigateWithGuard
  };
}

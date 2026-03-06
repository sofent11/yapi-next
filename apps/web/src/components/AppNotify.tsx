import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@mantine/core';

type AppNotifyProps = {
  enabled?: boolean;
};

type VersionResponse = {
  data?: string[];
};

const VERSION_SOURCE =
  'https://www.fastmock.site/mock/1529fa78fa4c4880ad153d115084a940/yapi/versions';

export function AppNotify(props: AppNotifyProps) {
  const [latestVersion, setLatestVersion] = useState('');
  const currentVersion = useMemo(() => String(__APP_VERSION__ || '').trim(), []);

  useEffect(() => {
    if (!props.enabled) return;
    let canceled = false;

    async function loadVersion() {
      try {
        const response = await fetch(VERSION_SOURCE, {
          method: 'GET',
          credentials: 'omit'
        });
        if (!response.ok) return;
        const payload = (await response.json()) as VersionResponse;
        const nextVersion = String(payload?.data?.[0] || '').trim();
        if (!canceled && nextVersion) {
          setLatestVersion(nextVersion);
        }
      } catch (_err) {
        // Keep silent: version notify should not影响主流程。
      }
    }

    void loadVersion();
    return () => {
      canceled = true;
    };
  }, [props.enabled]);

  if (!props.enabled || !currentVersion || !latestVersion || latestVersion === currentVersion) {
    return null;
  }

  return (
    <Alert
      variant="light"
      color="blue"
      withCloseButton
      className="mx-auto mt-4 w-full max-w-[1600px]"
      title="版本提示"
    >
      <div>
        当前版本是：{currentVersion}&nbsp;&nbsp;可升级到：{latestVersion}&nbsp;&nbsp;&nbsp;
        <a
          target="_blank"
          rel="noreferrer"
          href="https://github.com/YMFE/yapi/blob/master/CHANGELOG.md"
          className="underline underline-offset-2"
        >
          版本详情
        </a>
      </div>
    </Alert>
  );
}

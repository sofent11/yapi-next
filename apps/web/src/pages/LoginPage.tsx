import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  PasswordInput,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAt, IconLock, IconUser } from '@tabler/icons-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGetUserStatusQuery, useLoginMutation, useRegisterUserMutation } from '../services/yapi-api';
import LogoSVG from '../components/LogoSVG';
import { webPlugins } from '../plugins';
import { safeApiRequest } from '../utils/safe-request';

type LoginFormValues = {
  email: string;
  password: string;
};

type RegisterFormValues = {
  email: string;
  password: string;
  username: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRedirect(target: string | null): string {
  if (!target || !target.startsWith('/')) return '/group';
  if (target.startsWith('/login')) return '/group';
  return target;
}

function showError(message: string) {
  notifications.show({
    color: 'red',
    title: '请求失败',
    message
  });
}

function showSuccess(message: string) {
  notifications.show({
    color: 'teal',
    title: '操作成功',
    message
  });
}

function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return '请输入邮箱!';
  if (!EMAIL_PATTERN.test(value)) return '请输入正确的邮箱地址!';
  return null;
}

function buildLoginErrors(values: LoginFormValues) {
  return {
    email: validateEmail(values.email),
    password: values.password ? null : '请输入密码!'
  };
}

function buildRegisterErrors(values: RegisterFormValues) {
  return {
    username: values.username.trim() ? null : '请输入用户名!',
    email: validateEmail(values.email),
    password: values.password ? null : '请输入密码!'
  };
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = useMemo(() => normalizeRedirect(searchParams.get('redirect')), [searchParams]);

  const statusQuery = useGetUserStatusQuery();
  const canRegister = statusQuery.data?.canRegister !== false;

  const [login, loginState] = useLoginMutation();
  const [registerUser, registerState] = useRegisterUserMutation();
  const [activeKey, setActiveKey] = useState<string>('login');
  const [loginValues, setLoginValues] = useState<LoginFormValues>({ email: '', password: '' });
  const [registerValues, setRegisterValues] = useState<RegisterFormValues>({
    email: '',
    password: '',
    username: ''
  });
  const [loginErrors, setLoginErrors] = useState<Record<keyof LoginFormValues, string | null>>({
    email: null,
    password: null
  });
  const [registerErrors, setRegisterErrors] = useState<Record<keyof RegisterFormValues, string | null>>({
    email: null,
    password: null,
    username: null
  });

  const ThirdLogin = webPlugins.getThirdLoginComponent() as React.ComponentType | null;
  const callApi = useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: showError }),
    []
  );

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = buildLoginErrors(loginValues);
    setLoginErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const response = await callApi(
      login({
        email: loginValues.email.trim(),
        password: loginValues.password
      }).unwrap(),
      '登录失败'
    );
    if (!response) return;
    showSuccess('登录成功');
    navigate(redirectTarget, { replace: true });
  }

  async function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = buildRegisterErrors(registerValues);
    setRegisterErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const response = await callApi(
      registerUser({
        email: registerValues.email.trim(),
        password: registerValues.password,
        username: registerValues.username.trim() || undefined
      }).unwrap(),
      '注册失败'
    );
    if (!response) return;
    showSuccess('注册成功');
    navigate(redirectTarget, { replace: true });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),transparent_28%),radial-gradient(circle_at_20%_20%,_rgba(34,197,94,0.14),transparent_24%),linear-gradient(160deg,_#020617_0%,_#0f172a_52%,_#172554_100%)]" />
      <div className="absolute left-[-8rem] top-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute bottom-0 right-[-8rem] h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-10 md:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_460px] lg:items-center">
          <div className="space-y-8 text-slate-50">
            <Group gap="md" wrap="nowrap">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-900 shadow-[0_18px_44px_rgba(255,255,255,0.16)]">
                <LogoSVG length="34px" />
              </div>
              <div>
                <Text className="text-xl font-semibold tracking-[0.18em] uppercase text-white">YApi</Text>
                <Text className="text-sm text-slate-300">API workspace for collaborative teams</Text>
              </div>
            </Group>

            <div className="space-y-4">
              <Badge size="lg" radius="xl" color="teal" variant="light">
                Sign in
              </Badge>
              <Title className="max-w-2xl text-4xl font-semibold leading-tight text-white md:text-6xl">
                把接口设计、调试和协作放回同一个工作台
              </Title>
              <Text className="max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
                登录后即可进入分组、项目与接口工作区。现有插件入口和第三方登录扩展保持可用，
                不需要额外切换域名或环境地址。
              </Text>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['统一规范', '接口定义、测试和导入导出保持同一语义'],
                ['可扩展', '第三方登录和插件页继续走既有扩展点'],
                ['零额外配置', '默认仍通过 /api 代理连接服务端']
              ].map(([title, body]) => (
                <div key={title} className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                  <Text className="text-sm font-semibold text-white">{title}</Text>
                  <Text className="mt-2 text-sm leading-6 text-slate-300">{body}</Text>
                </div>
              ))}
            </div>
          </div>

          <Card
            radius="xl"
            padding="xl"
            className="border border-white/10 bg-white/[0.08] shadow-[0_30px_90px_rgba(15,23,42,0.45)] backdrop-blur"
          >
            <Stack gap="lg">
              <div className="space-y-2 text-center">
                <Title order={2} className="text-white">
                  进入 YApi Next
                </Title>
                <Text className="text-sm leading-7 text-slate-300">
                  使用站内账号登录，或通过已注册的第三方登录插件继续。
                </Text>
              </div>

              <Tabs
                value={activeKey}
                onChange={value => setActiveKey(value || 'login')}
                color="blue"
                radius="xl"
                variant="outline"
              >
                <Tabs.List grow>
                  <Tabs.Tab value="login">登录</Tabs.Tab>
                  <Tabs.Tab value="register">注册</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="login" pt="lg">
                  <form className="space-y-4" onSubmit={handleLoginSubmit}>
                    <TextInput
                      label="邮箱"
                      value={loginValues.email}
                      onChange={event => {
                        const email = event.currentTarget.value;
                        setLoginValues(current => ({ ...current, email }));
                        setLoginErrors(current => ({ ...current, email: null }));
                      }}
                      leftSection={<IconAt size={16} />}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="例如：name@example.com"
                      error={loginErrors.email}
                    />
                    <PasswordInput
                      label="密码"
                      value={loginValues.password}
                      onChange={event => {
                        const password = event.currentTarget.value;
                        setLoginValues(current => ({ ...current, password }));
                        setLoginErrors(current => ({ ...current, password: null }));
                      }}
                      leftSection={<IconLock size={16} />}
                      autoComplete="current-password"
                      placeholder="请输入登录密码"
                      error={loginErrors.password}
                    />
                    <Button type="submit" fullWidth radius="xl" size="md" loading={loginState.isLoading}>
                      登录
                    </Button>
                  </form>

                  {ThirdLogin ? (
                    <div className="mt-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-white/10" />
                        <Text className="text-xs uppercase tracking-[0.18em] text-slate-400">或</Text>
                        <div className="h-px flex-1 bg-white/10" />
                      </div>
                      <div className="flex justify-center">
                        <ThirdLogin />
                      </div>
                    </div>
                  ) : null}
                </Tabs.Panel>

                <Tabs.Panel value="register" pt="lg">
                  {canRegister ? (
                    <form className="space-y-4" onSubmit={handleRegisterSubmit}>
                      <TextInput
                        label="用户名"
                        value={registerValues.username}
                        onChange={event => {
                          const username = event.currentTarget.value;
                          setRegisterValues(current => ({ ...current, username }));
                          setRegisterErrors(current => ({ ...current, username: null }));
                        }}
                        leftSection={<IconUser size={16} />}
                        autoComplete="username"
                        placeholder="例如：zhangsan"
                        error={registerErrors.username}
                      />
                      <TextInput
                        label="邮箱"
                        value={registerValues.email}
                        onChange={event => {
                          const email = event.currentTarget.value;
                          setRegisterValues(current => ({ ...current, email }));
                          setRegisterErrors(current => ({ ...current, email: null }));
                        }}
                        leftSection={<IconAt size={16} />}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="例如：name@example.com"
                        error={registerErrors.email}
                      />
                      <PasswordInput
                        label="密码"
                        value={registerValues.password}
                        onChange={event => {
                          const password = event.currentTarget.value;
                          setRegisterValues(current => ({ ...current, password }));
                          setRegisterErrors(current => ({ ...current, password: null }));
                        }}
                        leftSection={<IconLock size={16} />}
                        autoComplete="new-password"
                        placeholder="请设置登录密码"
                        error={registerErrors.password}
                      />
                      <Button type="submit" fullWidth radius="xl" size="md" loading={registerState.isLoading}>
                        注册
                      </Button>
                    </form>
                  ) : (
                    <Alert radius="lg" color="yellow" title="注册已关闭">
                      管理员已禁止注册，请联系管理员。
                    </Alert>
                  )}
                </Tabs.Panel>
              </Tabs>

              <Text className="text-center text-xs leading-6 text-slate-400">
                登录即表示你将继续使用当前实例配置。
                <Anchor
                  href="https://hellosean1025.github.io/yapi"
                  target="_blank"
                  rel="noopener noreferrer"
                  inherit
                  className="ml-1 text-blue-300"
                >
                  查看使用文档
                </Anchor>
              </Text>
            </Stack>
          </Card>
        </div>
      </div>
    </div>
  );
}

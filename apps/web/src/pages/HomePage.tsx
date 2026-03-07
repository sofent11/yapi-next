import { useEffect, useMemo, type ComponentType } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title
} from '@mantine/core';
import {
  IconApi,
  IconApps,
  IconDatabase,
  IconRocket,
  IconShieldCheck,
  IconUsersGroup
} from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import LogoSVG from '../components/LogoSVG';
import { webPlugins } from '../plugins';
import { useGetUserStatusQuery } from '../services/yapi-api';
import { PublicShell } from '../app/shells/PublicShell';

const featureCards = [
  {
    icon: IconApps,
    title: '项目协作',
    desc: '按分组管理项目、成员和权限，保证多人协作边界清晰。'
  },
  {
    icon: IconApi,
    title: '接口生命周期',
    desc: '统一管理接口设计、编辑、测试、变更和状态追踪。'
  },
  {
    icon: IconDatabase,
    title: '规范导入导出',
    desc: '支持 OpenAPI/Swagger 导入导出，适配存量系统迁移。'
  },
  {
    icon: IconUsersGroup,
    title: '团队效率',
    desc: '分类、标签、测试集合和日志让跨角色协作更高效。'
  }
] as const;

const valueHighlights = [
  {
    title: '规范驱动',
    content: '通过统一的接口规范和结构化文档，降低沟通与交接成本。',
    icon: IconShieldCheck
  },
  {
    title: '快速交付',
    content: '从定义到调试到回归测试形成闭环，减少重复劳动。',
    icon: IconRocket
  }
] as const;

const productSignals = [
  '统一接口设计、调试、Mock 与测试链路',
  '支持 OpenAPI/Swagger 导入导出与兼容迁移',
  '适合中后台团队持续协作与规范治理'
] as const;

const coreCapabilities = [
  '项目与分组权限管理',
  '接口预览 / 编辑 / 运行三态工作流',
  '测试集合、自动测试和报告查看',
  'OpenAPI 导入导出与回归支持'
] as const;

export function HomePage() {
  const navigate = useNavigate();
  const ThirdLogin = useMemo(() => webPlugins.getThirdLoginComponent() as ComponentType | null, []);
  const { data: statusData } = useGetUserStatusQuery();
  const user = statusData?.data;
  const isLogin = statusData?.errcode === 0 && !!user;

  useEffect(() => {
    if (isLogin) {
      navigate('/group', { replace: true });
    }
  }, [isLogin, navigate]);

  return (
    <PublicShell
      backdrop={
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_32%),radial-gradient(circle_at_80%_10%,_rgba(59,130,246,0.2),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_42%,_#111827_100%)]" />
          <div className="absolute inset-x-0 top-0 h-80 bg-[linear-gradient(180deg,rgba(15,23,42,0.1),rgba(15,23,42,0))]" />
        </>
      }
      containerClassName="py-6 md:py-8"
    >
      <Container size="xl" className="px-0">
        <header className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-white/10 bg-white/6 dark:bg-slate-900/6 px-5 py-4 backdrop-blur md:flex-row md:items-center md:justify-between md:px-7">
          <Group gap="sm" wrap="nowrap">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-[0_12px_32px_rgba(255,255,255,0.14)]">
              <LogoSVG length="30px" />
            </div>
            <div>
              <Text className="text-lg font-semibold tracking-[0.18em] text-white/95 uppercase">YApi</Text>
              <Text className="text-xs text-slate-300">Next workspace</Text>
            </div>
            <Badge radius="xl" color="blue" variant="light">
              Next
            </Badge>
          </Group>

          <Group gap="sm">
            <Button
              component="a"
              href="https://hellosean1025.github.io/yapi"
              target="_blank"
              rel="noopener noreferrer"
              variant="subtle"
              color="gray"
            >
              使用文档
            </Button>
            <Button component={Link} to="/login" radius="xl" color="blue">
              登录
            </Button>
          </Group>
        </header>

        <section className="grid gap-8 py-10 md:py-14 xl:grid-cols-[minmax(0,1.35fr)_420px] xl:items-start">
          <Stack gap="xl" className="max-w-4xl">
            <div className="space-y-5">
              <Badge
                size="lg"
                radius="xl"
                color="blue"
                variant="light"
                className="border border-blue-400/25 bg-blue-400/12"
              >
                API Governance Platform
              </Badge>
              <Title className="max-w-4xl text-4xl font-semibold leading-tight text-white md:text-6xl">
                清晰、现代、面向协作的 API 管理体验
              </Title>
              <Text className="max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
                YApi Next 将接口设计、调试、测试、导入导出和团队协作统一在一个工作流中，
                让研发、测试、产品都可以在同一语义下高效协同。
              </Text>
            </div>

            <Group gap="md">
              <Button component={Link} to="/login" size="lg" radius="xl" color="blue">
                开始使用
              </Button>
              <Button
                component="a"
                href="https://hellosean1025.github.io/yapi"
                target="_blank"
                rel="noopener noreferrer"
                size="lg"
                radius="xl"
                variant="light"
                color="gray"
              >
                查看文档
              </Button>
              {ThirdLogin ? <ThirdLogin /> : null}
            </Group>

            <div className="flex flex-wrap gap-3">
              {productSignals.map(item => (
                <div
                  key={item}
                  className="rounded-full border border-white/10 bg-white/7 dark:bg-slate-900/7 px-4 py-2 text-sm text-slate-200 backdrop-blur"
                >
                  {item}
                </div>
              ))}
            </div>
          </Stack>

          <Card
            radius="xl"
            padding="xl"
            className="border border-white/10 bg-white/[0.07] shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur"
          >
            <Stack gap="lg">
              <div>
                <Text className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200/80">
                  Core capabilities
                </Text>
                <Title order={3} className="mt-3 text-white">
                  核心能力
                </Title>
              </div>

              <Stack gap="sm">
                {coreCapabilities.map((item, index) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/18 text-sm font-semibold text-blue-100">
                      {index + 1}
                    </div>
                    <Text className="text-sm text-slate-200">{item}</Text>
                  </div>
                ))}
              </Stack>

              <div className="rounded-2xl border border-emerald-300/12 bg-emerald-300/8 px-4 py-4 text-sm leading-7 text-slate-200">
                适合需要统一接口协作、Mock 与回归测试链路的团队。
              </div>
            </Stack>
          </Card>
        </section>

        <section className="pb-6">
          <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }} spacing="lg">
            {featureCards.map(item => {
              const Icon = item.icon;
              return (
                <Card
                  key={item.title}
                  radius="xl"
                  padding="xl"
                  className="border border-white/10 bg-white/[0.06] shadow-[0_18px_50px_rgba(15,23,42,0.28)] backdrop-blur"
                >
                  <Stack gap="md">
                    <ThemeIcon size={52} radius="xl" color="blue" variant="light">
                      <Icon size={26} stroke={1.8} />
                    </ThemeIcon>
                    <Title order={4} className="text-white">
                      {item.title}
                    </Title>
                    <Text className="leading-7 text-slate-300">{item.desc}</Text>
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        </section>

        <section className="py-8 md:py-12">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            {valueHighlights.map(item => {
              const Icon = item.icon;
              return (
                <Card
                  key={item.title}
                  radius="xl"
                  padding="xl"
                  className="border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.78),rgba(30,41,59,0.52))] shadow-[0_20px_60px_rgba(15,23,42,0.35)]"
                >
                  <Stack gap="md">
                    <Group gap="sm" align="center">
                      <ThemeIcon size={48} radius="xl" color="teal" variant="light">
                        <Icon size={24} stroke={1.8} />
                      </ThemeIcon>
                      <Title order={4} className="text-white">
                        {item.title}
                      </Title>
                    </Group>
                    <Text className="leading-8 text-slate-300">{item.content}</Text>
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        </section>
      </Container>
    </PublicShell>
  );
}

import { useEffect, useMemo, type ComponentType } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Text,
  Title
} from '@mantine/core';
import {
  IconApi,
  IconApps,
  IconDatabase,
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
          <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-public-canvas)_96%,black)_0%,var(--surface-public-canvas)_58%,color-mix(in_srgb,var(--surface-public-canvas)_88%,var(--surface-panel))_100%)]" />
        </>
      }
      containerClassName="py-6 md:py-8"
    >
      <Container size="xl" className="px-0">
        <header className="flex flex-col gap-4 border-b border-[var(--border-public-subtle)] pb-5 md:flex-row md:items-center md:justify-between">
          <Group gap="sm" wrap="nowrap">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-panel)] text-[var(--text-primary)]">
              <LogoSVG length="30px" />
            </div>
            <div>
              <Text className="text-lg font-semibold tracking-[0.18em] text-[var(--text-public-primary)] uppercase">YApi</Text>
              <Text className="text-xs text-[var(--text-public-muted)]">Next workspace</Text>
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

        <section className="grid gap-8 py-10 md:py-14 xl:grid-cols-[minmax(0,1.3fr)_380px] xl:items-start">
          <Stack gap="lg" className="max-w-4xl">
            <div className="space-y-5">
              <Badge
                size="lg"
                radius="xl"
                color="blue"
                variant="light"
                className="border border-[color-mix(in_srgb,var(--interactive-primary)_32%,transparent)] bg-[color-mix(in_srgb,var(--interactive-primary)_14%,transparent)]"
              >
                API Governance Platform
              </Badge>
              <Title className="max-w-4xl text-4xl font-semibold leading-tight text-[var(--text-public-primary)] md:text-6xl">
                清晰、现代、面向协作的 API 管理体验
              </Title>
              <Text className="max-w-3xl text-base leading-8 text-[var(--text-public-secondary)] md:text-lg">
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

            <div className="flex flex-wrap gap-2.5">
              {productSignals.map(item => (
                <div
                  key={item}
                  className="rounded-full border border-[var(--border-public-subtle)] px-4 py-2 text-sm text-[var(--text-public-secondary)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </Stack>

          <Card
            radius="xl"
            padding="xl"
            className="border border-[var(--border-public-subtle)] bg-[var(--surface-public-panel)] shadow-none"
          >
            <Stack gap="lg">
              <div>
                <Text className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-public-muted)]">
                  Core capabilities
                </Text>
                <Title order={2} className="mt-3 text-[var(--text-public-primary)]">
                  核心能力
                </Title>
              </div>

              <Stack gap="sm">
                {coreCapabilities.map((item, index) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-public-subtle)] px-4 py-3"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--interactive-primary)_18%,transparent)] text-sm font-semibold text-[var(--text-public-primary)]">
                      {index + 1}
                    </div>
                    <Text className="text-sm text-[var(--text-public-secondary)]">{item}</Text>
                  </div>
                ))}
              </Stack>

              <div className="border-t border-[var(--border-public-subtle)] pt-4 text-sm leading-7 text-[var(--text-public-secondary)]">
                适合需要统一接口协作、Mock 与回归测试链路的团队。
              </div>
            </Stack>
          </Card>
        </section>

        <section className="pb-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {featureCards.map(item => {
              const Icon = item.icon;
              return (
                <Card
                  key={item.title}
                  radius="xl"
                  padding="lg"
                  className="border border-[var(--border-public-subtle)] bg-[var(--surface-public-panel)] shadow-none"
                >
                  <Stack gap="md">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--interactive-primary)_14%,transparent)] text-[var(--text-public-primary)]">
                      <Icon size={22} stroke={1.8} />
                    </div>
                    <Title order={3} className="text-[var(--text-public-primary)]">
                      {item.title}
                    </Title>
                    <Text className="leading-7 text-[var(--text-public-secondary)]">{item.desc}</Text>
                  </Stack>
                </Card>
              );
            })}
          </div>
        </section>
      </Container>
    </PublicShell>
  );
}

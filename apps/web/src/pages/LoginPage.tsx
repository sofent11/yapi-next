import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Col, Form, Input, Row, Tabs, message } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { useGetUserStatusQuery, useLoginMutation, useRegisterUserMutation } from '../services/yapi-api';
import LogoSVG from '../components/LogoSVG';
import { webPlugins } from '../plugins';
import { safeApiRequest } from '../utils/safe-request';
import './HomePage.scss';
import './LoginPage.scss';

type LoginFormValues = {
  email: string;
  password: string;
};

type RegisterFormValues = {
  email: string;
  password: string;
  username?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_RULES = [
  { required: true, message: '请输入邮箱!' },
  {
    validator: (_: unknown, value: unknown) => {
      const email = String(value || '').trim();
      if (!email) {
        return Promise.reject(new Error('请输入邮箱!'));
      }
      if (!EMAIL_PATTERN.test(email)) {
        return Promise.reject(new Error('请输入正确的邮箱地址!'));
      }
      return Promise.resolve();
    }
  }
];

function normalizeRedirect(target: string | null): string {
  if (!target || !target.startsWith('/')) return '/group';
  if (target.startsWith('/login')) return '/group';
  return target;
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
  const ThirdLogin = webPlugins.getThirdLoginComponent() as React.ComponentType | null;
  const callApi = useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => message.error(msg) }),
    []
  );

  async function handleLogin(values: LoginFormValues) {
    const response = await callApi(
      login({
        email: values.email.trim(),
        password: values.password
      }).unwrap(),
      '登录失败'
    );
    if (!response) return;
    message.success('登录成功');
    navigate(redirectTarget, { replace: true });
  }

  async function handleRegister(values: RegisterFormValues) {
    const response = await callApi(
      registerUser({
        email: values.email.trim(),
        password: values.password,
        username: values.username?.trim() || undefined
      }).unwrap(),
      '注册失败'
    );
    if (!response) return;
    message.success('注册成功');
    navigate(redirectTarget, { replace: true });
  }

  return (
    <div className="g-body login-body">
      <div className="m-bg">
        <div className="m-bg-mask m-bg-mask0" />
        <div className="m-bg-mask m-bg-mask1" />
        <div className="m-bg-mask m-bg-mask2" />
        <div className="m-bg-mask m-bg-mask3" />
      </div>
      <div className="main-one login-container">
        <div className="container">
          <Row justify="center">
            <Col xs={20} sm={16} md={12} lg={8} className="container-login">
              <Card className="card-login">
                <h2 className="login-title">YAPI</h2>
                <div className="login-logo">
                  <LogoSVG length="100px" />
                </div>
                <Tabs
                  activeKey={activeKey}
                  onChange={setActiveKey}
                  className="login-form"
                  items={[
                    {
                      key: 'login',
                      label: '登录',
                      children: (
                        <Form<LoginFormValues>
                          onFinish={handleLogin}
                          initialValues={{ email: '', password: '' }}
                          layout="vertical"
                        >
                          <Form.Item
                            label="邮箱"
                            name="email"
                            rules={EMAIL_RULES}
                          >
                            <Input
                              name="email"
                              prefix={<MailOutlined className="login-form-icon" />}
                              type="email"
                              inputMode="email"
                              placeholder="例如：name@example.com…"
                              autoComplete="email"
                              spellCheck={false}
                              className="login-form-input"
                            />
                          </Form.Item>
                          <Form.Item
                            label="密码"
                            name="password"
                            rules={[{ required: true, message: '请输入密码!' }]}
                          >
                            <Input.Password
                              name="password"
                              prefix={<LockOutlined className="login-form-icon" />}
                              placeholder="请输入登录密码…"
                              autoComplete="current-password"
                              className="login-form-input"
                            />
                          </Form.Item>
                          <Form.Item>
                            <Button
                              type="primary"
                              htmlType="submit"
                              className="login-form-button"
                              loading={loginState.isLoading}
                            >
                              登录
                            </Button>
                          </Form.Item>
                          {ThirdLogin ? (
                            <div className="login-third-party">
                              <div className="qsso-breakline">
                                <span className="qsso-breakword">或</span>
                              </div>
                              <ThirdLogin />
                            </div>
                          ) : null}
                        </Form>
                      )
                    },
                    {
                      key: 'register',
                      label: '注册',
                      children: canRegister ? (
                        <Form<RegisterFormValues>
                          onFinish={handleRegister}
                          initialValues={{ email: '', password: '', username: '' }}
                          layout="vertical"
                        >
                          <Form.Item
                            label="用户名"
                            name="username"
                            rules={[{ required: true, message: '请输入用户名!' }]}
                          >
                            <Input
                              name="username"
                              prefix={<UserOutlined className="login-form-icon" />}
                              placeholder="例如：zhangsan…"
                              autoComplete="username"
                              spellCheck={false}
                              className="login-form-input"
                            />
                          </Form.Item>
                          <Form.Item
                            label="邮箱"
                            name="email"
                            rules={EMAIL_RULES}
                          >
                            <Input
                              name="register-email"
                              prefix={<MailOutlined className="login-form-icon" />}
                              type="email"
                              inputMode="email"
                              placeholder="例如：name@example.com…"
                              autoComplete="email"
                              spellCheck={false}
                              className="login-form-input"
                            />
                          </Form.Item>
                          <Form.Item
                            label="密码"
                            name="password"
                            rules={[{ required: true, message: '请输入密码!' }]}
                          >
                            <Input.Password
                              name="new-password"
                              prefix={<LockOutlined className="login-form-icon" />}
                              placeholder="请设置登录密码…"
                              autoComplete="new-password"
                              className="login-form-input"
                            />
                          </Form.Item>
                          <Form.Item>
                            <Button
                              type="primary"
                              htmlType="submit"
                              className="login-form-button"
                              loading={registerState.isLoading}
                            >
                              注册
                            </Button>
                          </Form.Item>
                        </Form>
                      ) : (
                        <div className="login-register-disabled">
                          <Alert type="warning" showIcon message="管理员已禁止注册，请联系管理员" />
                        </div>
                      )
                    }
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </div>
      </div>
    </div>
  );
}

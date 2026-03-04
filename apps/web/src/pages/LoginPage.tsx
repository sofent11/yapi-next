import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Col, Form, Input, Row, Tabs, message } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { useGetUserStatusQuery, useLoginMutation, useRegisterUserMutation } from '../services/yapi-api';
import LogoSVG from '../components/LogoSVG';
import { webPlugins } from '../plugins';
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

  async function handleLogin(values: LoginFormValues) {
    const response = await login({
      email: values.email.trim(),
      password: values.password
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '登录失败');
      return;
    }
    message.success('登录成功');
    navigate(redirectTarget, { replace: true });
  }

  async function handleRegister(values: RegisterFormValues) {
    const response = await registerUser({
      email: values.email.trim(),
      password: values.password,
      username: values.username?.trim() || undefined
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '注册失败');
      return;
    }
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
                        >
                          <Form.Item
                            name="email"
                            rules={[
                              { required: true, message: '请输入正确的email!', pattern: /^\\w+([\\.-]?\\w+)*@\\w+([\\.-]?\\w+)*(\\.\\w{1,})+$/ }
                            ]}
                            style={{ marginBottom: '.16rem' }}
                          >
                            <Input
                              prefix={<MailOutlined style={{ fontSize: 13 }} />}
                              placeholder="Email"
                              autoComplete="email"
                              style={{ height: '.42rem' }}
                            />
                          </Form.Item>
                          <Form.Item
                            name="password"
                            rules={[{ required: true, message: '请输入密码!' }]}
                            style={{ marginBottom: '.16rem' }}
                          >
                            <Input.Password
                              prefix={<LockOutlined style={{ fontSize: 13 }} />}
                              placeholder="Password"
                              autoComplete="current-password"
                              style={{ height: '.42rem' }}
                            />
                          </Form.Item>
                          <Form.Item style={{ marginBottom: '.16rem' }}>
                            <Button
                              type="primary"
                              htmlType="submit"
                              className="login-form-button"
                              loading={loginState.isLoading}
                              style={{ height: '.42rem' }}
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
                        >
                          <Form.Item
                            name="username"
                            rules={[{ required: true, message: '请输入用户名!' }]}
                            style={{ marginBottom: '.16rem' }}
                          >
                            <Input
                              prefix={<UserOutlined style={{ fontSize: 13 }} />}
                              placeholder="Username"
                              style={{ height: '.42rem' }}
                            />
                          </Form.Item>
                          <Form.Item
                            name="email"
                            rules={[
                              { required: true, message: '请输入email!', pattern: /^\\w+([\\.-]?\\w+)*@\\w+([\\.-]?\\w+)*(\\.\\w{1,})+$/ }
                            ]}
                            style={{ marginBottom: '.16rem' }}
                          >
                            <Input
                              prefix={<MailOutlined style={{ fontSize: 13 }} />}
                              placeholder="Email"
                              autoComplete="email"
                              style={{ height: '.42rem' }}
                            />
                          </Form.Item>
                          <Form.Item
                            name="password"
                            rules={[{ required: true, message: '请输入密码!' }]}
                            style={{ marginBottom: '.16rem' }}
                          >
                            <Input.Password
                              prefix={<LockOutlined style={{ fontSize: 13 }} />}
                              placeholder="Password"
                              autoComplete="new-password"
                              style={{ height: '.42rem' }}
                            />
                          </Form.Item>
                          <Form.Item style={{ marginBottom: '.16rem' }}>
                            <Button
                              type="primary"
                              htmlType="submit"
                              className="login-form-button"
                              loading={registerState.isLoading}
                              style={{ height: '.42rem' }}
                            >
                              注册
                            </Button>
                          </Form.Item>
                        </Form>
                      ) : (
                        <div style={{ minHeight: 200, padding: 20 }}>
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

import { safeExecute, normalizePath, parseJsonSafe, parseMaybeJson, isValidRouteContract, toObject, inferPrimitiveSchema, mergeInferredSchemas, inferSchemaFromSample, inferDraft4SchemaTextFromJsonText, toStringValue, postJson, getJson, DRAFT4_SCHEMA_URI } from '../index';
import type { LegacyRouteContract } from '../../types/legacy-contract';
import type { HeaderMenuItem, SubNavItem, SubSettingNavItem, InterfaceTabItem, ImportDataItem, ExportDataItem, RequestLifecycleMeta } from '../index';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Spin, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import json5 from 'json5';

const { Text, Paragraph } = Typography;

// Extracted from index.tsx
export function ServicesPluginPage(props: { projectId: number }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await getJson<{ token?: string }>(`/api/project/token?id=${props.projectId}`);
        if (!active) return;
        if (res.errcode !== 0) {
          message.error(res.errmsg || '获取项目 token 失败');
          return;
        }
        const tokenValue =
          typeof res.data === 'string'
            ? res.data
            : toStringValue((res.data as Record<string, unknown> | undefined)?.token);
        setToken(String(tokenValue || '').trim());
      } catch (error) {
        if (!active) return;
        message.error(`获取项目 token 失败: ${String((error as Error).message || error)}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [props.projectId]);

  const origin = window.location.origin;
  const modernUrl = `${origin}/api/open/plugin/export-full?type=json&pid=${props.projectId}&status=all&token=${token}`;

  return (
    <Space direction="vertical" className="legacy-workspace-stack">
      {loading ? (
        <Space>
          <Spin size="small" />
          <Text>加载项目 token...</Text>
        </Space>
      ) : null}
      <Typography.Title level={5}>生成 TS Services</Typography.Title>
      <Paragraph>
        <Text>1. 安装工具：</Text>
      </Paragraph>
      <pre>npm i sm2tsservice -D</pre>
      <Paragraph>
        <Text>2. 创建配置文件 `json2service.json`：</Text>
      </Paragraph>
      <pre>{`{
  "url": "yapi-swagger.json",
  "remoteUrl": "${modernUrl}",
  "type": "yapi",
  "swaggerParser": {}
}`}</pre>
      <Paragraph>
        <Text>3. 生成代码：</Text>
      </Paragraph>
      <pre>npx sm2tsservice --clear</pre>
      <a href="https://github.com/gogoyqj/sm2tsservice" target="_blank" rel="noopener noreferrer">
        查看 sm2tsservice 文档
      </a>
    </Space>
  );
}

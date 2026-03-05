import { safeExecute, normalizePath, parseJsonSafe, parseMaybeJson, isValidRouteContract, toObject, inferPrimitiveSchema, mergeInferredSchemas, inferSchemaFromSample, inferDraft4SchemaTextFromJsonText, toStringValue, postJson, getJson, DRAFT4_SCHEMA_URI } from '../index';
import type { LegacyRouteContract } from '../../types/legacy-contract';
import type { HeaderMenuItem, SubNavItem, SubSettingNavItem, InterfaceTabItem, ImportDataItem, ExportDataItem, RequestLifecycleMeta } from '../index';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Spin, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import json5 from 'json5';

const { Text, Paragraph } = Typography;

// Extracted from index.tsx
export function PluginTestPage() {
  return (
    <Card size="small" title="Test Plugin">
      <Text>hello world.</Text>
    </Card>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Checkbox, Code, Group, Menu, Select, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { save as saveFile } from '@tauri-apps/plugin-dialog';
import type { AuthConfig, EnvironmentDocument, ProjectDocument, SessionSnapshot, WorkspaceIndex } from '@yapi-debugger/schema';
import { KeyValueEditor } from '../primitives/KeyValueEditor';
import { confirmAction, promptForText } from '../../lib/dialogs';
import { writeDocument } from '../../lib/desktop';
import {
  buildVariableWorkflowCatalog,
  type VariableAuthoringAudit,
  type VariableWorkflowEditableLayerId,
  type VariableWorkflowEntry,
  type VariableWorkflowMutationApi,
  type WorkflowVariableMutation
} from '../../lib/variable-audit';

function authTypeOptions() {
  return [
    { value: 'none', label: 'none' },
    { value: 'bearer', label: 'bearer' },
    { value: 'basic', label: 'basic' },
    { value: 'apikey', label: 'api key' },
    { value: 'oauth2', label: 'oauth2' },
    { value: 'oauth1', label: 'oauth1' },
    { value: 'awsv4', label: 'aws signature v4' },
    { value: 'digest', label: 'digest' },
    { value: 'ntlm', label: 'ntlm' },
    { value: 'wsse', label: 'wsse' }
  ];
}

function toKeyValueRows(values: Record<string, string>) {
  return Object.entries(values).map(([name, value]) => ({ name, value, enabled: true, kind: 'text' as const }));
}

function mergeHeaderRows(sharedHeaders: EnvironmentDocument['headers'], localHeaders: EnvironmentDocument['headers']) {
  const output = [...sharedHeaders];
  const names = new Map(output.map((row, index) => [row.name.trim().toLowerCase(), index]));
  localHeaders.forEach(row => {
    const key = row.name.trim().toLowerCase();
    const existing = names.get(key);
    if (existing == null) {
      names.set(key, output.length);
      output.push(row);
      return;
    }
    output[existing] = row;
  });
  return output;
}

function rebuildEnvironment(environment: EnvironmentDocument, patch: Partial<EnvironmentDocument>) {
  const sharedVars = patch.sharedVars ?? environment.sharedVars ?? environment.vars ?? {};
  const localVars = patch.localVars ?? environment.localVars ?? {};
  const sharedHeaders = patch.sharedHeaders ?? environment.sharedHeaders ?? environment.headers ?? [];
  const localHeaders = patch.localHeaders ?? environment.localHeaders ?? [];
  const hasLocalOverlay = Object.keys(localVars).length > 0 || localHeaders.length > 0 || Boolean(environment.localFilePath);
  return {
    ...environment,
    ...patch,
    sharedVars,
    localVars,
    sharedHeaders,
    localHeaders,
    vars: {
      ...sharedVars,
      ...localVars
    },
    headers: mergeHeaderRows(sharedHeaders, localHeaders),
    overlayMode: hasLocalOverlay || environment.sharedFilePath ? 'overlay' : environment.overlayMode || 'standalone'
  };
}

function WorkflowEmptyState(props: { title: string; detail: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="empty-workflow-state">
      <strong>{props.title}</strong>
      <span>{props.detail}</span>
      {props.actionLabel && props.onAction ? (
        <Button size="xs" variant="default" onClick={props.onAction}>
          {props.actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

type VariableQuickFixAction = {
  key: string;
  label: string;
  tone?: 'default' | 'danger';
  onClick: () => void;
};

type VariableBatchQuickFixAction = {
  key: string;
  label: string;
  successMessage: (appliedCount: number) => string;
  tone?: 'default' | 'danger';
  disabled: boolean;
  mutations: WorkflowVariableMutation[];
  confirm?: {
    title: string;
    message: string;
    detail: string;
    confirmLabel: string;
    selectable?: boolean;
  };
};

type VariableCleanupMutationPreviewItem = {
  key: string;
  token: string;
  layerLabel: string;
  mutation: WorkflowVariableMutation;
};

type VariableCleanupPlanExportScope = 'selected' | 'visible-selected';

type VariableCleanupPlanTemplate = {
  scope: VariableCleanupPlanExportScope;
  includeDetails: boolean;
  summaryOnly: boolean;
  groupByToken: boolean;
};

type VariableCleanupPlanTemplatePreset = {
  id: string;
  name: string;
  template: VariableCleanupPlanTemplate;
  createdAt: string;
  updatedAt: string;
};

const CLEANUP_PLAN_TEMPLATE_PRESET_STORAGE_KEY_PREFIX = 'yapi-debugger.cleanup-plan-template-presets';
const CUSTOM_CLEANUP_TEMPLATE_PRESET_ID = '__custom';

function cleanupPlanTemplatePresetStorageKey(workspaceRoot: string) {
  return `${CLEANUP_PLAN_TEMPLATE_PRESET_STORAGE_KEY_PREFIX}:${workspaceRoot || 'workspace'}`;
}

function normalizePlanTemplate(template: VariableCleanupPlanTemplate): VariableCleanupPlanTemplate {
  const summaryOnly = Boolean(template.summaryOnly);
  const includeDetails = summaryOnly ? false : Boolean(template.includeDetails);
  const groupByToken = includeDetails ? Boolean(template.groupByToken) : false;
  const scope: VariableCleanupPlanExportScope =
    template.scope === 'visible-selected' ? 'visible-selected' : 'selected';
  return {
    scope,
    includeDetails,
    summaryOnly,
    groupByToken
  };
}

function loadCleanupPlanTemplatePresets(workspaceRoot: string) {
  try {
    const raw = window.localStorage.getItem(cleanupPlanTemplatePresetStorageKey(workspaceRoot));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        if (!id || !name) return null;
        const template = normalizePlanTemplate(
          (item as { template?: VariableCleanupPlanTemplate }).template || {
            scope: 'selected',
            includeDetails: true,
            summaryOnly: false,
            groupByToken: false
          }
        );
        const createdAt = typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString();
        const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : createdAt;
        return {
          id,
          name,
          template,
          createdAt,
          updatedAt
        } as VariableCleanupPlanTemplatePreset;
      })
      .filter((item): item is VariableCleanupPlanTemplatePreset => Boolean(item))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (_error) {
    return [];
  }
}

function saveCleanupPlanTemplatePresets(workspaceRoot: string, presets: VariableCleanupPlanTemplatePreset[]) {
  try {
    window.localStorage.setItem(cleanupPlanTemplatePresetStorageKey(workspaceRoot), JSON.stringify(presets));
  } catch (_error) {
    // ignore write failure and keep current in-memory state.
  }
}

function createPlanTemplatePresetId() {
  return `cleanup-template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function VariableCleanupSelectionModal(props: {
  workspaceRoot: string;
  message: string;
  detail: string;
  confirmLabel: string;
  items: VariableCleanupMutationPreviewItem[];
  onCancel: () => void;
  onSubmit: (selectedKeys: string[]) => void;
}) {
  const [selectedKeys, setSelectedKeys] = useState(() => props.items.map(item => item.key));
  const [query, setQuery] = useState('');
  const [layerFilter, setLayerFilter] = useState('all');
  const [planExportScope, setPlanExportScope] = useState<'selected' | 'visible-selected'>('selected');
  const [planIncludeDetails, setPlanIncludeDetails] = useState(true);
  const [planSummaryOnly, setPlanSummaryOnly] = useState(false);
  const [planGroupByToken, setPlanGroupByToken] = useState(false);
  const [planPreviewOpen, setPlanPreviewOpen] = useState(false);
  const [planTemplatePresets, setPlanTemplatePresets] = useState<VariableCleanupPlanTemplatePreset[]>([]);
  const [selectedPlanTemplatePresetId, setSelectedPlanTemplatePresetId] = useState(CUSTOM_CLEANUP_TEMPLATE_PRESET_ID);
  const [collapsedTokens, setCollapsedTokens] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const collapsedSet = useMemo(() => new Set(collapsedTokens), [collapsedTokens]);
  const layerOptions = useMemo(() => {
    const labels = [...new Set(props.items.map(item => item.layerLabel))].sort((left, right) =>
      left.localeCompare(right)
    );
    return [{ value: 'all', label: 'All layers' }, ...labels.map(label => ({ value: label, label }))];
  }, [props.items]);
  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return props.items.filter(item => {
      if (layerFilter !== 'all' && item.layerLabel !== layerFilter) return false;
      if (!needle) return true;
      return item.token.toLowerCase().includes(needle) || item.layerLabel.toLowerCase().includes(needle);
    });
  }, [layerFilter, props.items, query]);
  const filteredGroups = useMemo(() => {
    const map = new Map<string, VariableCleanupMutationPreviewItem[]>();
    filteredItems.forEach(item => {
      const group = map.get(item.token);
      if (group) {
        group.push(item);
      } else {
        map.set(item.token, [item]);
      }
    });
    return [...map.entries()]
      .map(([token, items]) => ({
        token,
        items: [...items].sort((left, right) => left.layerLabel.localeCompare(right.layerLabel))
      }))
      .sort((left, right) => left.token.localeCompare(right.token));
  }, [filteredItems]);
  const groupSelectionCount = useMemo(() => {
    const map = new Map<string, number>();
    filteredGroups.forEach(group => {
      map.set(
        group.token,
        group.items.reduce((count, item) => (selectedSet.has(item.key) ? count + 1 : count), 0)
      );
    });
    return map;
  }, [filteredGroups, selectedSet]);
  const selectedLayerStats = useMemo(() => {
    const stats = new Map<string, number>();
    props.items.forEach(item => {
      if (!selectedSet.has(item.key)) return;
      stats.set(item.layerLabel, (stats.get(item.layerLabel) || 0) + 1);
    });
    return [...stats.entries()].sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    });
  }, [props.items, selectedSet]);
  const visibleSelectedCount = useMemo(
    () => filteredItems.reduce((count, item) => (selectedSet.has(item.key) ? count + 1 : count), 0),
    [filteredItems, selectedSet]
  );
  const visibleTokenCount = filteredGroups.length;
  const selectedItems = useMemo(
    () =>
      props.items
        .filter(item => selectedSet.has(item.key))
        .sort((left, right) =>
          left.token === right.token
            ? left.layerLabel.localeCompare(right.layerLabel)
            : left.token.localeCompare(right.token)
        ),
    [props.items, selectedSet]
  );
  const visibleSelectedItems = useMemo(
    () =>
      filteredItems
        .filter(item => selectedSet.has(item.key))
        .sort((left, right) =>
          left.token === right.token
            ? left.layerLabel.localeCompare(right.layerLabel)
            : left.token.localeCompare(right.token)
        ),
    [filteredItems, selectedSet]
  );
  const planExportItems = useMemo(
    () => (planExportScope === 'visible-selected' ? visibleSelectedItems : selectedItems),
    [planExportScope, selectedItems, visibleSelectedItems]
  );
  const planExportScopeLabel = planExportScope === 'visible-selected' ? 'visible selected' : 'selected';
  const planExportScopeOptions = [
    { value: 'selected', label: 'Selected items' },
    { value: 'visible-selected', label: 'Visible selected' }
  ];
  const planTemplatePresetOptions = useMemo(
    () => [
      { value: CUSTOM_CLEANUP_TEMPLATE_PRESET_ID, label: 'Custom template' },
      ...planTemplatePresets.map(item => ({ value: item.id, label: item.name }))
    ],
    [planTemplatePresets]
  );
  const selectedPlanTemplatePreset = useMemo(
    () => planTemplatePresets.find(item => item.id === selectedPlanTemplatePresetId) || null,
    [planTemplatePresets, selectedPlanTemplatePresetId]
  );
  const planExportDetailAllowed = !planSummaryOnly && planIncludeDetails;
  const planPreviewText = useMemo(
    () => buildCleanupPlanText(planExportItems, planExportScopeLabel),
    [
      filteredItems.length,
      layerFilter,
      planExportDetailAllowed,
      planExportItems,
      planExportScopeLabel,
      planGroupByToken,
      props.items.length,
      query,
      selectedItems.length,
      visibleSelectedCount
    ]
  );

  useEffect(() => {
    setPlanTemplatePresets(loadCleanupPlanTemplatePresets(props.workspaceRoot));
    setSelectedPlanTemplatePresetId(CUSTOM_CLEANUP_TEMPLATE_PRESET_ID);
  }, [props.workspaceRoot]);

  useEffect(() => {
    saveCleanupPlanTemplatePresets(props.workspaceRoot, planTemplatePresets);
  }, [planTemplatePresets, props.workspaceRoot]);

  useEffect(() => {
    const visibleTokens = new Set(filteredGroups.map(group => group.token));
    setCollapsedTokens(current => current.filter(token => visibleTokens.has(token)));
  }, [filteredGroups]);

  useEffect(() => {
    if (planSummaryOnly && planIncludeDetails) {
      setPlanIncludeDetails(false);
    }
  }, [planSummaryOnly, planIncludeDetails]);

  function selectVisible(nextChecked: boolean) {
    const visibleKeys = filteredItems.map(item => item.key);
    if (visibleKeys.length === 0) return;
    setSelectedKeys(current => {
      if (nextChecked) {
        const set = new Set(current);
        visibleKeys.forEach(key => set.add(key));
        return [...set];
      }
      const visibleSet = new Set(visibleKeys);
      return current.filter(key => !visibleSet.has(key));
    });
  }

  function selectGroup(token: string, nextChecked: boolean) {
    const group = filteredGroups.find(item => item.token === token);
    if (!group) return;
    const groupKeys = group.items.map(item => item.key);
    if (groupKeys.length === 0) return;
    setSelectedKeys(current => {
      if (nextChecked) {
        const set = new Set(current);
        groupKeys.forEach(key => set.add(key));
        return [...set];
      }
      const groupSet = new Set(groupKeys);
      return current.filter(key => !groupSet.has(key));
    });
  }

  function setVisibleTokenCollapse(collapsed: boolean) {
    const visibleTokens = filteredGroups.map(group => group.token);
    if (visibleTokens.length === 0) return;
    setCollapsedTokens(current => {
      if (collapsed) {
        const set = new Set(current);
        visibleTokens.forEach(token => set.add(token));
        return [...set];
      }
      const visibleSet = new Set(visibleTokens);
      return current.filter(token => !visibleSet.has(token));
    });
  }

  function toggleTokenCollapse(token: string) {
    setCollapsedTokens(current => (current.includes(token) ? current.filter(value => value !== token) : [...current, token]));
  }

  function currentPlanTemplate(): VariableCleanupPlanTemplate {
    return normalizePlanTemplate({
      scope: planExportScope,
      includeDetails: planIncludeDetails,
      summaryOnly: planSummaryOnly,
      groupByToken: planGroupByToken
    });
  }

  function applyPlanTemplate(template: VariableCleanupPlanTemplate) {
    const normalized = normalizePlanTemplate(template);
    setPlanExportScope(normalized.scope);
    setPlanSummaryOnly(normalized.summaryOnly);
    setPlanIncludeDetails(normalized.includeDetails);
    setPlanGroupByToken(normalized.groupByToken);
  }

  function markTemplateAsCustom() {
    setSelectedPlanTemplatePresetId(CUSTOM_CLEANUP_TEMPLATE_PRESET_ID);
  }

  function handleTemplateScopeChange(value: string | null) {
    markTemplateAsCustom();
    setPlanExportScope((value as VariableCleanupPlanExportScope) || 'selected');
  }

  function handleTemplateSummaryOnlyChange(checked: boolean) {
    markTemplateAsCustom();
    setPlanSummaryOnly(checked);
    if (checked) {
      setPlanIncludeDetails(false);
      setPlanGroupByToken(false);
    }
  }

  function handleTemplateIncludeDetailsChange(checked: boolean) {
    markTemplateAsCustom();
    setPlanIncludeDetails(checked);
    if (!checked) {
      setPlanGroupByToken(false);
    }
  }

  function handleTemplateGroupByTokenChange(checked: boolean) {
    markTemplateAsCustom();
    setPlanGroupByToken(checked);
  }

  function handleTemplatePresetChange(value: string | null) {
    const nextId = value || CUSTOM_CLEANUP_TEMPLATE_PRESET_ID;
    if (nextId === CUSTOM_CLEANUP_TEMPLATE_PRESET_ID) {
      setSelectedPlanTemplatePresetId(CUSTOM_CLEANUP_TEMPLATE_PRESET_ID);
      return;
    }
    const preset = planTemplatePresets.find(item => item.id === nextId);
    if (!preset) {
      setSelectedPlanTemplatePresetId(CUSTOM_CLEANUP_TEMPLATE_PRESET_ID);
      return;
    }
    applyPlanTemplate(preset.template);
    setSelectedPlanTemplatePresetId(preset.id);
  }

  async function saveCurrentTemplateAsPreset() {
    const existingNames = new Set(planTemplatePresets.map(item => item.name.toLowerCase()));
    const defaultName = selectedPlanTemplatePreset ? `${selectedPlanTemplatePreset.name} copy` : 'Cleanup plan preset';
    const presetName = await promptForText({
      title: 'Save Cleanup Plan Template',
      label: 'Preset name',
      defaultValue: defaultName,
      placeholder: 'e.g. PR review summary',
      confirmLabel: 'Save',
      validate: value => {
        if (!value.trim()) return 'Preset name is required.';
        if (existingNames.has(value.trim().toLowerCase())) return 'Preset name already exists.';
        return null;
      }
    });
    if (!presetName) return;
    const now = new Date().toISOString();
    const preset: VariableCleanupPlanTemplatePreset = {
      id: createPlanTemplatePresetId(),
      name: presetName,
      template: currentPlanTemplate(),
      createdAt: now,
      updatedAt: now
    };
    setPlanTemplatePresets(current => [...current, preset].sort((left, right) => left.name.localeCompare(right.name)));
    setSelectedPlanTemplatePresetId(preset.id);
    notifications.show({ color: 'teal', message: `Saved cleanup template preset "${preset.name}".` });
  }

  function updateSelectedTemplatePreset() {
    if (!selectedPlanTemplatePreset) return;
    const now = new Date().toISOString();
    setPlanTemplatePresets(current =>
      current.map(item =>
        item.id === selectedPlanTemplatePreset.id
          ? {
              ...item,
              template: currentPlanTemplate(),
              updatedAt: now
            }
          : item
      )
    );
    notifications.show({ color: 'teal', message: `Updated cleanup template preset "${selectedPlanTemplatePreset.name}".` });
  }

  async function deleteSelectedTemplatePreset() {
    if (!selectedPlanTemplatePreset) return;
    const shouldDelete = await confirmAction({
      title: 'Delete Cleanup Template',
      message: `Delete preset "${selectedPlanTemplatePreset.name}"?`,
      detail: 'This only removes the local template preset and does not affect any request or environment data.',
      confirmLabel: 'Delete preset',
      confirmColor: 'red'
    });
    if (!shouldDelete) return;
    setPlanTemplatePresets(current => current.filter(item => item.id !== selectedPlanTemplatePreset.id));
    setSelectedPlanTemplatePresetId(CUSTOM_CLEANUP_TEMPLATE_PRESET_ID);
    notifications.show({ color: 'teal', message: `Deleted preset "${selectedPlanTemplatePreset.name}".` });
  }

  function buildCleanupPlanText(items: VariableCleanupMutationPreviewItem[], scopeLabel: string) {
    const layerSummary = new Map<string, number>();
    items.forEach(item => {
      layerSummary.set(item.layerLabel, (layerSummary.get(item.layerLabel) || 0) + 1);
    });
    const sortedLayerSummary = [...layerSummary.entries()].sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    });
    const tokenCount = new Set(items.map(item => item.token)).size;
    const lines = [
      '# Variable Cleanup Plan',
      `Generated at: ${new Date().toISOString()}`,
      `Plan scope: ${scopeLabel}`,
      `Selected in scope: ${items.length}`,
      `Tokens in scope: ${tokenCount}`,
      `Selected total: ${selectedItems.length}/${props.items.length}`,
      `Visible in current filter: ${visibleSelectedCount}/${filteredItems.length} items`,
      `Layer filter: ${layerFilter}`,
      `Search query: ${query.trim() || '(none)'}`,
      '',
      'Layer summary:'
    ];
    if (sortedLayerSummary.length === 0) {
      lines.push('- (none)');
    } else {
      sortedLayerSummary.forEach(([layerLabel, count]) => {
        lines.push(`- ${layerLabel}: ${count}`);
      });
    }

    if (planExportDetailAllowed) {
      lines.push('', 'Selected targets:');
      if (planGroupByToken) {
        const grouped = new Map<string, string[]>();
        items.forEach(item => {
          const list = grouped.get(item.token);
          if (list) {
            list.push(item.layerLabel);
          } else {
            grouped.set(item.token, [item.layerLabel]);
          }
        });
        [...grouped.entries()]
          .sort((left, right) => left[0].localeCompare(right[0]))
          .forEach(([token, layers]) => {
            lines.push(`- ${token}`);
            [...layers].sort((left, right) => left.localeCompare(right)).forEach(layer => {
              lines.push(`  - ${layer}`);
            });
          });
      } else {
        items.forEach(item => {
          lines.push(`- ${item.token} -> ${item.layerLabel}`);
        });
      }
    } else {
      lines.push('', 'Selected targets detail: omitted');
    }

    return lines.join('\n');
  }

  async function copyCleanupPlan() {
    if (planExportItems.length === 0) {
      notifications.show({ color: 'orange', message: 'No selected cleanup items to export.' });
      return;
    }
    const content = buildCleanupPlanText(planExportItems, planExportScopeLabel);
    try {
      await navigator.clipboard.writeText(content);
      notifications.show({ color: 'teal', message: `Copied ${planExportItems.length} cleanup item(s) to clipboard.` });
    } catch (_error) {
      notifications.show({ color: 'red', message: 'Failed to copy cleanup plan to clipboard.' });
    }
  }

  async function saveCleanupPlan() {
    if (planExportItems.length === 0) {
      notifications.show({ color: 'orange', message: 'No selected cleanup items to export.' });
      return;
    }
    const stamp = new Date().toISOString().replace(/\..+$/, '').replace(/:/g, '-');
    const scopeSlug = planExportScope === 'visible-selected' ? 'visible-selected' : 'selected';
    const targetPath = await saveFile({
      title: 'Save Variable Cleanup Plan',
      defaultPath: `variable-cleanup-plan-${scopeSlug}-${stamp}.md`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] }
      ]
    });
    if (!targetPath || typeof targetPath !== 'string') return;

    try {
      await writeDocument(targetPath, buildCleanupPlanText(planExportItems, planExportScopeLabel));
      notifications.show({ color: 'teal', message: `Saved cleanup plan with ${planExportItems.length} item(s).` });
    } catch (_error) {
      notifications.show({ color: 'red', message: 'Failed to save cleanup plan.' });
    }
  }

  return (
    <div className="variable-cleanup-selection-shell">
      <Text size="sm">{props.message}</Text>
      <Text size="xs" c="dimmed">
        {props.detail}
      </Text>
      <div className="variable-cleanup-selection-filters">
        <TextInput
          size="xs"
          placeholder="Search token or layer"
          value={query}
          onChange={event => setQuery(event.currentTarget.value)}
        />
        <Select
          size="xs"
          value={layerFilter}
          data={layerOptions}
          onChange={value => setLayerFilter(value || 'all')}
        />
      </div>
      <div className="variable-cleanup-selection-summary">
        {selectedLayerStats.length > 0 ? (
          selectedLayerStats.map(([layerLabel, count]) => (
            <span key={layerLabel} className="variable-cleanup-selection-chip">
              <strong>{count}</strong>
              <span>{layerLabel}</span>
            </span>
          ))
        ) : (
          <Text size="xs" c="dimmed">
            No layers selected.
          </Text>
        )}
      </div>
      <div className="variable-cleanup-selection-toolbar">
        <Text size="xs" c="dimmed">
          {selectedKeys.length} selected / {props.items.length} · {visibleSelectedCount} items in view · {visibleTokenCount} tokens in view
        </Text>
        <Group gap={6}>
          <Select
            size="xs"
            w={210}
            value={selectedPlanTemplatePresetId}
            data={planTemplatePresetOptions}
            onChange={handleTemplatePresetChange}
          />
          <Button size="xs" variant="default" onClick={() => void saveCurrentTemplateAsPreset()}>
            Save as preset
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={() => updateSelectedTemplatePreset()}
            disabled={!selectedPlanTemplatePreset}
          >
            Update preset
          </Button>
          <Button
            size="xs"
            variant="default"
            color="red"
            onClick={() => void deleteSelectedTemplatePreset()}
            disabled={!selectedPlanTemplatePreset}
          >
            Delete preset
          </Button>
          <Select
            size="xs"
            w={180}
            value={planExportScope}
            data={planExportScopeOptions}
            onChange={handleTemplateScopeChange}
          />
          <Checkbox
            size="xs"
            label="Summary only"
            checked={planSummaryOnly}
            onChange={event => handleTemplateSummaryOnlyChange(event.currentTarget.checked)}
          />
          <Checkbox
            size="xs"
            label="Include details"
            checked={planIncludeDetails}
            disabled={planSummaryOnly}
            onChange={event => handleTemplateIncludeDetailsChange(event.currentTarget.checked)}
          />
          <Checkbox
            size="xs"
            label="Group by token"
            checked={planGroupByToken}
            disabled={!planExportDetailAllowed}
            onChange={event => handleTemplateGroupByTokenChange(event.currentTarget.checked)}
          />
          <Button size="xs" variant="default" onClick={() => void saveCleanupPlan()} disabled={planExportItems.length === 0}>
            Save plan
          </Button>
          <Button size="xs" variant="default" onClick={() => void copyCleanupPlan()} disabled={planExportItems.length === 0}>
            Copy plan
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={() => setPlanPreviewOpen(current => !current)}
            disabled={planExportItems.length === 0}
          >
            {planPreviewOpen ? 'Hide preview' : 'Preview plan'}
          </Button>
          <Button size="xs" variant="default" onClick={() => setVisibleTokenCollapse(false)} disabled={filteredGroups.length === 0}>
            Expand visible
          </Button>
          <Button size="xs" variant="default" onClick={() => setVisibleTokenCollapse(true)} disabled={filteredGroups.length === 0}>
            Collapse visible
          </Button>
          <Button size="xs" variant="default" onClick={() => selectVisible(true)} disabled={filteredItems.length === 0}>
            Select visible
          </Button>
          <Button size="xs" variant="default" onClick={() => selectVisible(false)} disabled={filteredItems.length === 0}>
            Clear visible
          </Button>
          <Button size="xs" variant="default" onClick={() => setSelectedKeys(props.items.map(item => item.key))}>
            Select all
          </Button>
          <Button size="xs" variant="default" onClick={() => setSelectedKeys([])}>
            Clear all
          </Button>
        </Group>
      </div>
      {planPreviewOpen ? (
        <div className="variable-cleanup-plan-preview">
          <div className="variable-cleanup-plan-preview-head">
            <Text size="xs" c="dimmed">
              Live export preview ({planExportItems.length} item{planExportItems.length === 1 ? '' : 's'})
            </Text>
          </div>
          <pre>{planPreviewText}</pre>
        </div>
      ) : null}
      <div className="variable-cleanup-selection-list">
        {filteredGroups.length === 0 ? (
          <div className="empty-tab-state">No matching cleanup targets for this filter.</div>
        ) : (
          filteredGroups.map(group => {
            const selectedCount = groupSelectionCount.get(group.token) || 0;
            const isCollapsed = collapsedSet.has(group.token);
            return (
              <div key={group.token} className="variable-cleanup-group">
                <div className="variable-cleanup-group-head">
                  <button
                    type="button"
                    className="variable-cleanup-group-toggle"
                    onClick={() => toggleTokenCollapse(group.token)}
                  >
                    <strong>{group.token}</strong>
                    <span>{selectedCount}/{group.items.length} selected · {isCollapsed ? 'collapsed' : 'expanded'}</span>
                  </button>
                  <Group gap={6}>
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => selectGroup(group.token, true)}
                      disabled={selectedCount >= group.items.length}
                    >
                      Select token
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => selectGroup(group.token, false)}
                      disabled={selectedCount === 0}
                    >
                      Clear token
                    </Button>
                  </Group>
                </div>
                {isCollapsed ? null : (
                  <div className="variable-cleanup-group-body">
                    {group.items.map(item => (
                      <div key={item.key} className="variable-cleanup-selection-row">
                        <Checkbox
                          checked={selectedSet.has(item.key)}
                          onChange={event =>
                            setSelectedKeys(current =>
                              event.currentTarget.checked
                                ? current.includes(item.key)
                                  ? current
                                  : [...current, item.key]
                                : current.filter(value => value !== item.key)
                            )
                          }
                          label={
                            <span className="variable-cleanup-selection-label">
                              <strong>{item.token}</strong>
                              <span>{item.layerLabel}</span>
                            </span>
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <Group justify="flex-end">
        <Button variant="default" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button color="red" disabled={selectedKeys.length === 0} onClick={() => props.onSubmit(selectedKeys)}>
          {props.confirmLabel}
        </Button>
      </Group>
    </div>
  );
}

function variableWorkflowResolutionOrder(layerId: string | null | undefined) {
  if (!layerId) return Number.MAX_SAFE_INTEGER;
  if (layerId === 'request') return 0;
  if (layerId.startsWith('folder-')) return 1;
  if (layerId === 'runtime') return 2;
  if (layerId === 'environment-local') return 3;
  if (layerId === 'environment-shared') return 4;
  if (layerId === 'project-runtime') return 5;
  if (layerId === 'builtin-baseUrl') return 6;
  if (layerId === 'prompt-defaults') return 7;
  return Number.MAX_SAFE_INTEGER - 1;
}

function findWorkflowDefinition(entry: VariableWorkflowEntry, layerId: VariableWorkflowEditableLayerId) {
  return entry.definitions.find(definition => definition.mutationLayerId === layerId) || null;
}

function winningWorkflowDefinition(entry: VariableWorkflowEntry) {
  return entry.definitions.find(definition => definition.winner) || entry.definitions[0] || null;
}

function buildVariableQuickFixActions(
  entry: VariableWorkflowEntry,
  workflowMutations: VariableWorkflowMutationApi
): VariableQuickFixAction[] {
  const actions: VariableQuickFixAction[] = [];
  const winningDefinition = winningWorkflowDefinition(entry);
  const winningValue = winningDefinition?.value ?? entry.winnerValue;
  const winningLayerId = winningDefinition?.layerId || null;
  const promptDefinition = findWorkflowDefinition(entry, 'prompt-defaults');

  (
    ['request', 'environment-shared', 'environment-local', 'project-runtime'] as const
  ).forEach(targetLayerId => {
    const controller = workflowMutations[targetLayerId];
    if (!controller?.available) return;

    const targetDefinition = findWorkflowDefinition(entry, targetLayerId);
    const promote =
      winningDefinition?.participatesInResolution &&
      variableWorkflowResolutionOrder(targetLayerId) < variableWorkflowResolutionOrder(winningLayerId);
    const isSeed = entry.requestMissing || !entry.hasResolutionSource;
    const isCurrentWinningLayer = !isSeed && winningDefinition?.mutationLayerId === targetLayerId;
    const wouldBeNoop = !promote && targetDefinition?.value === winningValue;

    if (isCurrentWinningLayer || wouldBeNoop) return;

    actions.push({
      key: `${entry.token}:${targetLayerId}`,
      label: isSeed
        ? `Seed into ${controller.label}`
        : promote
          ? `Promote winner into ${controller.label}`
          : `Copy winner into ${controller.label}`,
      onClick: () => controller.upsert(entry.token, winningValue)
    });
  });

  const promptController = workflowMutations['prompt-defaults'];
  if (promptController.available && winningDefinition && promptDefinition?.value !== winningValue) {
    actions.push({
      key: `${entry.token}:remember-prompt`,
      label: promptDefinition ? 'Update remembered prompt default' : 'Remember winning value as prompt default',
      onClick: () => promptController.upsert(entry.token, winningValue)
    });
  }

  if (promptController.available && promptDefinition) {
    actions.push({
      key: `${entry.token}:clear-prompt`,
      label: 'Clear remembered prompt default',
      tone: 'danger',
      onClick: () => promptController.remove(entry.token)
    });
  }

  entry.definitions.forEach(definition => {
    if (!definition.mutationLayerId || definition.winner) return;
    if (definition.mutationLayerId === 'prompt-defaults') return;
    const controller = workflowMutations[definition.mutationLayerId];
    if (!controller?.available) return;
    actions.push({
      key: `${entry.token}:remove:${definition.mutationLayerId}`,
      label: `Remove shadowed value from ${controller.label}`,
      tone: 'danger',
      onClick: () => controller.remove(entry.token)
    });
  });

  return actions;
}

function preferredSeedLayer(workflowMutations: VariableWorkflowMutationApi): VariableWorkflowEditableLayerId | null {
  const candidates: VariableWorkflowEditableLayerId[] = [
    'request',
    'environment-local',
    'environment-shared',
    'project-runtime'
  ];
  for (const layerId of candidates) {
    if (workflowMutations[layerId].available) return layerId;
  }
  return null;
}

function summarizeBatchMutationTargets(
  mutations: WorkflowVariableMutation[],
  workflowMutations: VariableWorkflowMutationApi,
  limit = 8
) {
  const targets = mutations
    .map(mutation => `${mutation.token} -> ${workflowMutations[mutation.layerId].label}`)
    .sort((left, right) => left.localeCompare(right));
  const preview = targets.slice(0, limit);
  const remaining = targets.length - preview.length;
  if (preview.length === 0) return 'No mutable targets detected.';
  if (remaining <= 0) return preview.join(' | ');
  return `${preview.join(' | ')} | +${remaining} more`;
}

function buildCleanupMutationPreviewItems(
  mutations: WorkflowVariableMutation[],
  workflowMutations: VariableWorkflowMutationApi
) {
  return mutations
    .map(mutation => ({
      key: `${mutation.token}:${mutation.layerId}`,
      token: mutation.token,
      layerLabel: workflowMutations[mutation.layerId].label,
      mutation
    }))
    .sort((left, right) =>
      left.token === right.token
        ? left.layerLabel.localeCompare(right.layerLabel)
        : left.token.localeCompare(right.token)
    );
}

function buildBatchQuickFixActions(
  entries: VariableWorkflowEntry[],
  workflowMutations: VariableWorkflowMutationApi
): VariableBatchQuickFixAction[] {
  const seedLayerId = preferredSeedLayer(workflowMutations);
  const seedMutations: WorkflowVariableMutation[] = [];
  const rememberPromptMutations: WorkflowVariableMutation[] = [];
  const cleanupMutations: WorkflowVariableMutation[] = [];
  const cleanupKeySet = new Set<string>();

  entries.forEach(entry => {
    const winningDefinition = winningWorkflowDefinition(entry);
    const winningValue = winningDefinition?.value ?? entry.winnerValue;
    const promptDefinition = findWorkflowDefinition(entry, 'prompt-defaults');

    if (seedLayerId && (entry.requestMissing || !entry.hasResolutionSource)) {
      seedMutations.push({
        layerId: seedLayerId,
        token: entry.token,
        value: winningValue
      });
    }

    if (
      workflowMutations['prompt-defaults'].available &&
      winningDefinition &&
      promptDefinition?.value !== winningValue
    ) {
      rememberPromptMutations.push({
        layerId: 'prompt-defaults',
        token: entry.token,
        value: winningValue
      });
    }

    entry.definitions.forEach(definition => {
      if (!definition.mutationLayerId || definition.winner) return;
      if (definition.mutationLayerId === 'prompt-defaults') return;
      if (!workflowMutations[definition.mutationLayerId].available) return;
      const mutationKey = `${entry.token}:${definition.mutationLayerId}`;
      if (cleanupKeySet.has(mutationKey)) return;
      cleanupKeySet.add(mutationKey);
      cleanupMutations.push({
        layerId: definition.mutationLayerId,
        token: entry.token,
        value: null
      });
    });
  });

  return [
    {
      key: 'seed-missing',
      label: seedLayerId ? `Seed missing (${seedMutations.length})` : 'Seed missing',
      successMessage: appliedCount => `Seeded ${appliedCount} missing token(s).`,
      disabled: seedMutations.length === 0,
      mutations: seedMutations
    },
    {
      key: 'remember-prompt',
      label: `Remember winners (${rememberPromptMutations.length})`,
      successMessage: appliedCount => `Updated ${appliedCount} prompt default(s).`,
      disabled: rememberPromptMutations.length === 0,
      mutations: rememberPromptMutations
    },
    {
      key: 'cleanup-shadowed',
      label: `Clean shadowed (${cleanupMutations.length})`,
      successMessage: appliedCount => `Removed ${appliedCount} shadowed value(s).`,
      tone: 'danger',
      disabled: cleanupMutations.length === 0,
      mutations: cleanupMutations,
      confirm:
        cleanupMutations.length > 0
          ? {
              title: 'Clean Shadowed Values',
              message: `Remove ${cleanupMutations.length} shadowed value(s) from editable layers?`,
              detail: `${summarizeBatchMutationTargets(cleanupMutations, workflowMutations)}. Uncheck any item you want to keep.`,
              confirmLabel: 'Clean Selected',
              selectable: true
            }
          : undefined
    }
  ];
}

function VariableWorkflowQuickFixMenu(props: {
  entry: VariableWorkflowEntry;
  workflowMutations: VariableWorkflowMutationApi;
}) {
  const actions = buildVariableQuickFixActions(props.entry, props.workflowMutations);

  if (actions.length === 0) return null;

  return (
    <Menu width={280} position="bottom-end" withinPortal>
      <Menu.Target>
        <Button size="xs" variant="default">
          Quick fix
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{props.entry.token}</Menu.Label>
        {actions.map(action => (
          <Menu.Item
            key={action.key}
            color={action.tone === 'danger' ? 'red' : undefined}
            onClick={action.onClick}
          >
            {action.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

export function EnvironmentCenterPanel(props: {
  workspace: WorkspaceIndex;
  draftProject: ProjectDocument | null;
  activeEnvironmentName: string;
  selectedEnvironment: EnvironmentDocument | null;
  activeRequestName?: string | null;
  variableAudit?: VariableAuthoringAudit | null;
  runtimeVariables: Record<string, string>;
  promptVariables: Record<string, string>;
  sessionSnapshot: SessionSnapshot | null;
  hostSnapshots: Array<{ host: string; snapshot: SessionSnapshot }>;
  targetUrl: string | null;
  onEnvironmentChange: (name: string) => void;
  onProjectChange: (project: ProjectDocument) => void;
  onEnvironmentUpdate: (name: string, updater: (environment: EnvironmentDocument) => EnvironmentDocument) => void;
  onAddEnvironment: () => void;
  onRefreshSession: () => void;
  onClearSession: () => void;
  onClearRuntimeVars: () => void;
  onPromptVariablesChange: (values: Record<string, string>) => void;
  onClearPromptVars: () => void;
  workflowMutations: VariableWorkflowMutationApi;
  onSave: () => void;
}) {
  const selectedEnvironment = props.selectedEnvironment;
  const project = props.draftProject || props.workspace.project;
  const runtimeEntries = Object.entries(props.runtimeVariables);
  const promptEntries = Object.entries(props.promptVariables);
  const sharedVarCount = Object.keys(selectedEnvironment?.sharedVars || selectedEnvironment?.vars || {}).length;
  const localVarCount = Object.keys(selectedEnvironment?.localVars || {}).length;
  const sharedHeaderCount = (selectedEnvironment?.sharedHeaders || selectedEnvironment?.headers || []).length;
  const localHeaderCount = (selectedEnvironment?.localHeaders || []).length;
  const authProfileCount = selectedEnvironment?.authProfiles.length || 0;
  const hasOverlay = localVarCount > 0 || localHeaderCount > 0 || Boolean(selectedEnvironment?.localFilePath);
  const variableAudit = props.variableAudit || null;
  const activeEnvironmentLabel = selectedEnvironment?.name || props.activeEnvironmentName || 'No environment selected';
  const [workflowFilter, setWorkflowFilter] = useState<'all' | 'shadowed' | 'active-request' | 'prompt-defaults'>('shadowed');
  const [workflowQuery, setWorkflowQuery] = useState('');
  const workflowCatalog = useMemo(
    () =>
      buildVariableWorkflowCatalog({
        project,
        environment: selectedEnvironment,
        runtimeVariables: props.runtimeVariables,
        promptVariables: props.promptVariables,
        variableAudit
      }),
    [project, selectedEnvironment, props.runtimeVariables, props.promptVariables, variableAudit]
  );
  const workflowEntryByToken = useMemo(
    () => new Map(workflowCatalog.entries.map(entry => [entry.token, entry])),
    [workflowCatalog.entries]
  );
  const filteredWorkflowEntries = useMemo(() => {
    const needle = workflowQuery.trim().toLowerCase();
    return workflowCatalog.entries.filter(entry => {
      if (workflowFilter === 'shadowed' && !entry.conflict) return false;
      if (workflowFilter === 'active-request' && !entry.requestLinked) return false;
      if (workflowFilter === 'prompt-defaults' && !entry.hasPromptDefault) return false;
      if (!needle) return true;
      return (
        entry.token.toLowerCase().includes(needle) ||
        entry.winnerLabel.toLowerCase().includes(needle) ||
        entry.definitions.some(definition => definition.label.toLowerCase().includes(needle))
      );
    });
  }, [workflowCatalog.entries, workflowFilter, workflowQuery]);
  const batchQuickFixActions = useMemo(
    () => buildBatchQuickFixActions(filteredWorkflowEntries, props.workflowMutations),
    [filteredWorkflowEntries, props.workflowMutations]
  );

  async function selectCleanupMutations(action: VariableBatchQuickFixAction) {
    const confirm = action.confirm;
    if (!confirm) return action.mutations;
    const previewItems = buildCleanupMutationPreviewItems(action.mutations, props.workflowMutations);
    if (previewItems.length === 0) return [];

    return new Promise<WorkflowVariableMutation[] | null>(resolve => {
      const modalId = `variable-cleanup-selection-${Date.now()}`;
      let resolved = false;

      const closeWith = (value: WorkflowVariableMutation[] | null) => {
        if (resolved) return;
        resolved = true;
        resolve(value);
        modals.close(modalId);
      };

      modals.open({
        modalId,
        title: confirm.title,
        centered: true,
        size: 'lg',
        onClose: () => {
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        },
        children: (
          <VariableCleanupSelectionModal
            workspaceRoot={props.workspace.root}
            message={confirm.message}
            detail={confirm.detail}
            confirmLabel={confirm.confirmLabel}
            items={previewItems}
            onCancel={() => closeWith(null)}
            onSubmit={selectedKeys => {
              const selected = previewItems
                .filter(item => selectedKeys.includes(item.key))
                .map(item => item.mutation);
              closeWith(selected);
            }}
          />
        )
      });
    });
  }

  async function handleBatchQuickFix(action: VariableBatchQuickFixAction) {
    if (action.disabled || action.mutations.length === 0) return;
    let mutationsToApply = action.mutations;
    if (action.confirm) {
      if (action.confirm.selectable) {
        const selected = await selectCleanupMutations(action);
        if (!selected) return;
        if (selected.length === 0) {
          notifications.show({ color: 'orange', message: 'No shadowed values selected.' });
          return;
        }
        mutationsToApply = selected;
      } else {
        const confirmed = await confirmAction({
          title: action.confirm.title,
          message: action.confirm.message,
          detail: action.confirm.detail,
          confirmLabel: action.confirm.confirmLabel
        });
        if (!confirmed) return;
      }
    }
    props.workflowMutations.applyMany(mutationsToApply);
    notifications.show({
      color: action.tone === 'danger' ? 'orange' : 'teal',
      message: action.successMessage(mutationsToApply.length)
    });
  }

  return (
    <section className="workspace-main environment-center">
      <div className="panel-toolbar">
        <div className="breadcrumb-list">
          <span className="breadcrumb-chip">{project.name}</span>
          <span className="breadcrumb-chip">Environments</span>
        </div>
        <div className="panel-toolbar-actions">
          <Button size="xs" variant="default" onClick={props.onAddEnvironment}>New Environment</Button>
          <Button size="xs" variant="default" onClick={props.onRefreshSession}>Refresh Runtime</Button>
          <Button size="xs" onClick={props.onSave}>Save</Button>
        </div>
      </div>

      <div className="center-intro">
        <Text size="sm" c="dimmed">
          Keep shared configuration, local secrets, and runtime session state separate so the team can collaborate safely without losing fast local debugging.
        </Text>
        <div className="summary-grid center-summary-grid">
          <div className="summary-chip">
            <span>Active Env</span>
            <strong>{activeEnvironmentLabel}</strong>
          </div>
          <div className="summary-chip">
            <span>Overlay</span>
            <strong>{selectedEnvironment ? (hasOverlay ? 'Local overrides on' : 'Shared only') : 'Not available'}</strong>
          </div>
          <div className="summary-chip">
            <span>Request Focus</span>
            <strong>{props.activeRequestName || 'Select a request'}</strong>
          </div>
          <div className="summary-chip">
            <span>Runtime State</span>
            <strong>{runtimeEntries.length} vars · {props.sessionSnapshot?.cookies.length || 0} cookies</strong>
          </div>
        </div>
      </div>

      <div className="environment-layout">
        <aside className="environment-sidebar">
          <div className="sidebar-section-head">
            <Text fw={700} size="sm">Environment List</Text>
            <Text size="xs" c="dimmed">Choose which named environment the workspace should use right now.</Text>
          </div>
          <div className="environment-list">
            {props.workspace.environments.length === 0 ? (
              <WorkflowEmptyState
                title="No environments yet"
                detail="Create one to keep shared defaults, local overrides, auth profiles, and runtime state separated."
                actionLabel="New Environment"
                onAction={props.onAddEnvironment}
              />
            ) : props.workspace.environments.map(item => {
              const mergedVarCount = Object.keys(item.document.vars || {}).length;
              const overlayCount = Object.keys(item.document.localVars || {}).length + (item.document.localHeaders || []).length;
              return (
                <button
                  key={item.document.name}
                  type="button"
                  className={item.document.name === props.activeEnvironmentName ? 'environment-item is-active' : 'environment-item'}
                  onClick={() => props.onEnvironmentChange(item.document.name)}
                >
                  <strong>{item.document.name}</strong>
                  <span>{mergedVarCount} vars · {item.document.authProfiles.length} auth profiles</span>
                  <span>{overlayCount > 0 ? `${overlayCount} local overrides` : 'No local overlay'}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="environment-main">
          <section className="inspector-section">
            <div className="checks-head">
              <div>
                <Text className="section-kicker">Workspace Runtime</Text>
                <h3 className="section-title">Project-level defaults</h3>
              </div>
            </div>
            <Text size="sm" c="dimmed">
              These defaults belong to the workspace itself. They are shared infrastructure, not session state.
            </Text>
            <div className="settings-grid" style={{ marginTop: 12 }}>
              <TextInput
                label="Default Base URL"
                value={project.runtime.baseUrl}
                onChange={event =>
                  props.onProjectChange({
                    ...project,
                    runtime: {
                      ...project.runtime,
                      baseUrl: event.currentTarget.value
                    }
                  })
                }
              />
            </div>
            <KeyValueEditor
              rows={project.runtime.headers}
              onChange={rows =>
                props.onProjectChange({
                  ...project,
                  runtime: {
                    ...project.runtime,
                    headers: rows
                  }
                })
              }
              nameLabel="Header"
              valueLabel="Value"
            />
          </section>

          {selectedEnvironment ? (
            <>
              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Environment Summary</Text>
                    <h3 className="section-title">{selectedEnvironment.name}</h3>
                  </div>
                  <Badge color={hasOverlay ? 'orange' : 'gray'} variant="light">
                    {hasOverlay ? 'Has local overlay' : 'Shared only'}
                  </Badge>
                </div>
                <div className="summary-grid">
                  <div className="summary-chip">
                    <span>Shared Vars</span>
                    <strong>{sharedVarCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Local Vars</span>
                    <strong>{localVarCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Headers</span>
                    <strong>{sharedHeaderCount + localHeaderCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Auth Profiles</span>
                    <strong>{authProfileCount}</strong>
                  </div>
                </div>
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Variable Audit</Text>
                    <h3 className="section-title">Current request precedence</h3>
                  </div>
                  {variableAudit ? (
                    <Badge color={variableAudit.missingCount > 0 ? 'red' : variableAudit.conflictCount > 0 ? 'orange' : 'teal'} variant="light">
                      {variableAudit.missingCount} missing · {variableAudit.conflictCount} shadowed
                    </Badge>
                  ) : null}
                </div>
                {variableAudit ? (
                  <>
                    <Text size="sm" c="dimmed">
                      Review which layer currently wins for <strong>{variableAudit.requestName}</strong>, which duplicate values are shadowed,
                      and where to edit the active source without changing runtime precedence.
                    </Text>
                    <Text size="xs" c="dimmed" mt="sm">
                      Precedence: {variableAudit.precedenceLabels.join(' → ') || 'No variable layers are active for the current request.'}
                    </Text>
                    <div className="summary-grid" style={{ marginTop: 12 }}>
                      <div className="summary-chip">
                        <span>Detected Tokens</span>
                        <strong>{variableAudit.entries.length}</strong>
                      </div>
                      <div className="summary-chip">
                        <span>Missing</span>
                        <strong>{variableAudit.missingCount}</strong>
                      </div>
                      <div className="summary-chip">
                        <span>Shadowed</span>
                        <strong>{variableAudit.conflictCount}</strong>
                      </div>
                    </div>
                    {variableAudit.entries.length === 0 ? (
                      <div style={{ marginTop: 12 }}>
                        <WorkflowEmptyState
                          title="No template variables in this request"
                          detail="Add {{tokens}} to the URL, query, headers, or body when this request should resolve environment values before Send."
                        />
                      </div>
                    ) : (
                      <div className="variable-authoring-list">
                        {variableAudit.entries.map(variable => {
                          const workflowEntry = workflowEntryByToken.get(variable.token);
                          return (
                            <div key={variable.token} className="variable-authoring-card">
                            <div className="variable-authoring-head">
                              <div className="variable-authoring-copy">
                                <strong>{variable.token}</strong>
                                <span>{variable.sourceLabel}</span>
                              </div>
                              <Group gap="xs">
                                {workflowEntry ? (
                                  <VariableWorkflowQuickFixMenu
                                    entry={workflowEntry}
                                    workflowMutations={props.workflowMutations}
                                  />
                                ) : null}
                                <Badge color={variable.missing ? 'red' : variable.conflict ? 'orange' : 'teal'} variant="light">
                                  {variable.missing ? 'missing' : variable.conflict ? 'shadowed' : 'resolved'}
                                </Badge>
                                <Code>{variable.missing ? 'unresolved' : variable.value || 'empty'}</Code>
                              </Group>
                            </div>
                            <Text size="xs" c="dimmed">
                              Used in {variable.locations.join(' · ') || 'request preview'}
                            </Text>
                            {!variable.missing ? (
                              <Text size="xs" c="dimmed">
                                Winning edit path: {variable.winnerHint}
                              </Text>
                            ) : null}
                            {variable.definitions.length > 0 ? (
                              <div className="variable-definition-list">
                                {variable.definitions.map(definition => (
                                  <div
                                    key={`${variable.token}:${definition.layerId}`}
                                    className={definition.winner ? 'variable-definition-row is-winning' : 'variable-definition-row'}
                                  >
                                    <div className="variable-authoring-copy">
                                      <strong>{definition.label}</strong>
                                      <span>{definition.editHint}</span>
                                    </div>
                                    <div className="variable-definition-meta">
                                      <Code>{definition.value || 'empty'}</Code>
                                      <Badge variant="light" color={definition.winner ? 'teal' : 'gray'}>
                                        {definition.winner ? 'winning' : definition.editable ? 'shadowed' : 'inspect only'}
                                      </Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <WorkflowEmptyState
                    title={props.activeRequestName ? 'Preview not ready yet' : 'Select a request'}
                    detail={
                      props.activeRequestName
                        ? 'Resolve the active request preview to inspect variable precedence, conflicts, and edit ownership.'
                        : 'Choose a request to audit variable precedence, missing values, and shadowed definitions.'
                    }
                  />
                )}
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Cross-scope Catalog</Text>
                    <h3 className="section-title">Variable ownership and duplicate names</h3>
                  </div>
                  <Badge color={workflowCatalog.conflictCount > 0 ? 'orange' : 'teal'} variant="light">
                    {workflowCatalog.conflictCount} shadowed · {workflowCatalog.requestLinkedCount} active request
                  </Badge>
                </div>
                <Text size="sm" c="dimmed">
                  Scan project, environment, runtime, and remembered prompt layers together so duplicate names can be cleaned up before they create request-level surprises.
                </Text>
                <div className="summary-grid" style={{ marginTop: 12 }}>
                  <div className="summary-chip">
                    <span>Known Tokens</span>
                    <strong>{workflowCatalog.tokenCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Shadowed</span>
                    <strong>{workflowCatalog.conflictCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Prompt Defaults</span>
                    <strong>{workflowCatalog.promptDefaultCount}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Active Request</span>
                    <strong>{workflowCatalog.requestLinkedCount}</strong>
                  </div>
                </div>
                <div className="variable-workflow-toolbar">
                  <TextInput
                    size="xs"
                    placeholder="Search token or scope"
                    value={workflowQuery}
                    onChange={event => setWorkflowQuery(event.currentTarget.value)}
                  />
                  <Select
                    size="xs"
                    value={workflowFilter}
                    data={[
                      { value: 'all', label: 'All tokens' },
                      { value: 'shadowed', label: 'Shadowed only' },
                      { value: 'active-request', label: 'Active request only' },
                      { value: 'prompt-defaults', label: 'Prompt defaults only' }
                    ]}
                    onChange={value =>
                      setWorkflowFilter((value as 'all' | 'shadowed' | 'active-request' | 'prompt-defaults') || 'all')
                    }
                  />
                </div>
                <div className="variable-workflow-actions">
                  {batchQuickFixActions.map(action => (
                    <Button
                      key={action.key}
                      size="xs"
                      variant="default"
                      color={action.tone === 'danger' ? 'red' : undefined}
                      disabled={action.disabled}
                      onClick={() => {
                        void handleBatchQuickFix(action);
                      }}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
                {filteredWorkflowEntries.length === 0 ? (
                  <div className="empty-tab-state" style={{ marginTop: 12 }}>
                    No variables match this filter yet.
                  </div>
                ) : (
                  <div className="variable-authoring-list">
                    {filteredWorkflowEntries.map(entry => (
                      <div key={entry.token} className="variable-authoring-card">
                        <div className="variable-authoring-head">
                          <div className="variable-authoring-copy">
                            <strong>{entry.token}</strong>
                            <span>
                              {entry.requestLinked
                                ? entry.requestMissing
                                  ? `Referenced by ${variableAudit?.requestName || 'the active request'} but unresolved.`
                                  : `Referenced by ${variableAudit?.requestName || 'the active request'}.`
                                : 'Not currently referenced by the active request.'}
                            </span>
                          </div>
                          <Group gap="xs">
                            <VariableWorkflowQuickFixMenu
                              entry={entry}
                              workflowMutations={props.workflowMutations}
                            />
                            {entry.requestLinked ? (
                              <Badge color={entry.requestMissing ? 'red' : 'blue'} variant="light">
                                {entry.requestMissing ? 'request missing' : 'active request'}
                              </Badge>
                            ) : null}
                            <Badge color={entry.conflict ? 'orange' : entry.hasResolutionSource ? 'teal' : 'gray'} variant="light">
                              {entry.conflict ? 'shadowed' : entry.hasResolutionSource ? 'single source' : 'prompt only'}
                            </Badge>
                            <Code>{entry.winnerValue || 'empty'}</Code>
                          </Group>
                        </div>
                        <Text size="xs" c="dimmed">
                          Current winner: {entry.winnerLabel}. {entry.winnerHint}
                        </Text>
                        {entry.definitions.length > 0 ? (
                          <div className="variable-definition-list">
                            {entry.definitions.map(definition => (
                              <div
                                key={`${entry.token}:${definition.layerId}`}
                                className={definition.winner ? 'variable-definition-row is-winning' : 'variable-definition-row'}
                              >
                                <div className="variable-authoring-copy">
                                  <strong>{definition.label}</strong>
                                  <span>{definition.editHint}</span>
                                </div>
                                <div className="variable-definition-meta">
                                  <Code>{definition.value || 'empty'}</Code>
                                  <Badge
                                    variant="light"
                                    color={definition.winner ? 'teal' : definition.participatesInResolution ? 'gray' : 'blue'}
                                  >
                                    {definition.winner
                                      ? 'winning'
                                      : definition.participatesInResolution
                                        ? definition.editable
                                          ? 'available'
                                          : 'inspect only'
                                        : 'prompt default'}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Shared Layer</Text>
                    <h3 className="section-title">Values that can enter Git</h3>
                  </div>
                </div>
                <Text size="sm" c="dimmed">
                  Keep only safe, collaborative defaults here. Everyone sharing this workspace will see these values.
                </Text>
                <div className="environment-layer-grid">
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Shared Variables</Text>
                    <KeyValueEditor
                      rows={toKeyValueRows(selectedEnvironment.sharedVars || selectedEnvironment.vars || {})}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            sharedVars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                          })
                        )
                      }
                    />
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Shared Headers</Text>
                    <KeyValueEditor
                      rows={selectedEnvironment.sharedHeaders || selectedEnvironment.headers}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            sharedHeaders: rows
                          })
                        )
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Local Layer</Text>
                    <h3 className="section-title">Machine-only sensitive overrides</h3>
                  </div>
                </div>
                <Text size="sm" c="dimmed">
                  These values stay in `{selectedEnvironment.name}.local.yaml` and should not be committed. Use them for tokens, temp hosts, and personal overrides.
                </Text>
                <div className="environment-layer-grid">
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Local Variables</Text>
                    <KeyValueEditor
                      rows={toKeyValueRows(selectedEnvironment.localVars || {})}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            localVars: Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                          })
                        )
                      }
                    />
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Local Headers</Text>
                    <KeyValueEditor
                      rows={selectedEnvironment.localHeaders || []}
                      onChange={rows =>
                        props.onEnvironmentUpdate(selectedEnvironment.name, environment =>
                          rebuildEnvironment(environment, {
                            localHeaders: rows
                          })
                        )
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Auth Profiles</Text>
                    <h3 className="section-title">Reusable environment auth</h3>
                  </div>
                  <Button
                    size="xs"
                    variant="default"
                    onClick={() =>
                      props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                        ...environment,
                        authProfiles: [
                          ...environment.authProfiles,
                          {
                            name: `profile-${environment.authProfiles.length + 1}`,
                            auth: { type: 'bearer', token: '' }
                          }
                        ]
                      }))
                    }
                  >
                    Add Profile
                  </Button>
                </div>
                <Text size="sm" c="dimmed">
                  Separate auth profiles from general variables so requests can reference a durable auth strategy instead of duplicating secret fields.
                </Text>
                {selectedEnvironment.authProfiles.length === 0 ? (
                  <WorkflowEmptyState
                    title="No auth profiles"
                    detail="Add a profile when requests should reference durable bearer, basic, API key, OAuth, or signature credentials without duplicating fields."
                    actionLabel="Add Profile"
                    onAction={() =>
                      props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                        ...environment,
                        authProfiles: [
                          ...environment.authProfiles,
                          {
                            name: `profile-${environment.authProfiles.length + 1}`,
                            auth: { type: 'bearer', token: '' }
                          }
                        ]
                      }))
                    }
                  />
                ) : (
                  <div className="checks-list">
                    {selectedEnvironment.authProfiles.map(profile => (
                      <div key={profile.name} className="check-card" style={{ margin: 0 }}>
                        <div className="settings-grid">
                          <TextInput
                            label="Profile Name"
                            value={profile.name}
                            onChange={event =>
                              props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                ...environment,
                                authProfiles: environment.authProfiles.map(item =>
                                  item.name === profile.name ? { ...item, name: event.currentTarget.value } : item
                                )
                              }))
                            }
                          />
                          <Select
                            label="Auth Type"
                            value={profile.auth.type === 'inherit' ? 'none' : profile.auth.type}
                            data={authTypeOptions()}
                            onChange={value =>
                              props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                ...environment,
                                authProfiles: environment.authProfiles.map(item =>
                                  item.name === profile.name
                                    ? { ...item, auth: { type: (value as AuthConfig['type']) || 'none' } }
                                    : item
                                )
                              }))
                            }
                          />
                          {profile.auth.type === 'bearer' ? (
                            <>
                              <TextInput
                                label="Bearer Token"
                                value={profile.auth.token || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, token: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Token Variable"
                                value={profile.auth.tokenFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                            </>
                          ) : null}
                          {profile.auth.type === 'basic' ? (
                            <>
                              <TextInput
                                label="Username"
                                value={profile.auth.username || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, username: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Password"
                                value={profile.auth.password || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, password: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Username Variable"
                                value={profile.auth.usernameFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, usernameFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Password Variable"
                                value={profile.auth.passwordFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, passwordFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                            </>
                          ) : null}
                          {profile.auth.type === 'apikey' ? (
                            <>
                              <TextInput
                                label="Key"
                                value={profile.auth.key || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, key: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Value"
                                value={profile.auth.value || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, value: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Value Variable"
                                value={profile.auth.valueFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, valueFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <Select
                                label="Send To"
                                value={profile.auth.addTo || 'header'}
                                data={[
                                  { value: 'header', label: 'Header' },
                                  { value: 'query', label: 'Query' }
                                ]}
                                onChange={value =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, addTo: (value as AuthConfig['addTo']) || 'header' } }
                                        : item
                                    )
                                  }))
                                }
                              />
                            </>
                          ) : null}
                          {profile.auth.type === 'oauth2' ? (
                            <>
                              <Select
                                label="OAuth Flow"
                                value={profile.auth.oauthFlow || 'client_credentials'}
                                data={[
                                  { value: 'client_credentials', label: 'client_credentials' },
                                  { value: 'authorization_code', label: 'authorization_code' },
                                  { value: 'password', label: 'password' },
                                  { value: 'implicit', label: 'implicit' }
                                ]}
                                onChange={value =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, oauthFlow: (value as AuthConfig['oauthFlow']) || 'client_credentials' } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              {profile.auth.oauthFlow === 'authorization_code' || profile.auth.oauthFlow === 'implicit' ? (
                                <>
                                  <TextInput
                                    label="Authorization URL"
                                    value={profile.auth.authorizationUrl || ''}
                                    onChange={event =>
                                      props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                        ...environment,
                                        authProfiles: environment.authProfiles.map(item =>
                                          item.name === profile.name
                                            ? { ...item, auth: { ...item.auth, authorizationUrl: event.currentTarget.value } }
                                            : item
                                        )
                                      }))
                                    }
                                  />
                                  <TextInput
                                    label="Callback URL"
                                    value={profile.auth.callbackUrl || ''}
                                    onChange={event =>
                                      props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                        ...environment,
                                        authProfiles: environment.authProfiles.map(item =>
                                          item.name === profile.name
                                            ? { ...item, auth: { ...item.auth, callbackUrl: event.currentTarget.value } }
                                            : item
                                        )
                                      }))
                                    }
                                  />
                                </>
                              ) : null}
                              <TextInput
                                label="Token URL"
                                value={profile.auth.tokenUrl || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenUrl: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client ID"
                                value={profile.auth.clientId || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientId: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client ID Variable"
                                value={profile.auth.clientIdFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientIdFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client Secret"
                                value={profile.auth.clientSecret || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientSecret: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Client Secret Variable"
                                value={profile.auth.clientSecretFromVar || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, clientSecretFromVar: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Scope"
                                value={profile.auth.scope || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, scope: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <Select
                                label="Token Placement"
                                value={profile.auth.tokenPlacement || 'header'}
                                data={[
                                  { value: 'header', label: 'Header' },
                                  { value: 'query', label: 'Query' }
                                ]}
                                onChange={value =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenPlacement: (value as AuthConfig['tokenPlacement']) || 'header' } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Token Name"
                                value={profile.auth.tokenName || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenName: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput
                                label="Token Prefix"
                                value={profile.auth.tokenPrefix || ''}
                                onChange={event =>
                                  props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                    ...environment,
                                    authProfiles: environment.authProfiles.map(item =>
                                      item.name === profile.name
                                        ? { ...item, auth: { ...item.auth, tokenPrefix: event.currentTarget.value } }
                                        : item
                                    )
                                  }))
                                }
                              />
                              <TextInput label="Cached Token" value={profile.auth.accessToken || ''} readOnly />
                              <TextInput label="Cache Expires At" value={profile.auth.expiresAt || ''} readOnly />
                            </>
                          ) : null}
                          {profile.auth.type === 'oauth1' ? (
                            <>
                              <TextInput label="Consumer Key" value={profile.auth.consumerKey || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, consumerKey: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Consumer Secret" value={profile.auth.consumerSecret || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, consumerSecret: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                            </>
                          ) : null}
                          {profile.auth.type === 'awsv4' ? (
                            <>
                              <TextInput label="Access Key" value={profile.auth.accessKey || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, accessKey: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Secret Key" value={profile.auth.secretKey || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, secretKey: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Region" value={profile.auth.region || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, region: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Service" value={profile.auth.service || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, service: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                            </>
                          ) : null}
                          {profile.auth.type === 'digest' || profile.auth.type === 'ntlm' || profile.auth.type === 'wsse' ? (
                            <>
                              <TextInput label="Username" value={profile.auth.username || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, username: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              <TextInput label="Password" value={profile.auth.password || ''} onChange={event =>
                                props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                  ...environment,
                                  authProfiles: environment.authProfiles.map(item =>
                                    item.name === profile.name ? { ...item, auth: { ...item.auth, password: event.currentTarget.value } } : item
                                  )
                                }))
                              } />
                              {profile.auth.type === 'ntlm' ? (
                                <Text size="xs" c="dimmed">
                                  Desktop NTLM uses explicit username/password credentials only. Native OS/integrated enterprise flows are not available in this build.
                                </Text>
                              ) : null}
                              {profile.auth.type === 'digest' ? (
                                <>
                                  <TextInput label="Realm" value={profile.auth.realm || ''} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, realm: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Nonce" value={profile.auth.nonce || ''} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, nonce: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="QOP" value={profile.auth.qop || 'auth'} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, qop: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Algorithm" value={profile.auth.algorithm || 'MD5'} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, algorithm: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Opaque" value={profile.auth.opaque || ''} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, opaque: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Client Nonce" value={profile.auth.cnonce || ''} placeholder="Auto generated" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, cnonce: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Nonce Count" value={profile.auth.nonceCount || '00000001'} onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, nonceCount: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                </>
                              ) : null}
                              {profile.auth.type === 'wsse' ? (
                                <>
                                  <TextInput label="Nonce" value={profile.auth.nonce || ''} placeholder="Auto generated" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, nonce: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Created" value={profile.auth.created || ''} placeholder="Auto generated ISO timestamp" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, created: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                  <TextInput label="Password Digest" value={profile.auth.passwordDigest || ''} placeholder="Optional override" onChange={event =>
                                    props.onEnvironmentUpdate(selectedEnvironment.name, environment => ({
                                      ...environment,
                                      authProfiles: environment.authProfiles.map(item =>
                                        item.name === profile.name ? { ...item, auth: { ...item.auth, passwordDigest: event.currentTarget.value } } : item
                                      )
                                    }))
                                  } />
                                </>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        <Checkbox label="Stored in the selected environment file" checked readOnly />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="inspector-section">
                <div className="checks-head">
                  <div>
                    <Text className="section-kicker">Runtime Layer</Text>
                    <h3 className="section-title">Current session and extracted state</h3>
                  </div>
                  <Group gap="xs">
                    <Button size="xs" variant="default" onClick={props.onClearPromptVars}>Clear Prompt Vars</Button>
                    <Button size="xs" variant="default" onClick={props.onClearRuntimeVars}>Clear Runtime Vars</Button>
                    <Button size="xs" variant="default" color="red" onClick={props.onClearSession}>Clear Cookie Jar</Button>
                  </Group>
                </div>
                <Text size="sm" c="dimmed">
                  Nothing below is durable workspace configuration. These values only describe the current debugging session and can be regenerated.
                </Text>
                <Text size="xs" c="dimmed" mt="sm">
                  Current target URL: {props.targetUrl || 'No active request preview yet'}
                </Text>
                <div className="summary-grid" style={{ marginTop: 12 }}>
                  <div className="summary-chip">
                    <span>Runtime Vars</span>
                    <strong>{runtimeEntries.length}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Prompt Vars</span>
                    <strong>{promptEntries.length}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Cookies</span>
                    <strong>{props.sessionSnapshot?.cookies.length || 0}</strong>
                  </div>
                  <div className="summary-chip">
                    <span>Host Snapshots</span>
                    <strong>{props.hostSnapshots.length}</strong>
                  </div>
                </div>

                <div className="environment-layer-grid" style={{ marginTop: 16 }}>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Remembered Prompt Values</Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Prompt rows still ask before send, but these workspace-scoped values become the default across requests and auth refreshes.
                    </Text>
                    <KeyValueEditor
                      rows={toKeyValueRows(props.promptVariables)}
                      onChange={rows =>
                        props.onPromptVariablesChange(
                          Object.fromEntries(rows.filter(row => row.name.trim()).map(row => [row.name.trim(), row.value]))
                        )
                      }
                    />
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Runtime Variables</Text>
                    {runtimeEntries.length === 0 ? (
                      <WorkflowEmptyState
                        title="No runtime variables"
                        detail="Extract a value from a response when downstream requests should reuse session-only data."
                      />
                    ) : (
                      <div className="json-inspector-list" style={{ marginTop: 12 }}>
                        {runtimeEntries.map(([name, value]) => (
                          <div key={name} className="json-inspector-row">
                            <div className="json-inspector-copy">
                              <strong>{name}</strong>
                              <span>{value}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="check-card" style={{ margin: 0 }}>
                    <Text fw={700}>Current Cookie Header</Text>
                    <Code block style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                      {props.sessionSnapshot?.cookieHeader || ''}
                    </Code>
                  </div>
                </div>

                {props.hostSnapshots.length > 0 ? (
                  <div className="checks-list" style={{ marginTop: 16 }}>
                    {props.hostSnapshots.map(item => (
                      <div key={item.host} className="check-card" style={{ margin: 0 }}>
                        <Text fw={700}>{item.host}</Text>
                        <Text size="xs" c="dimmed">{item.snapshot.cookies.length} cookies captured for this host</Text>
                        <Code block style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                          {item.snapshot.cookieHeader || ''}
                        </Code>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <WorkflowEmptyState
              title="Choose an environment"
              detail="Select or create an environment, then edit shared defaults, local overrides, auth profiles, and runtime session state from one place."
              actionLabel="New Environment"
              onAction={props.onAddEnvironment}
            />
          )}
        </div>
      </div>
    </section>
  );
}

import os
import re

file_path = "index.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

def get_block(start_line_1_idx, end_line_1_idx):
    return "".join(lines[start_line_1_idx-1:end_line_1_idx])

# Core setup (1 to 513)
core_lines = get_block(1, 513)

# Add imports for components
core_imports = """
import { StatisticsPluginPage } from './components/StatisticsPluginPage';
import { AdvancedMockPluginTab } from './components/AdvancedMockPluginTab';
import { ServicesPluginPage } from './components/ServicesPluginPage';
import { SwaggerAutoSyncPluginPage } from './components/SwaggerAutoSyncPluginPage';
import { ProjectWikiPluginPage } from './components/ProjectWikiPluginPage';
import { PluginTestPage } from './components/PluginTestPage';
import { createPostmanImporter } from './importers/createPostmanImporter';
import { createHarImporter } from './importers/createHarImporter';
import { createYapiJsonImporter } from './importers/createYapiJsonImporter';
"""

# Rest of the plugins definitions
plugins_def_lines = get_block(1899, 2051)
# Note: we also have some state/reducer stuff at 1654-1668
reducer_lines = get_block(1654, 1668)

new_index_content = core_lines + core_imports + "\n" + reducer_lines + "\n" + plugins_def_lines

# Components
statistics = get_block(515, 629)
advanced_mock = get_block(631, 1352)
services = get_block(1354, 1421)
auto_sync = get_block(1423, 1560)
wiki = get_block(1562, 1646)
test_page = get_block(1648, 1654)

# Importers
postman = get_block(1670, 1798)
har = get_block(1800, 1872)
yapi = get_block(1874, 1897)

common_imports = """import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Spin, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import json5 from 'json5';
"""

os.makedirs("components", exist_ok=True)
os.makedirs("importers", exist_ok=True)

def write_comp(name, content):
    with open(f"components/{name}.tsx", "w", encoding="utf-8") as f:
        content = content.replace(f"function {name}", f"export function {name}")
        content = content.replace("function AdvancedMockPluginTab", "export function AdvancedMockPluginTab")
        f.write(common_imports + "\n// Extracted from index.tsx\n" + content)

def write_imp(name, content):
    with open(f"importers/{name}.ts", "w", encoding="utf-8") as f:
        content = content.replace(f"function {name}", f"export function {name}")
        idx_imports = "import { ImportDataItem } from '../index';\n"
        f.write(idx_imports + "\n// Extracted from index.tsx\n" + content)

write_comp("StatisticsPluginPage", statistics)
write_comp("AdvancedMockPluginTab", advanced_mock)
write_comp("ServicesPluginPage", services)
write_comp("SwaggerAutoSyncPluginPage", auto_sync)
write_comp("ProjectWikiPluginPage", wiki)
write_comp("PluginTestPage", test_page)

write_imp("createPostmanImporter", postman)
write_imp("createHarImporter", har)
write_imp("createYapiJsonImporter", yapi)

with open("index.tsx", "w", encoding="utf-8") as f:
    f.write(new_index_content)

print("Split complete!")

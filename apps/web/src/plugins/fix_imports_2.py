import os
import glob
import re

# 1. Export webPlugins and the other two missing normalization functions
index_file = "index.tsx"
with open(index_file, "r") as f:
    index_content = f.read()

index_content = index_content.replace("let bootstrapped", "export let bootstrapped")
if "export const webPlugins" not in index_content:
    index_content = index_content.replace("const webPlugins", "export const webPlugins")

with open(index_file, "w") as f:
    f.write(index_content)

# 2. Add Typography imports to components and fix normalization helpers in importers
components = glob.glob("components/*.tsx")
importers = glob.glob("importers/*.ts")

for d in components:
    with open(d, "r") as f:
        content = f.read()
    if "{ Text, Paragraph }" not in content and "Typography" in content:
        content = content.replace("import { Alert", "const { Text, Paragraph } = Typography;\nimport { Alert")
    with open(d, "w") as f:
        f.write(content)

for d in importers:
    with open(d, "r") as f:
        content = f.read()
    if "normalizeSimpleParam" in content and "normalizeSimpleParam" not in index_content:
        # these missing functions need to be added to index.tsx and exported, or just added to utils
        pass

# Add missing helper functions to index.tsx
helpers = """
export function normalizeHeaderRow(value: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      const source = item as Record<string, unknown>;
      return {
        name: toStringValue(source.name),
        value: toStringValue(source.value)
      };
    })
    .filter(item => item.name);
}

export function normalizeSimpleParam(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      const source = item as Record<string, unknown>;
      return {
        name: toStringValue(source.name || source.key),
        value: toStringValue(source.value || source.example),
        required: source.required === '0' ? '0' : '1',
        desc: toStringValue(source.desc || source.description || '')
      };
    })
    .filter(item => item.name);
}
"""

if "normalizeHeaderRow" not in index_content:
    with open(index_file, "a") as f:
        f.write(helpers)

for d in importers:
    with open(d, "r") as f:
        content = f.read()
    # they shouldn't just be exported from plugins/index.tsx, we need to import them
    if "normalizeHeaderRow" not in content and "import {" in content:
        content = content.replace("import {", "import { normalizeHeaderRow, normalizeSimpleParam,")
    with open(d, "w") as f:
        f.write(content)

print("Remaining imports fixed!")

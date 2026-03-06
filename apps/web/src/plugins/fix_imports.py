import os
import glob
import re

# 1. We need to export utilities from index.tsx
index_file = "index.tsx"
with open(index_file, "r") as f:
    index_content = f.read()

# Add exports to utilities
utils_to_export = [
    "safeExecute", "normalizePath", "parseJsonSafe", "parseMaybeJson", 
    "isValidRouteContract", "toObject", "inferPrimitiveSchema", 
    "mergeInferredSchemas", "inferSchemaFromSample", "inferDraft4SchemaTextFromJsonText",
    "toStringValue", "postJson", "getJson", "DRAFT4_SCHEMA_URI"
]

for util in utils_to_export:
    index_content = re.sub(rf"function {util}\b", f"export function {util}", index_content)
    index_content = re.sub(rf"const {util}\b", f"export const {util}", index_content)

with open(index_file, "w") as f:
    f.write(index_content)

# 2. Add imports for utils and types to all components and importers
components = glob.glob("components/*.tsx")
importers = glob.glob("importers/*.ts")

utils_import_str = f"import {{ {', '.join(utils_to_export)} }} from '../index';\n"
types_import_str = "import type { AppRouteContract } from '../../types/route-contract';\n"
types_import_str += "import type { HeaderMenuItem, SubNavItem, SubSettingNavItem, InterfaceTabItem, ImportDataItem, ExportDataItem, RequestLifecycleMeta } from '../index';\n"

for d in components + importers:
    with open(d, "r") as f:
        content = f.read()
    
    # Prepend imports
    if "from '../index'" not in content:
        content = utils_import_str + types_import_str + content
    else:
        # replace existing weak import
        content = re.sub(r"import \{ ImportDataItem \} from '\.\./index';\n", utils_import_str + types_import_str, content)

    with open(d, "w") as f:
        f.write(content)

print("Imports fixed!")

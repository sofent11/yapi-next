import glob

components = glob.glob("apps/web/src/plugins/components/*.tsx")
for f in components:
    with open(f, "r") as file:
        content = file.read()
    
    # Fix export export
    content = content.replace("export export function", "export function")
    
    # Add const { Text, Paragraph } = Typography;
    if "import { Typography" in content and "const { Text" not in content:
        content = content.replace("import { Typography", "import { Typography")
        # Just ensure we have it after imports
        import_end = content.rfind("import ")
        next_newline = content.find("\n", import_end)
        content = content[:next_newline+1] + "\nconst { Text, Paragraph } = Typography;\n" + content[next_newline+1:]
    elif "Typography" in content and "import " in content and "const { Text" not in content:
        # find last import
        import_end = content.rfind("import ")
        next_newline = content.find("\n", import_end)
        content = content[:next_newline+1] + "\nconst { Text, Paragraph } = Typography;\n" + content[next_newline+1:]

    with open(f, "w") as file:
        file.write(content)

importers = glob.glob("apps/web/src/plugins/importers/*.ts")
for f in importers:
    with open(f, "r") as file:
        content = file.read()
    if "import { normalizeHeaderRow" not in content:
        content = content.replace("import { safeExecute", "import { normalizeHeaderRow, normalizeSimpleParam, safeExecute")
    with open(f, "w") as file:
        file.write(content)


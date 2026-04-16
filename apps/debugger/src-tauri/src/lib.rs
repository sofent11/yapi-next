use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE},
    multipart::{Form, Part},
    redirect::Policy,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Instant,
};
use tauri::{
    menu::{Menu, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, Manager, Runtime,
};

static WATCHERS: OnceLock<Mutex<HashMap<String, RecommendedWatcher>>> = OnceLock::new();
static RECENT_ROOTS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

fn watcher_store() -> &'static Mutex<HashMap<String, RecommendedWatcher>> {
    WATCHERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn recent_root_store() -> &'static Mutex<Vec<String>> {
    RECENT_ROOTS.get_or_init(|| Mutex::new(Vec::new()))
}

#[derive(Debug, Clone, Serialize)]
struct WorkspaceScanFile {
    path: String,
    name: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct WorkspaceScanPayload {
    root: String,
    files: Vec<WorkspaceScanFile>,
}

#[derive(Debug, Clone, Serialize)]
struct ImportSourcePayload {
    name: String,
    content: String,
    source_type: String,
}

#[derive(Debug, Clone, Serialize)]
struct WatchEventPayload {
    root: String,
    paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MenuActionPayload {
    action: String,
    root: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportAuth {
    mode: String,
    token: Option<String>,
    key: Option<String>,
    value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ParameterRow {
    name: String,
    value: String,
    enabled: bool,
    #[serde(default = "default_parameter_kind")]
    kind: String,
    file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestBody {
    mode: String,
    mime_type: Option<String>,
    text: String,
    fields: Vec<ParameterRow>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendRequestInput {
    method: String,
    url: String,
    headers: Vec<ParameterRow>,
    query: Vec<ParameterRow>,
    body: RequestBody,
    timeout_ms: Option<u64>,
    follow_redirects: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ResponseHeader {
    name: String,
    value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendRequestResult {
    ok: bool,
    status: u16,
    status_text: String,
    url: String,
    duration_ms: u64,
    size_bytes: usize,
    headers: Vec<ResponseHeader>,
    body_text: String,
    timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResolvedRequestPreview {
    name: String,
    environment_name: Option<String>,
    auth_source: String,
    request_path: String,
    method: String,
    url: String,
    headers: Vec<ParameterRow>,
    query: Vec<ParameterRow>,
    body: RequestBody,
    timeout_ms: Option<u64>,
    follow_redirects: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CheckResult {
    id: String,
    label: String,
    ok: bool,
    message: String,
    expected: Option<String>,
    actual: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunHistoryEntry {
    id: String,
    workspace_root: String,
    request_id: String,
    request_name: String,
    case_id: Option<String>,
    case_name: Option<String>,
    environment_name: Option<String>,
    request: ResolvedRequestPreview,
    response: SendRequestResult,
    check_results: Vec<CheckResult>,
}

fn default_parameter_kind() -> String {
    "text".into()
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn history_file_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
    Ok(cache_dir.join("request-history.json"))
}

fn load_history_entries<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<RunHistoryEntry>, String> {
    let file_path = history_file_path(app)?;
    if !file_path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(file_path).map_err(|error| error.to_string())?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn save_history_entries<R: Runtime>(
    app: &AppHandle<R>,
    entries: &[RunHistoryEntry],
) -> Result<(), String> {
    let file_path = history_file_path(app)?;
    let content = serde_json::to_string_pretty(entries).map_err(|error| error.to_string())?;
    fs::write(file_path, content).map_err(|error| error.to_string())
}

fn is_workspace_text_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    if name == ".gitignore" {
        return true;
    }
    matches!(
        path.extension().and_then(|value| value.to_str()),
        Some("yaml") | Some("yml") | Some("json") | Some("txt")
    )
}

fn should_skip_dir(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    matches!(name, ".git" | "node_modules" | "target" | "dist" | ".yapi-debugger-cache")
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, recent_roots: &[String], has_workspace: bool) -> Result<Menu<R>, String> {
    let menu = Menu::new(app).map_err(|error| error.to_string())?;

    let mut recent_builder = SubmenuBuilder::new(app, "Recent Workspaces");
    if recent_roots.is_empty() {
        recent_builder = recent_builder.text("menu://file/open-recent/empty", "No Recent Workspaces").enabled(false);
    } else {
        for (index, root) in recent_roots.iter().enumerate() {
            let label = root
                .split('/')
                .last()
                .filter(|item| !item.is_empty())
                .map(|item| format!("{item}  ({root})"))
                .unwrap_or_else(|| root.clone());
            recent_builder =
                recent_builder.text(format!("menu://file/open-recent/{index}"), label);
        }
    }
    let recent_menu = recent_builder.build().map_err(|error| error.to_string())?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .text("menu://file/open-workspace", "Open Workspace...")
        .text("menu://file/create-workspace", "Create Workspace...")
        .separator()
        .item(
            &MenuItemBuilder::with_id("menu://file/import-project", "Import Into Project...")
                .enabled(has_workspace)
                .build(app)
                .map_err(|error| error.to_string())?,
        )
        .item(
            &MenuItemBuilder::with_id("menu://file/close-workspace", "Close Workspace")
                .enabled(has_workspace)
                .build(app)
                .map_err(|error| error.to_string())?,
        )
        .separator()
        .item(&recent_menu)
        .build()
        .map_err(|error| error.to_string())?;

    menu.append(&file_menu).map_err(|error| error.to_string())?;
    Ok(menu)
}

fn emit_menu_action<R: Runtime>(app: &AppHandle<R>, action: &str, root: Option<String>) {
    let _ = app.emit(
        "menu://action",
        MenuActionPayload {
            action: action.to_string(),
            root,
        },
    );
}

fn collect_workspace_files(root: &Path, files: &mut Vec<WorkspaceScanFile>) -> Result<(), String> {
    let entries = fs::read_dir(root).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            if should_skip_dir(&path) {
                continue;
            }
            collect_workspace_files(&path, files)?;
            continue;
        }
        if !is_workspace_text_file(&path) {
            continue;
        }
        let content = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        files.push(WorkspaceScanFile {
            path: normalize_path(&path.to_string_lossy()),
            name: path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string(),
            content,
        });
    }
    Ok(())
}

#[tauri::command]
fn workspace_scan(root: String) -> Result<WorkspaceScanPayload, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Err("Workspace root does not exist".into());
    }
    let mut files = Vec::new();
    collect_workspace_files(&root_path, &mut files)?;
    Ok(WorkspaceScanPayload {
        root: normalize_path(&root),
        files,
    })
}

#[tauri::command]
fn workspace_read_document(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn workspace_write_document(path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(target, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn workspace_rename_entry(from: String, to: String) -> Result<(), String> {
    let target = PathBuf::from(&to);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::rename(from, target).map_err(|error| error.to_string())
}

#[tauri::command]
fn workspace_delete_entry(path: String, recursive: bool) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Ok(());
    }
    if target.is_dir() {
        if recursive {
            fs::remove_dir_all(target).map_err(|error| error.to_string())
        } else {
            fs::remove_dir(target).map_err(|error| error.to_string())
        }
    } else {
        fs::remove_file(target).map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn import_read_file(path: String) -> Result<ImportSourcePayload, String> {
    let target = PathBuf::from(&path);
    let content = fs::read_to_string(&target).map_err(|error| error.to_string())?;
    Ok(ImportSourcePayload {
        name: target
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("import.txt")
            .to_string(),
        content,
        source_type: "file".into(),
    })
}

#[tauri::command]
async fn import_fetch_url(url: String, auth: ImportAuth) -> Result<ImportSourcePayload, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?;

    let mut request = client.get(&url);
    match auth.mode.as_str() {
        "bearer" => {
            if let Some(token) = auth.token {
                request = request.bearer_auth(token);
            }
        }
        "header" => {
            if let (Some(key), Some(value)) = (auth.key, auth.value) {
                request = request.header(key, value);
            }
        }
        "query" => {
            if let (Some(key), Some(value)) = (auth.key, auth.value) {
                request = request.query(&[(key, value)]);
            }
        }
        _ => {}
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    let content = response.text().await.map_err(|error| error.to_string())?;
    let name = url
        .split('/')
        .last()
        .filter(|item| !item.is_empty())
        .unwrap_or("remote-spec.json")
        .to_string();
    Ok(ImportSourcePayload {
        name,
        content,
        source_type: "url".into(),
    })
}

#[tauri::command]
fn workspace_watch(app: AppHandle, root: String) -> Result<(), String> {
    let root_path = PathBuf::from(&root);
    let event_root = normalize_path(&root);
    let app_handle = app.clone();

    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if let Ok(change) = event {
            let payload = WatchEventPayload {
                root: event_root.clone(),
                paths: change
                    .paths
                    .iter()
                    .map(|path| normalize_path(&path.to_string_lossy()))
                    .collect(),
            };
            let _ = app_handle.emit("workspace://changed", payload);
        }
    })
    .map_err(|error| error.to_string())?;

    watcher
        .watch(&root_path, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    watcher_store()
        .lock()
        .map_err(|_| "watcher store poisoned".to_string())?
        .insert(normalize_path(&root), watcher);

    Ok(())
}

#[tauri::command]
fn workspace_unwatch(root: String) -> Result<(), String> {
    watcher_store()
        .lock()
        .map_err(|_| "watcher store poisoned".to_string())?
        .remove(&normalize_path(&root));
    Ok(())
}

#[tauri::command]
fn menu_sync_state(app: AppHandle, recent_roots: Vec<String>, has_workspace: bool) -> Result<(), String> {
    *recent_root_store()
        .lock()
        .map_err(|_| "recent root store poisoned".to_string())? = recent_roots.clone();
    app.set_menu(build_menu(&app, &recent_roots, has_workspace).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn history_load(app: AppHandle, workspace_root: Option<String>) -> Result<Vec<RunHistoryEntry>, String> {
    let entries = load_history_entries(&app)?;
    if let Some(root) = workspace_root {
        let normalized = normalize_path(&root);
        return Ok(entries
            .into_iter()
            .filter(|entry| normalize_path(&entry.workspace_root) == normalized)
            .collect());
    }
    Ok(entries)
}

#[tauri::command]
fn history_append(app: AppHandle, entry: RunHistoryEntry) -> Result<(), String> {
    let mut entries = load_history_entries(&app)?;
    entries.insert(0, entry);
    if entries.len() > 200 {
        entries.truncate(200);
    }
    save_history_entries(&app, &entries)
}

#[tauri::command]
fn history_clear(app: AppHandle, workspace_root: Option<String>) -> Result<(), String> {
    if let Some(root) = workspace_root {
        let normalized = normalize_path(&root);
        let next_entries = load_history_entries(&app)?
            .into_iter()
            .filter(|entry| normalize_path(&entry.workspace_root) != normalized)
            .collect::<Vec<_>>();
        return save_history_entries(&app, &next_entries);
    }

    save_history_entries(&app, &[])
}

fn header_map(rows: &[ParameterRow], body: &RequestBody) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    for row in rows.iter().filter(|row| row.enabled && !row.name.trim().is_empty()) {
        let name = HeaderName::from_bytes(row.name.trim().as_bytes()).map_err(|error| error.to_string())?;
        let value = HeaderValue::from_str(row.value.trim()).map_err(|error| error.to_string())?;
        headers.append(name, value);
    }
    if !headers.contains_key(CONTENT_TYPE) {
        if let Some(mime_type) = &body.mime_type {
            if !mime_type.trim().is_empty() {
                let value = HeaderValue::from_str(mime_type.trim()).map_err(|error| error.to_string())?;
                headers.insert(CONTENT_TYPE, value);
                return Ok(headers);
            }
        }
        match body.mode.as_str() {
            "json" => {
                headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
            }
            "form-urlencoded" => {
                headers.insert(
                    CONTENT_TYPE,
                    HeaderValue::from_static("application/x-www-form-urlencoded"),
                );
            }
            _ => {}
        }
    }
    Ok(headers)
}

fn multipart_form(fields: &[ParameterRow]) -> Result<Form, String> {
    let mut form = Form::new();
    for row in fields
        .iter()
        .filter(|row| row.enabled && !row.name.trim().is_empty())
    {
        if row.kind == "file" {
            let file_path = row
                .file_path
                .clone()
                .or_else(|| (!row.value.trim().is_empty()).then(|| row.value.clone()))
                .ok_or_else(|| format!("Multipart field {} is missing a file path", row.name))?;
            let bytes = fs::read(&file_path).map_err(|error| error.to_string())?;
            let file_name = PathBuf::from(&file_path)
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("upload.bin")
                .to_string();
            let part = Part::bytes(bytes).file_name(file_name);
            form = form.part(row.name.clone(), part);
            continue;
        }

        form = form.text(row.name.clone(), row.value.clone());
    }
    Ok(form)
}

#[tauri::command]
async fn request_send(input: SendRequestInput) -> Result<SendRequestResult, String> {
    let method = input
        .method
        .parse::<reqwest::Method>()
        .map_err(|error| error.to_string())?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(input.timeout_ms.unwrap_or(30_000)))
        .redirect(if input.follow_redirects.unwrap_or(true) {
            Policy::limited(10)
        } else {
            Policy::none()
        })
        .build()
        .map_err(|error| error.to_string())?;

    let start = Instant::now();
    let mut request = client.request(method, &input.url);
    request = request.headers(header_map(&input.headers, &input.body)?);

    let query: Vec<(String, String)> = input
        .query
        .iter()
        .filter(|row| row.enabled && !row.name.trim().is_empty())
        .map(|row| (row.name.clone(), row.value.clone()))
        .collect();
    if !query.is_empty() {
        request = request.query(&query);
    }

    match input.body.mode.as_str() {
        "json" | "text" => {
            if !input.body.text.is_empty() {
                request = request.body(input.body.text.clone());
            }
        }
        "form-urlencoded" => {
            let form: Vec<(String, String)> = input
                .body
                .fields
                .iter()
                .filter(|row| row.enabled && !row.name.trim().is_empty())
                .map(|row| (row.name.clone(), row.value.clone()))
                .collect();
            if !form.is_empty() {
                request = request.form(&form);
            }
        }
        "multipart" => {
            let form = multipart_form(&input.body.fields)?;
            request = request.multipart(form);
        }
        _ => {}
    }

    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let url = response.url().to_string();
    let headers = response
        .headers()
        .iter()
        .map(|(name, value)| ResponseHeader {
            name: name.to_string(),
            value: value.to_str().unwrap_or_default().to_string(),
        })
        .collect::<Vec<_>>();
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    let duration_ms = start.elapsed().as_millis() as u64;
    let body_text = String::from_utf8_lossy(&bytes).to_string();

    Ok(SendRequestResult {
        ok: status.is_success(),
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or_default().to_string(),
        url,
        duration_ms,
        size_bytes: bytes.len(),
        headers,
        body_text,
        timestamp: chrono_timestamp(),
    })
}

fn chrono_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    now.to_string()
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let initial_menu = build_menu(&app.handle(), &[], false)?;
            app.set_menu(initial_menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            match id {
                "menu://file/open-workspace" => emit_menu_action(app, "open-workspace", None),
                "menu://file/create-workspace" => emit_menu_action(app, "create-workspace", None),
                "menu://file/import-project" => emit_menu_action(app, "import-project", None),
                "menu://file/close-workspace" => emit_menu_action(app, "close-workspace", None),
                value if value.starts_with("menu://file/open-recent/") => {
                    let index = value
                        .trim_start_matches("menu://file/open-recent/")
                        .parse::<usize>()
                        .ok();
                    let root = index.and_then(|position| {
                        recent_root_store()
                            .lock()
                            .ok()
                            .and_then(|items| items.get(position).cloned())
                    });
                    if let Some(root) = root {
                        emit_menu_action(app, "open-recent", Some(root));
                    }
                }
                _ => {}
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            menu_sync_state,
            workspace_scan,
            workspace_read_document,
            workspace_write_document,
            workspace_rename_entry,
            workspace_delete_entry,
            workspace_watch,
            workspace_unwatch,
            import_read_file,
            import_fetch_url,
            history_load,
            history_append,
            history_clear,
            request_send
        ])
        .run(tauri::generate_context!())
        .expect("error while running yapi debugger");
}

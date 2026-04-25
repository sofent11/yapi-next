mod capture;

use base64::{engine::general_purpose, Engine as _};
use futures_util::{SinkExt, StreamExt};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use prost::Message as ProstMessage;
use prost_reflect::{DescriptorPool, DynamicMessage, MessageDescriptor};
use reqwest::{
    cookie::{CookieStore, Jar},
    header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE},
    multipart::{Form, Part},
    redirect::Policy,
    Client, Url,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    str::FromStr,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Emitter, Manager, Runtime,
};
use tokio_tungstenite::tungstenite::{
    client::IntoClientRequest,
    http::header::{HeaderName as WsHeaderName, HeaderValue as WsHeaderValue},
    Message,
};
use tonic::{
    client::Grpc,
    codec::{BufferSettings, Codec, DecodeBuf, Decoder, EncodeBuf, Encoder},
    codegen::http::uri::PathAndQuery,
    metadata::{Ascii, MetadataKey, MetadataValue},
    transport::Endpoint,
    Code as GrpcCode, Request as GrpcRequest, Status,
};

static WATCHERS: OnceLock<Mutex<HashMap<String, RecommendedWatcher>>> = OnceLock::new();
static RECENT_ROOTS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
static SESSION_JARS: OnceLock<Mutex<HashMap<String, Arc<Jar>>>> = OnceLock::new();
static SESSION_CLIENTS: OnceLock<Mutex<HashMap<String, Client>>> = OnceLock::new();
static WEBSOCKET_LIVE_SESSIONS: OnceLock<Mutex<HashMap<String, WebSocketLiveSession>>> =
    OnceLock::new();

fn watcher_store() -> &'static Mutex<HashMap<String, RecommendedWatcher>> {
    WATCHERS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn recent_root_store() -> &'static Mutex<Vec<String>> {
    RECENT_ROOTS.get_or_init(|| Mutex::new(Vec::new()))
}

fn session_jar_store() -> &'static Mutex<HashMap<String, Arc<Jar>>> {
    SESSION_JARS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn session_client_store() -> &'static Mutex<HashMap<String, Client>> {
    SESSION_CLIENTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn websocket_live_session_store() -> &'static Mutex<HashMap<String, WebSocketLiveSession>> {
    WEBSOCKET_LIVE_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
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
struct GrpcBody {
    proto_file: Option<String>,
    #[serde(default)]
    import_paths: Vec<String>,
    service: Option<String>,
    method: Option<String>,
    #[serde(default = "default_grpc_rpc_kind")]
    rpc_kind: String,
    #[serde(default)]
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestBody {
    mode: String,
    mime_type: Option<String>,
    text: String,
    file: Option<String>,
    fields: Vec<ParameterRow>,
    #[serde(default)]
    grpc: Option<GrpcBody>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GrpcRuntimeKind {
    Unary,
    ServerStreaming,
}

impl GrpcRuntimeKind {
    fn rpc_kind(self) -> &'static str {
        match self {
            Self::Unary => "unary",
            Self::ServerStreaming => "server-streaming",
        }
    }

    fn runtime_header(self) -> &'static str {
        match self {
            Self::Unary => "grpc",
            Self::ServerStreaming => "grpc-server-streaming",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendRequestInput {
    method: String,
    url: String,
    headers: Vec<ParameterRow>,
    query: Vec<ParameterRow>,
    body: RequestBody,
    session_id: Option<String>,
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
    body_base64: Option<String>,
    timestamp: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebSocketMessageInput {
    name: String,
    body: String,
    kind: Option<String>,
    enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebSocketRunInput {
    url: String,
    headers: Vec<ParameterRow>,
    messages: Vec<WebSocketMessageInput>,
    timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebSocketLiveConnectInput {
    url: String,
    headers: Vec<ParameterRow>,
    timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebSocketLiveSendInput {
    session_id: String,
    message: WebSocketMessageInput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebSocketTimelineEvent {
    direction: String,
    label: String,
    body: String,
    elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebSocketRunResult {
    ok: bool,
    url: String,
    duration_ms: u64,
    events: Vec<WebSocketTimelineEvent>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WebSocketLiveSnapshot {
    ok: bool,
    session_id: String,
    url: String,
    duration_ms: u64,
    events: Vec<WebSocketTimelineEvent>,
}

#[derive(Debug, Clone)]
struct WebSocketLiveSession {
    session_id: String,
    url: String,
    started_at: Instant,
    events: Arc<Mutex<Vec<WebSocketTimelineEvent>>>,
    command_tx: tokio::sync::mpsc::UnboundedSender<WebSocketLiveCommand>,
}

#[derive(Debug, Clone)]
enum WebSocketLiveCommand {
    Send(WebSocketMessageInput),
    Close,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionCookie {
    name: String,
    value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionSnapshot {
    session_id: String,
    url: Option<String>,
    cookie_header: String,
    cookies: Vec<SessionCookie>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitStatusPayload {
    branch: String,
    is_repo: bool,
    dirty: bool,
    ahead: usize,
    behind: usize,
    changed_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCloneProgressPayload {
    clone_id: String,
    stage: String,
    message: String,
    target_path: Option<String>,
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
    #[serde(default = "default_check_result_source")]
    source: String,
}

fn default_check_result_source() -> String {
    "builtin".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ScriptLog {
    phase: String,
    #[serde(default = "default_script_log_level")]
    level: String,
    message: String,
}

fn default_script_log_level() -> String {
    "log".into()
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
    #[serde(default)]
    check_results: Vec<CheckResult>,
    #[serde(default)]
    script_logs: Vec<ScriptLog>,
    #[serde(default)]
    source_collection_id: Option<String>,
    #[serde(default)]
    source_collection_name: Option<String>,
    #[serde(default)]
    source_step_key: Option<String>,
}

fn default_parameter_kind() -> String {
    "text".into()
}

fn default_grpc_rpc_kind() -> String {
    "unary".into()
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

fn collection_report_file_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
    Ok(cache_dir.join("collection-reports.json"))
}

fn load_collection_reports<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Vec<serde_json::Value>, String> {
    let file_path = collection_report_file_path(app)?;
    if !file_path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(file_path).map_err(|error| error.to_string())?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn save_collection_reports<R: Runtime>(
    app: &AppHandle<R>,
    reports: &[serde_json::Value],
) -> Result<(), String> {
    let file_path = collection_report_file_path(app)?;
    let content = serde_json::to_string_pretty(reports).map_err(|error| error.to_string())?;
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
        Some("yaml") | Some("yml") | Some("json") | Some("txt") | Some("bru")
    )
}

fn should_skip_dir(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    matches!(
        name,
        ".git" | "node_modules" | "target" | "dist" | ".yapi-debugger-cache"
    )
}

fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    recent_roots: &[String],
    has_workspace: bool,
) -> Result<Menu<R>, String> {
    let menu = Menu::new(app).map_err(|error| error.to_string())?;

    let mut recent_builder = SubmenuBuilder::new(app, "Recent Workspaces");
    if recent_roots.is_empty() {
        recent_builder = recent_builder
            .text("menu://file/open-recent/empty", "No Recent Workspaces")
            .enabled(false);
    } else {
        for (index, root) in recent_roots.iter().enumerate() {
            let label = root
                .split('/')
                .last()
                .filter(|item| !item.is_empty())
                .map(|item| format!("{item}  ({root})"))
                .unwrap_or_else(|| root.clone());
            recent_builder = recent_builder.text(format!("menu://file/open-recent/{index}"), label);
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

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None).map_err(|error| error.to_string())?)
        .item(&PredefinedMenuItem::redo(app, None).map_err(|error| error.to_string())?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None).map_err(|error| error.to_string())?)
        .item(&PredefinedMenuItem::copy(app, None).map_err(|error| error.to_string())?)
        .item(&PredefinedMenuItem::paste(app, None).map_err(|error| error.to_string())?)
        .item(&PredefinedMenuItem::select_all(app, None).map_err(|error| error.to_string())?)
        .build()
        .map_err(|error| error.to_string())?;

    menu.append(&file_menu).map_err(|error| error.to_string())?;
    menu.append(&edit_menu).map_err(|error| error.to_string())?;
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
fn menu_sync_state(
    app: AppHandle,
    recent_roots: Vec<String>,
    has_workspace: bool,
) -> Result<(), String> {
    *recent_root_store()
        .lock()
        .map_err(|_| "recent root store poisoned".to_string())? = recent_roots.clone();
    app.set_menu(
        build_menu(&app, &recent_roots, has_workspace).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn history_load(
    app: AppHandle,
    workspace_root: Option<String>,
) -> Result<Vec<RunHistoryEntry>, String> {
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

#[tauri::command]
fn collection_report_load(
    app: AppHandle,
    workspace_root: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let reports = load_collection_reports(&app)?;
    if let Some(root) = workspace_root {
        let normalized = normalize_path(&root);
        return Ok(reports
            .into_iter()
            .filter(|report| {
                report
                    .get("workspaceRoot")
                    .and_then(|value| value.as_str())
                    .map(|value| normalize_path(value) == normalized)
                    .unwrap_or(false)
            })
            .collect());
    }
    Ok(reports)
}

#[tauri::command]
fn collection_report_append(app: AppHandle, report: serde_json::Value) -> Result<(), String> {
    let mut reports = load_collection_reports(&app)?;
    reports.insert(0, report);
    if reports.len() > 100 {
        reports.truncate(100);
    }
    save_collection_reports(&app, &reports)
}

#[tauri::command]
fn collection_report_clear(app: AppHandle, workspace_root: Option<String>) -> Result<(), String> {
    if let Some(root) = workspace_root {
        let normalized = normalize_path(&root);
        let next_reports = load_collection_reports(&app)?
            .into_iter()
            .filter(|report| {
                report
                    .get("workspaceRoot")
                    .and_then(|value| value.as_str())
                    .map(|value| normalize_path(value) != normalized)
                    .unwrap_or(true)
            })
            .collect::<Vec<_>>();
        return save_collection_reports(&app, &next_reports);
    }

    save_collection_reports(&app, &[])
}

fn build_http_client(
    jar: Arc<Jar>,
    timeout_ms: u64,
    follow_redirects: bool,
) -> Result<Client, String> {
    reqwest::Client::builder()
        .cookie_provider(jar)
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .redirect(if follow_redirects {
            Policy::limited(10)
        } else {
            Policy::none()
        })
        .build()
        .map_err(|error| error.to_string())
}

fn session_jar(session_id: &str) -> Result<Arc<Jar>, String> {
    let mut store = session_jar_store()
        .lock()
        .map_err(|_| "session jar store poisoned".to_string())?;
    if let Some(existing) = store.get(session_id) {
        return Ok(existing.clone());
    }
    let jar = Arc::new(Jar::default());
    store.insert(session_id.to_string(), jar.clone());
    Ok(jar)
}

fn parse_cookie_header(header: &str) -> Vec<SessionCookie> {
    header
        .split(';')
        .filter_map(|part| {
            let trimmed = part.trim();
            if trimmed.is_empty() {
                return None;
            }
            let mut pieces = trimmed.splitn(2, '=');
            let name = pieces.next()?.trim();
            let value = pieces.next().unwrap_or_default().trim();
            if name.is_empty() {
                return None;
            }
            Some(SessionCookie {
                name: name.to_string(),
                value: value.to_string(),
            })
        })
        .collect()
}

fn run_git(root: &str, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|error| error.to_string())
}

fn git_display_path(path: &str) -> String {
    path.split(" -> ").last().unwrap_or(path).trim().to_string()
}

fn null_device() -> &'static str {
    #[cfg(target_family = "windows")]
    {
        "NUL"
    }
    #[cfg(not(target_family = "windows"))]
    {
        "/dev/null"
    }
}

fn emit_git_clone_progress<R: Runtime>(
    app: &AppHandle<R>,
    clone_id: &str,
    stage: &str,
    message: impl Into<String>,
    target_path: Option<String>,
) {
    let _ = app.emit(
        "git://clone-progress",
        GitCloneProgressPayload {
            clone_id: clone_id.to_string(),
            stage: stage.to_string(),
            message: message.into(),
            target_path,
        },
    );
}

fn format_git_clone_error(stderr: &str) -> String {
    let trimmed = stderr.trim();
    let detail = trimmed
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("git clone failed")
        .trim();
    let normalized = trimmed.to_ascii_lowercase();
    let auth_error = normalized.contains("authentication failed")
        || normalized.contains("terminal prompts disabled")
        || normalized.contains("could not read username")
        || normalized.contains("permission denied (publickey)")
        || normalized.contains("repository not found")
        || normalized.contains("access denied");

    if auth_error {
        return format!(
            "Clone authentication failed. This desktop flow does not open an interactive git prompt, so use an SSH remote or configure HTTPS credentials/PAT in your git credential helper first. Detail: {detail}"
        );
    }

    detail.to_string()
}

#[tauri::command]
fn git_status(root: String) -> Result<GitStatusPayload, String> {
    let branch_output = run_git(&root, &["status", "--short", "--branch"])?;
    if !branch_output.status.success() {
        return Ok(GitStatusPayload {
            branch: String::new(),
            is_repo: false,
            dirty: false,
            ahead: 0,
            behind: 0,
            changed_files: Vec::new(),
        });
    }

    let stdout = String::from_utf8_lossy(&branch_output.stdout);
    let mut lines = stdout.lines();
    let branch_line = lines.next().unwrap_or_default();
    let branch = branch_line
        .strip_prefix("## ")
        .unwrap_or(branch_line)
        .split("...")
        .next()
        .unwrap_or_default()
        .trim()
        .to_string();
    let ahead = branch_line
        .split("ahead ")
        .nth(1)
        .and_then(|value| value.split(']').next())
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let behind = branch_line
        .split("behind ")
        .nth(1)
        .and_then(|value| value.split(']').next())
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let changed_files = lines
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.len() < 4 {
                return None;
            }
            Some(trimmed[3..].trim().to_string())
        })
        .collect::<Vec<_>>();

    Ok(GitStatusPayload {
        branch,
        is_repo: true,
        dirty: !changed_files.is_empty(),
        ahead,
        behind,
        changed_files,
    })
}

#[tauri::command]
fn git_pull(root: String) -> Result<String, String> {
    let output = run_git(&root, &["pull", "--ff-only"])?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

#[tauri::command]
fn git_push(root: String) -> Result<String, String> {
    let output = run_git(&root, &["push"])?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
}

#[tauri::command]
fn git_diff(root: String, path: String) -> Result<String, String> {
    let normalized_path = git_display_path(&path);
    let mut sections = Vec::new();

    let unstaged = run_git(&root, &["--no-pager", "diff", "--", &normalized_path])?;
    if !unstaged.stdout.is_empty() {
        sections.push(String::from_utf8_lossy(&unstaged.stdout).trim().to_string());
    }

    let staged = run_git(
        &root,
        &["--no-pager", "diff", "--cached", "--", &normalized_path],
    )?;
    if !staged.stdout.is_empty() {
        sections.push(String::from_utf8_lossy(&staged.stdout).trim().to_string());
    }

    if sections.is_empty() {
        let absolute_path = PathBuf::from(&root).join(&normalized_path);
        let untracked = Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(["--no-pager", "diff", "--no-index", "--", null_device()])
            .arg(&absolute_path)
            .output()
            .map_err(|error| error.to_string())?;
        if !untracked.stdout.is_empty() {
            sections.push(
                String::from_utf8_lossy(&untracked.stdout)
                    .trim()
                    .to_string(),
            );
        }
    }

    if sections.is_empty() {
        return Ok(format!("No diff available for {}", normalized_path));
    }

    Ok(sections.join("\n\n"))
}

#[tauri::command]
fn git_clone(
    app: AppHandle,
    parent: String,
    repo_url: String,
    folder_name: String,
    clone_id: Option<String>,
) -> Result<String, String> {
    let parent_path = PathBuf::from(&parent);
    if !parent_path.exists() {
        return Err("Clone parent directory does not exist".into());
    }
    let folder = folder_name.trim();
    if folder.is_empty() {
        return Err("Clone folder name cannot be empty".into());
    }
    let target = parent_path.join(folder);
    if target.exists() {
        return Err("Clone target already exists".into());
    }
    let clone_id = clone_id.unwrap_or_else(|| normalize_path(&target.to_string_lossy()));
    let normalized_target = normalize_path(&target.to_string_lossy());
    emit_git_clone_progress(
        &app,
        &clone_id,
        "starting",
        format!("Preparing clone into {}", folder),
        Some(normalized_target.clone()),
    );

    let mut child = Command::new("git")
        .arg("clone")
        .arg("--progress")
        .arg(repo_url.trim())
        .arg(&target)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture git clone stderr".to_string())?;
    let progress_log = Arc::new(Mutex::new(Vec::<String>::new()));
    let progress_log_handle = Arc::clone(&progress_log);
    let progress_app = app.clone();
    let progress_clone_id = clone_id.clone();
    let progress_target = normalized_target.clone();
    let stderr_thread = std::thread::spawn(move || {
        let mut stream = stderr;
        let mut buffer = [0_u8; 1024];
        let mut pending = String::new();

        loop {
            match stream.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    pending.push_str(&String::from_utf8_lossy(&buffer[..read]));
                    loop {
                        let Some((index, separator)) = pending
                            .char_indices()
                            .find(|(_, ch)| *ch == '\r' || *ch == '\n')
                        else {
                            break;
                        };
                        let line = pending[..index].trim().to_string();
                        pending.drain(..index + separator.len_utf8());
                        if line.is_empty() {
                            continue;
                        }
                        if let Ok(mut log) = progress_log_handle.lock() {
                            log.push(line.clone());
                        }
                        emit_git_clone_progress(
                            &progress_app,
                            &progress_clone_id,
                            "progress",
                            line,
                            Some(progress_target.clone()),
                        );
                    }
                }
                Err(error) => {
                    let message = format!("Failed to read git clone progress: {error}");
                    if let Ok(mut log) = progress_log_handle.lock() {
                        log.push(message.clone());
                    }
                    emit_git_clone_progress(
                        &progress_app,
                        &progress_clone_id,
                        "error",
                        message,
                        Some(progress_target.clone()),
                    );
                    break;
                }
            }
        }

        let tail = pending.trim().to_string();
        if !tail.is_empty() {
            if let Ok(mut log) = progress_log_handle.lock() {
                log.push(tail.clone());
            }
            emit_git_clone_progress(
                &progress_app,
                &progress_clone_id,
                "progress",
                tail,
                Some(progress_target),
            );
        }
    });

    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    let _ = stderr_thread.join();
    if !output.status.success() {
        let stderr = progress_log
            .lock()
            .ok()
            .map(|log| log.join("\n"))
            .unwrap_or_default();
        let message = format_git_clone_error(&stderr);
        emit_git_clone_progress(
            &app,
            &clone_id,
            "error",
            message.clone(),
            Some(normalized_target),
        );
        return Err(message);
    }

    emit_git_clone_progress(
        &app,
        &clone_id,
        "complete",
        format!("Clone complete: {}", folder),
        Some(normalized_target.clone()),
    );
    Ok(normalized_target)
}

#[tauri::command]
fn open_terminal(root: String) -> Result<(), String> {
    let root_path = PathBuf::from(&root);
    if !root_path.exists() {
        return Err("Workspace root does not exist".into());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Terminal", &root])
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let launchers = [
            (
                "x-terminal-emulator",
                vec![format!("--working-directory={root}")],
            ),
            (
                "gnome-terminal",
                vec![format!("--working-directory={root}")],
            ),
            ("konsole", vec!["--workdir".into(), root.clone()]),
            (
                "xfce4-terminal",
                vec!["--working-directory".into(), root.clone()],
            ),
        ];

        for (program, args) in launchers {
            if Command::new(program).args(&args).spawn().is_ok() {
                return Ok(());
            }
        }
        return Err("No supported terminal launcher was found".into());
    }

    #[cfg(target_os = "windows")]
    {
        if Command::new("cmd")
            .args(["/C", "start", "", "wt", "-d", &root])
            .spawn()
            .is_ok()
        {
            return Ok(());
        }

        let escaped = root.replace('\'', "''");
        Command::new("powershell")
            .args([
                "-NoExit",
                "-Command",
                &format!("Set-Location -LiteralPath '{escaped}'"),
            ])
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Opening a terminal is not supported on this platform".into())
}

#[tauri::command]
fn session_inspect(session_id: String, url: Option<String>) -> Result<SessionSnapshot, String> {
    let normalized = normalize_path(&session_id);
    let cookie_header = if let Some(raw_url) = url.as_ref().filter(|value| !value.trim().is_empty())
    {
        let parsed = Url::parse(raw_url).map_err(|error| error.to_string())?;
        let jar = session_jar(&normalized)?;
        jar.cookies(&parsed)
            .and_then(|value| value.to_str().ok().map(|header| header.to_string()))
            .unwrap_or_default()
    } else {
        String::new()
    };

    Ok(SessionSnapshot {
        session_id: normalized,
        url,
        cookie_header: cookie_header.clone(),
        cookies: parse_cookie_header(&cookie_header),
    })
}

#[tauri::command]
fn session_clear(session_id: String) -> Result<(), String> {
    let normalized = normalize_path(&session_id);
    session_jar_store()
        .lock()
        .map_err(|_| "session jar store poisoned".to_string())?
        .remove(&normalized);
    session_client_store()
        .lock()
        .map_err(|_| "session client store poisoned".to_string())?
        .remove(&normalized);
    Ok(())
}

fn header_map(rows: &[ParameterRow], body: &RequestBody) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    for row in rows
        .iter()
        .filter(|row| row.enabled && !row.name.trim().is_empty())
    {
        let name = HeaderName::from_bytes(row.name.trim().as_bytes())
            .map_err(|error| error.to_string())?;
        let value = HeaderValue::from_str(row.value.trim()).map_err(|error| error.to_string())?;
        headers.append(name, value);
    }
    if !headers.contains_key(CONTENT_TYPE) {
        if let Some(mime_type) = &body.mime_type {
            if !mime_type.trim().is_empty() {
                let value =
                    HeaderValue::from_str(mime_type.trim()).map_err(|error| error.to_string())?;
                headers.insert(CONTENT_TYPE, value);
                return Ok(headers);
            }
        }
        match body.mode.as_str() {
            "json" => {
                headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
            }
            "graphql" => {
                headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
            }
            "xml" => {
                headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/xml"));
            }
            "sparql" => {
                headers.insert(
                    CONTENT_TYPE,
                    HeaderValue::from_static("application/sparql-query"),
                );
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

#[derive(Debug, Clone, Default)]
struct DynamicMessageEncoder;

#[derive(Debug, Clone)]
struct DynamicMessageDecoder {
    descriptor: MessageDescriptor,
}

#[derive(Debug, Clone)]
struct DynamicMessageCodec {
    descriptor: MessageDescriptor,
}

impl DynamicMessageCodec {
    fn new(descriptor: MessageDescriptor) -> Self {
        Self { descriptor }
    }
}

impl Codec for DynamicMessageCodec {
    type Encode = DynamicMessage;
    type Decode = DynamicMessage;
    type Encoder = DynamicMessageEncoder;
    type Decoder = DynamicMessageDecoder;

    fn encoder(&mut self) -> Self::Encoder {
        DynamicMessageEncoder
    }

    fn decoder(&mut self) -> Self::Decoder {
        DynamicMessageDecoder {
            descriptor: self.descriptor.clone(),
        }
    }
}

impl Encoder for DynamicMessageEncoder {
    type Item = DynamicMessage;
    type Error = Status;

    fn encode(&mut self, item: Self::Item, dst: &mut EncodeBuf<'_>) -> Result<(), Self::Error> {
        item.encode(dst)
            .map_err(|error| Status::internal(error.to_string()))
    }

    fn buffer_settings(&self) -> BufferSettings {
        BufferSettings::default()
    }
}

impl Decoder for DynamicMessageDecoder {
    type Item = DynamicMessage;
    type Error = Status;

    fn decode(&mut self, src: &mut DecodeBuf<'_>) -> Result<Option<Self::Item>, Self::Error> {
        DynamicMessage::decode(self.descriptor.clone(), src)
            .map(Some)
            .map_err(|error| Status::internal(error.to_string()))
    }

    fn buffer_settings(&self) -> BufferSettings {
        BufferSettings::default()
    }
}

fn session_root_path(session_id: Option<&str>) -> Option<PathBuf> {
    let raw = session_id?.trim();
    if raw.is_empty() {
        return None;
    }
    let path = PathBuf::from(raw);
    if path.is_dir() {
        return Some(path);
    }
    path.parent().map(|parent| parent.to_path_buf())
}

fn resolve_workspace_path(
    session_id: Option<&str>,
    raw_path: &str,
    base_dir: Option<&Path>,
) -> PathBuf {
    let candidate = PathBuf::from(raw_path);
    if candidate.is_absolute() {
        return candidate;
    }
    if let Some(base) = base_dir {
        let resolved = base.join(&candidate);
        if resolved.exists() {
            return resolved;
        }
    }
    if let Some(root) = session_root_path(session_id) {
        let resolved = root.join(&candidate);
        if resolved.exists() {
            return resolved;
        }
        return resolved;
    }
    if let Some(base) = base_dir {
        return base.join(candidate);
    }
    candidate
}

fn normalize_grpc_endpoint(url: &str) -> Result<Url, String> {
    let trimmed = url.trim();
    let normalized = if let Some(rest) = trimmed.strip_prefix("grpc://") {
        format!("http://{rest}")
    } else if let Some(rest) = trimmed.strip_prefix("grpcs://") {
        format!("https://{rest}")
    } else {
        trimmed.to_string()
    };
    Url::parse(&normalized).map_err(|error| error.to_string())
}

fn grpc_status_to_http_status(code: GrpcCode) -> u16 {
    match code {
        GrpcCode::Ok => 200,
        GrpcCode::Cancelled => 499,
        GrpcCode::InvalidArgument => 400,
        GrpcCode::DeadlineExceeded => 504,
        GrpcCode::NotFound => 404,
        GrpcCode::AlreadyExists => 409,
        GrpcCode::PermissionDenied => 403,
        GrpcCode::ResourceExhausted => 429,
        GrpcCode::FailedPrecondition => 400,
        GrpcCode::Aborted => 409,
        GrpcCode::OutOfRange => 400,
        GrpcCode::Unimplemented => 501,
        GrpcCode::Internal => 500,
        GrpcCode::Unavailable => 503,
        GrpcCode::DataLoss => 500,
        GrpcCode::Unauthenticated => 401,
        GrpcCode::Unknown => 520,
    }
}

fn grpc_status_code_value(code: GrpcCode) -> u8 {
    match code {
        GrpcCode::Ok => 0,
        GrpcCode::Cancelled => 1,
        GrpcCode::Unknown => 2,
        GrpcCode::InvalidArgument => 3,
        GrpcCode::DeadlineExceeded => 4,
        GrpcCode::NotFound => 5,
        GrpcCode::AlreadyExists => 6,
        GrpcCode::PermissionDenied => 7,
        GrpcCode::ResourceExhausted => 8,
        GrpcCode::FailedPrecondition => 9,
        GrpcCode::Aborted => 10,
        GrpcCode::OutOfRange => 11,
        GrpcCode::Unimplemented => 12,
        GrpcCode::Internal => 13,
        GrpcCode::Unavailable => 14,
        GrpcCode::DataLoss => 15,
        GrpcCode::Unauthenticated => 16,
    }
}

fn grpc_proto_context(
    input: &SendRequestInput,
    grpc: &GrpcBody,
) -> Result<(DescriptorPool, PathBuf), String> {
    let proto_raw = grpc
        .proto_file
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "gRPC requests require a proto file".to_string())?;
    let session_root = session_root_path(input.session_id.as_deref());
    let proto_path = resolve_workspace_path(
        input.session_id.as_deref(),
        proto_raw,
        session_root.as_deref(),
    );
    if !proto_path.exists() {
        return Err(format!("Proto file not found: {}", proto_path.display()));
    }
    let proto_dir = proto_path.parent().map(|parent| parent.to_path_buf());
    let mut include_paths = Vec::new();
    let mut seen = HashSet::new();
    let mut push_include = |path: PathBuf| {
        let normalized = path.to_string_lossy().to_string();
        if seen.insert(normalized) {
            include_paths.push(path);
        }
    };
    if let Some(dir) = proto_dir.clone() {
        push_include(dir);
    }
    if let Some(root) = session_root {
        push_include(root);
    }
    for raw_path in &grpc.import_paths {
        if raw_path.trim().is_empty() {
            continue;
        }
        let resolved =
            resolve_workspace_path(input.session_id.as_deref(), raw_path, proto_dir.as_deref());
        push_include(resolved);
    }
    let file_descriptors =
        protox::compile([proto_path.clone()], include_paths).map_err(|error| error.to_string())?;
    let pool = DescriptorPool::from_file_descriptor_set(file_descriptors)
        .map_err(|error| error.to_string())?;
    Ok((pool, proto_path))
}

fn grpc_method_descriptor(
    pool: &DescriptorPool,
    grpc: &GrpcBody,
) -> Result<prost_reflect::MethodDescriptor, String> {
    let service_name = grpc.service.as_deref().unwrap_or("").trim();
    let method_name = grpc.method.as_deref().unwrap_or("").trim();
    let service = pool
        .services()
        .find(|item| item.full_name() == service_name || item.name() == service_name)
        .ok_or_else(|| format!("gRPC service not found in proto descriptors: {service_name}"))?;
    let method = service
        .methods()
        .find(|item| item.name() == method_name)
        .ok_or_else(|| format!("gRPC method not found on service {service_name}: {method_name}"))?;
    Ok(method)
}

fn grpc_runtime_kind(
    grpc: &GrpcBody,
    method: &prost_reflect::MethodDescriptor,
) -> Result<GrpcRuntimeKind, String> {
    if method.is_client_streaming() {
        return Err("Client and bidi gRPC streaming are not supported right now.".to_string());
    }
    let requested = if grpc.rpc_kind.trim().is_empty() {
        "unary"
    } else {
        grpc.rpc_kind.trim()
    };
    match requested {
        "unary" => {
            if method.is_server_streaming() {
                return Err(format!(
                    "gRPC method {}.{} is server-streaming. Set RPC Kind to Server Streaming to run it.",
                    method.parent_service().full_name(),
                    method.name()
                ));
            }
            Ok(GrpcRuntimeKind::Unary)
        }
        "server-streaming" => {
            if !method.is_server_streaming() {
                return Err(format!(
                    "gRPC method {}.{} is unary. Switch RPC Kind back to Unary to run it.",
                    method.parent_service().full_name(),
                    method.name()
                ));
            }
            Ok(GrpcRuntimeKind::ServerStreaming)
        }
        other => Err(format!("Unsupported gRPC RPC kind: {other}")),
    }
}

fn grpc_request_message(
    descriptor: MessageDescriptor,
    raw_message: &str,
) -> Result<DynamicMessage, String> {
    let trimmed = raw_message.trim();
    if trimmed.is_empty() {
        return Ok(DynamicMessage::new(descriptor));
    }
    let mut json_deserializer = serde_json::Deserializer::from_str(trimmed);
    match DynamicMessage::deserialize(descriptor.clone(), &mut json_deserializer) {
        Ok(message) => {
            json_deserializer
                .end()
                .map_err(|error| error.to_string())?;
            Ok(message)
        }
        Err(json_error) => DynamicMessage::parse_text_format(descriptor, trimmed).map_err(|text_error| {
            format!(
                "Failed to parse gRPC message as JSON ({json_error}) or protobuf text format ({text_error})."
            )
        }),
    }
}

fn grpc_request_metadata(
    request: &mut GrpcRequest<DynamicMessage>,
    headers: &[ParameterRow],
) -> Result<(), String> {
    for row in headers
        .iter()
        .filter(|row| row.enabled && !row.name.trim().is_empty())
    {
        let name = row.name.trim().to_ascii_lowercase();
        if matches!(
            name.as_str(),
            "content-type" | "content-length" | "host" | "te" | "grpc-timeout"
        ) {
            continue;
        }
        let key = MetadataKey::<Ascii>::from_str(&name).map_err(|error| error.to_string())?;
        let value = MetadataValue::<Ascii>::from_str(row.value.trim())
            .map_err(|error| error.to_string())?;
        request.metadata_mut().insert(key, value);
    }
    Ok(())
}

async fn grpc_request_send(input: SendRequestInput) -> Result<SendRequestResult, String> {
    let start = Instant::now();
    let timeout_ms = input.timeout_ms.unwrap_or(30_000);
    let grpc = input
        .body
        .grpc
        .clone()
        .ok_or_else(|| "Missing gRPC request body configuration".to_string())?;
    let endpoint_url = normalize_grpc_endpoint(&input.url)?;
    let (pool, _proto_path) = grpc_proto_context(&input, &grpc)?;
    let method = grpc_method_descriptor(&pool, &grpc)?;
    let runtime_kind = grpc_runtime_kind(&grpc, &method)?;
    let input_message = grpc_request_message(method.input(), grpc.message.as_str())?;
    let service_name = method.parent_service().full_name().to_string();
    let method_name = method.name().to_string();
    let rpc_path = format!("/{}/{}", service_name, method_name);
    let path =
        PathAndQuery::from_str(&rpc_path).map_err(|error| format!("Invalid gRPC path: {error}"))?;
    let mut rpc_url = endpoint_url.clone();
    rpc_url.set_query(None);
    rpc_url.set_path(&rpc_path);
    let rpc_url_text = rpc_url.to_string();
    let endpoint = Endpoint::from_shared(endpoint_url.to_string())
        .map_err(|error| error.to_string())?
        .connect_timeout(Duration::from_millis(timeout_ms))
        .timeout(Duration::from_millis(timeout_ms));
    let channel = endpoint
        .connect()
        .await
        .map_err(|error| error.to_string())?;
    let mut request = GrpcRequest::new(input_message);
    grpc_request_metadata(&mut request, &input.headers)?;
    let mut client = Grpc::new(channel);

    let failure_result =
        |status: Status, partial_messages: Vec<Value>| -> Result<SendRequestResult, String> {
            let body_value = if runtime_kind == GrpcRuntimeKind::ServerStreaming {
                json!({
                    "grpc": {
                        "rpcKind": runtime_kind.rpc_kind(),
                        "service": service_name.clone(),
                        "method": method_name.clone(),
                        "code": format!("{:?}", status.code()),
                        "message": status.message(),
                        "detailsBase64": (!status.details().is_empty())
                            .then(|| general_purpose::STANDARD.encode(status.details())),
                        "partialMessageCount": partial_messages.len()
                    },
                    "messages": partial_messages
                })
            } else {
                json!({
                    "grpc": {
                        "rpcKind": runtime_kind.rpc_kind(),
                        "service": service_name.clone(),
                        "method": method_name.clone(),
                        "code": format!("{:?}", status.code()),
                        "message": status.message(),
                        "detailsBase64": (!status.details().is_empty())
                            .then(|| general_purpose::STANDARD.encode(status.details()))
                    }
                })
            };
            let body_text =
                serde_json::to_string_pretty(&body_value).map_err(|error| error.to_string())?;
            Ok(SendRequestResult {
                ok: false,
                status: grpc_status_to_http_status(status.code()),
                status_text: format!("{:?}", status.code()),
                url: rpc_url_text.clone(),
                duration_ms: start.elapsed().as_millis() as u64,
                size_bytes: body_text.as_bytes().len(),
                headers: vec![
                    ResponseHeader {
                        name: "content-type".into(),
                        value: "application/json; charset=utf-8".into(),
                    },
                    ResponseHeader {
                        name: "grpc-status".into(),
                        value: grpc_status_code_value(status.code()).to_string(),
                    },
                    ResponseHeader {
                        name: "grpc-message".into(),
                        value: status.message().to_string(),
                    },
                    ResponseHeader {
                        name: "x-debugger-runtime".into(),
                        value: runtime_kind.runtime_header().into(),
                    },
                ],
                body_text,
                body_base64: None,
                timestamp: chrono_timestamp(),
            })
        };

    match runtime_kind {
        GrpcRuntimeKind::Unary => match client
            .unary(request, path, DynamicMessageCodec::new(method.output()))
            .await
        {
            Ok(response) => {
                let body_text = serde_json::to_string_pretty(&response.into_inner())
                    .map_err(|error| error.to_string())?;
                Ok(SendRequestResult {
                    ok: true,
                    status: 200,
                    status_text: "OK".into(),
                    url: rpc_url_text,
                    duration_ms: start.elapsed().as_millis() as u64,
                    size_bytes: body_text.as_bytes().len(),
                    headers: vec![
                        ResponseHeader {
                            name: "content-type".into(),
                            value: "application/json; charset=utf-8".into(),
                        },
                        ResponseHeader {
                            name: "grpc-status".into(),
                            value: "0".into(),
                        },
                        ResponseHeader {
                            name: "x-debugger-runtime".into(),
                            value: runtime_kind.runtime_header().into(),
                        },
                    ],
                    body_text,
                    body_base64: None,
                    timestamp: chrono_timestamp(),
                })
            }
            Err(status) => failure_result(status, vec![]),
        },
        GrpcRuntimeKind::ServerStreaming => match client
            .server_streaming(request, path, DynamicMessageCodec::new(method.output()))
            .await
        {
            Ok(response) => {
                let mut stream = response.into_inner();
                let mut messages = Vec::new();
                loop {
                    match stream.message().await {
                        Ok(Some(message)) => {
                            messages.push(
                                serde_json::to_value(&message)
                                    .map_err(|error| error.to_string())?,
                            );
                        }
                        Ok(None) => break,
                        Err(status) => return failure_result(status, messages),
                    }
                }
                if let Err(status) = stream.trailers().await {
                    return failure_result(status, messages);
                }
                let body_text = serde_json::to_string_pretty(&json!({
                    "grpc": {
                        "rpcKind": runtime_kind.rpc_kind(),
                        "service": service_name.clone(),
                        "method": method_name.clone(),
                        "messageCount": messages.len()
                    },
                    "messages": messages
                }))
                .map_err(|error| error.to_string())?;
                Ok(SendRequestResult {
                    ok: true,
                    status: 200,
                    status_text: "OK".into(),
                    url: rpc_url_text,
                    duration_ms: start.elapsed().as_millis() as u64,
                    size_bytes: body_text.as_bytes().len(),
                    headers: vec![
                        ResponseHeader {
                            name: "content-type".into(),
                            value: "application/json; charset=utf-8".into(),
                        },
                        ResponseHeader {
                            name: "grpc-status".into(),
                            value: "0".into(),
                        },
                        ResponseHeader {
                            name: "x-debugger-runtime".into(),
                            value: runtime_kind.runtime_header().into(),
                        },
                        ResponseHeader {
                            name: "x-grpc-message-count".into(),
                            value: messages.len().to_string(),
                        },
                    ],
                    body_text,
                    body_base64: None,
                    timestamp: chrono_timestamp(),
                })
            }
            Err(status) => failure_result(status, vec![]),
        },
    }
}

#[tauri::command]
async fn request_send(input: SendRequestInput) -> Result<SendRequestResult, String> {
    if input.body.grpc.is_some() {
        return grpc_request_send(input).await;
    }
    let method = input
        .method
        .parse::<reqwest::Method>()
        .map_err(|error| error.to_string())?;
    let timeout_ms = input.timeout_ms.unwrap_or(30_000);
    let follow_redirects = input.follow_redirects.unwrap_or(true);
    let client = if let Some(session_id) = input.session_id.as_deref() {
        let normalized_session = normalize_path(session_id);
        let jar = session_jar(&normalized_session)?;
        if follow_redirects {
            let mut clients = session_client_store()
                .lock()
                .map_err(|_| "session client store poisoned".to_string())?;
            if let Some(existing) = clients.get(&normalized_session) {
                existing.clone()
            } else {
                let client = build_http_client(jar.clone(), timeout_ms, true)?;
                clients.insert(normalized_session.clone(), client.clone());
                client
            }
        } else {
            build_http_client(jar, timeout_ms, false)?
        }
    } else {
        build_http_client(Arc::new(Jar::default()), timeout_ms, follow_redirects)?
    };

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
        "json" | "text" | "xml" | "graphql" | "sparql" => {
            if !input.body.text.is_empty() {
                request = request.body(input.body.text.clone());
            }
        }
        "file" => {
            let file_path = input
                .body
                .file
                .clone()
                .or_else(|| (!input.body.text.trim().is_empty()).then(|| input.body.text.clone()))
                .ok_or_else(|| "File body mode requires a file path".to_string())?;
            let bytes = fs::read(&file_path).map_err(|error| error.to_string())?;
            request = request.body(bytes);
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
        body_base64: Some(general_purpose::STANDARD.encode(&bytes)),
        timestamp: chrono_timestamp(),
    })
}

fn websocket_event(
    direction: &str,
    label: &str,
    body: String,
    start: Instant,
) -> WebSocketTimelineEvent {
    WebSocketTimelineEvent {
        direction: direction.to_string(),
        label: label.to_string(),
        body,
        elapsed_ms: start.elapsed().as_millis() as u64,
    }
}

fn append_websocket_event(
    events: &Arc<Mutex<Vec<WebSocketTimelineEvent>>>,
    direction: &str,
    label: &str,
    body: String,
    start: Instant,
) {
    if let Ok(mut items) = events.lock() {
        items.push(websocket_event(direction, label, body, start));
    }
}

fn websocket_live_session_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("ws-live-{}", nanos)
}

fn websocket_live_session_snapshot(session: &WebSocketLiveSession) -> WebSocketLiveSnapshot {
    let events = session
        .events
        .lock()
        .map(|items| items.clone())
        .unwrap_or_default();
    WebSocketLiveSnapshot {
        ok: true,
        session_id: session.session_id.clone(),
        url: session.url.clone(),
        duration_ms: session.started_at.elapsed().as_millis() as u64,
        events,
    }
}

fn websocket_request(
    url: &str,
    headers: &[ParameterRow],
) -> Result<tokio_tungstenite::tungstenite::handshake::client::Request, String> {
    let mut request = url
        .to_string()
        .into_client_request()
        .map_err(|error| error.to_string())?;

    for row in headers
        .iter()
        .filter(|row| row.enabled && !row.name.trim().is_empty())
    {
        let name = WsHeaderName::from_bytes(row.name.trim().as_bytes())
            .map_err(|error| error.to_string())?;
        let value = WsHeaderValue::from_str(row.value.trim()).map_err(|error| error.to_string())?;
        request.headers_mut().append(name, value);
    }

    Ok(request)
}

fn websocket_message_body(message: Message) -> Option<(String, String)> {
    match message {
        Message::Text(text) => Some(("message".to_string(), text.to_string())),
        Message::Binary(bytes) => Some((
            "binary".to_string(),
            format!(
                "<{} bytes binary message; base64={}>",
                bytes.len(),
                general_purpose::STANDARD.encode(bytes)
            ),
        )),
        Message::Ping(bytes) => Some(("ping".to_string(), format!("<{} bytes ping>", bytes.len()))),
        Message::Pong(bytes) => Some(("pong".to_string(), format!("<{} bytes pong>", bytes.len()))),
        Message::Close(frame) => Some((
            "close".to_string(),
            frame
                .map(|value| format!("{} {}", value.code, value.reason))
                .unwrap_or_else(|| "closed".to_string()),
        )),
        Message::Frame(_) => None,
    }
}

fn websocket_outgoing_message(
    message: &WebSocketMessageInput,
) -> Result<(Message, String), String> {
    match message
        .kind
        .as_deref()
        .unwrap_or("json")
        .to_ascii_lowercase()
        .as_str()
    {
        "binary" => {
            let decoded = general_purpose::STANDARD
                .decode(message.body.trim())
                .map_err(|error| format!("{} is not valid base64: {}", message.name, error))?;
            let preview = format!("<{} bytes binary frame>", decoded.len());
            Ok((Message::Binary(decoded.into()), preview))
        }
        "text" | "json" | "" => Ok((
            Message::Text(message.body.clone().into()),
            message.body.clone(),
        )),
        other => Err(format!("Unsupported WebSocket message type: {}", other)),
    }
}

async fn collect_websocket_messages<S>(
    socket: &mut S,
    start: Instant,
    events: &mut Vec<WebSocketTimelineEvent>,
    idle_timeout_ms: u64,
) -> Result<(), String>
where
    S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    loop {
        match tokio::time::timeout(
            std::time::Duration::from_millis(idle_timeout_ms),
            socket.next(),
        )
        .await
        {
            Ok(Some(Ok(message))) => {
                if let Some((label, body)) = websocket_message_body(message) {
                    events.push(websocket_event("in", &label, body, start));
                }
            }
            Ok(Some(Err(error))) => return Err(error.to_string()),
            Ok(None) | Err(_) => break,
        }

        if events.len() >= 200 {
            events.push(websocket_event(
                "runtime",
                "limit",
                "Stopped collecting after 200 timeline events.".to_string(),
                start,
            ));
            break;
        }
    }
    Ok(())
}

#[tauri::command]
async fn websocket_run(input: WebSocketRunInput) -> Result<WebSocketRunResult, String> {
    let timeout_ms = input.timeout_ms.unwrap_or(30_000).max(250);
    let start = Instant::now();
    let request = websocket_request(&input.url, &input.headers)?;

    let mut events = Vec::new();
    let connect_result = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        tokio_tungstenite::connect_async(request),
    )
    .await
    .map_err(|_| "WebSocket connection timed out".to_string())?
    .map_err(|error| error.to_string())?;

    let (mut socket, response) = connect_result;
    events.push(websocket_event(
        "runtime",
        "connected",
        format!("HTTP {}", response.status()),
        start,
    ));

    for message in input.messages.iter().filter(|message| message.enabled) {
        let (outgoing, preview) = websocket_outgoing_message(message)?;
        socket
            .send(outgoing)
            .await
            .map_err(|error| error.to_string())?;
        events.push(websocket_event("out", &message.name, preview, start));
        collect_websocket_messages(&mut socket, start, &mut events, 250).await?;
    }

    collect_websocket_messages(&mut socket, start, &mut events, 500).await?;
    let _ = socket.close(None).await;

    Ok(WebSocketRunResult {
        ok: true,
        url: input.url,
        duration_ms: start.elapsed().as_millis() as u64,
        events,
    })
}

#[tauri::command]
async fn websocket_live_connect(
    input: WebSocketLiveConnectInput,
) -> Result<WebSocketLiveSnapshot, String> {
    let timeout_ms = input.timeout_ms.unwrap_or(30_000).max(250);
    let start = Instant::now();
    let request = websocket_request(&input.url, &input.headers)?;

    let connect_result = tokio::time::timeout(
        Duration::from_millis(timeout_ms),
        tokio_tungstenite::connect_async(request),
    )
    .await
    .map_err(|_| "WebSocket connection timed out".to_string())?
    .map_err(|error| error.to_string())?;

    let (socket, response) = connect_result;
    let session_id = websocket_live_session_id();
    let events = Arc::new(Mutex::new(Vec::new()));
    append_websocket_event(
        &events,
        "runtime",
        "connected",
        format!("HTTP {}", response.status()),
        start,
    );

    let (command_tx, mut command_rx) = tokio::sync::mpsc::unbounded_channel();
    let session = WebSocketLiveSession {
        session_id: session_id.clone(),
        url: input.url,
        started_at: start,
        events: events.clone(),
        command_tx,
    };

    websocket_live_session_store()
        .lock()
        .map_err(|_| "Unable to access WebSocket live sessions".to_string())?
        .insert(session_id.clone(), session.clone());

    tokio::spawn(async move {
        let (mut write, mut read) = socket.split();
        loop {
            tokio::select! {
                command = command_rx.recv() => {
                    match command {
                        Some(WebSocketLiveCommand::Send(message)) => {
                            match websocket_outgoing_message(&message) {
                                Ok((outgoing, preview)) => {
                                    match write.send(outgoing).await {
                                        Ok(()) => append_websocket_event(&events, "out", &message.name, preview, start),
                                        Err(error) => {
                                            append_websocket_event(&events, "runtime", "error", error.to_string(), start);
                                            break;
                                        }
                                    }
                                }
                                Err(error) => append_websocket_event(&events, "runtime", "error", error, start),
                            }
                        }
                        Some(WebSocketLiveCommand::Close) | None => {
                            let _ = write.send(Message::Close(None)).await;
                            append_websocket_event(&events, "runtime", "closed", "Connection closed by client".to_string(), start);
                            break;
                        }
                    }
                }
                item = read.next() => {
                    match item {
                        Some(Ok(message)) => {
                            if let Some((label, body)) = websocket_message_body(message) {
                                append_websocket_event(&events, "in", &label, body, start);
                            }
                        }
                        Some(Err(error)) => {
                            append_websocket_event(&events, "runtime", "error", error.to_string(), start);
                            break;
                        }
                        None => {
                            append_websocket_event(&events, "runtime", "closed", "Connection closed by server".to_string(), start);
                            break;
                        }
                    }
                }
            }
        }

        if let Ok(mut sessions) = websocket_live_session_store().lock() {
            sessions.remove(&session_id);
        }
    });

    Ok(websocket_live_session_snapshot(&session))
}

#[tauri::command]
async fn websocket_live_send(
    input: WebSocketLiveSendInput,
) -> Result<WebSocketLiveSnapshot, String> {
    let session = websocket_live_session_store()
        .lock()
        .map_err(|_| "Unable to access WebSocket live sessions".to_string())?
        .get(&input.session_id)
        .cloned()
        .ok_or_else(|| "WebSocket live session is not connected".to_string())?;

    session
        .command_tx
        .send(WebSocketLiveCommand::Send(input.message))
        .map_err(|_| "WebSocket live session is closed".to_string())?;
    tokio::time::sleep(Duration::from_millis(80)).await;
    Ok(websocket_live_session_snapshot(&session))
}

#[tauri::command]
async fn websocket_live_snapshot(session_id: String) -> Result<WebSocketLiveSnapshot, String> {
    let session = websocket_live_session_store()
        .lock()
        .map_err(|_| "Unable to access WebSocket live sessions".to_string())?
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "WebSocket live session is not connected".to_string())?;
    Ok(websocket_live_session_snapshot(&session))
}

#[tauri::command]
async fn websocket_live_close(session_id: String) -> Result<WebSocketLiveSnapshot, String> {
    let session = websocket_live_session_store()
        .lock()
        .map_err(|_| "Unable to access WebSocket live sessions".to_string())?
        .remove(&session_id)
        .ok_or_else(|| "WebSocket live session is not connected".to_string())?;

    let _ = session.command_tx.send(WebSocketLiveCommand::Close);
    tokio::time::sleep(Duration::from_millis(80)).await;
    Ok(websocket_live_session_snapshot(&session))
}

fn chrono_timestamp() -> String {
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
            collection_report_load,
            collection_report_append,
            collection_report_clear,
            session_inspect,
            session_clear,
            git_status,
            git_pull,
            git_push,
            git_diff,
            git_clone,
            open_terminal,
            request_send,
            websocket_run,
            websocket_live_connect,
            websocket_live_send,
            websocket_live_snapshot,
            websocket_live_close,
            capture::capture_browser_launch,
            capture::capture_target_list,
            capture::capture_start,
            capture::capture_stop,
            capture::capture_clear
        ])
        .run(tauri::generate_context!())
        .expect("error while running yapi debugger");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn websocket_outgoing_message_decodes_binary_frames() {
        let input = WebSocketMessageInput {
            name: "hello".to_string(),
            body: "aGVsbG8=".to_string(),
            kind: Some("binary".to_string()),
            enabled: true,
        };

        let (message, preview) = websocket_outgoing_message(&input).expect("binary message");

        match message {
            Message::Binary(bytes) => assert_eq!(&bytes[..], b"hello"),
            other => panic!("expected binary frame, got {other:?}"),
        }
        assert_eq!(preview, "<5 bytes binary frame>");
    }

    #[test]
    fn websocket_outgoing_message_rejects_invalid_base64() {
        let input = WebSocketMessageInput {
            name: "broken".to_string(),
            body: "not base64".to_string(),
            kind: Some("binary".to_string()),
            enabled: true,
        };

        let error = websocket_outgoing_message(&input).expect_err("invalid base64 should fail");
        assert!(error.contains("broken is not valid base64"));
    }

    #[test]
    fn websocket_message_body_includes_binary_base64_preview() {
        let (_, body) =
            websocket_message_body(Message::Binary(vec![104, 105].into())).expect("binary preview");
        assert!(body.contains("2 bytes"));
        assert!(body.contains("base64=aGk="));
    }
}

use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    net::TcpListener,
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::{sync::oneshot, time::sleep};
use tokio_tungstenite::{connect_async, tungstenite::Message};

const BODY_LIMIT_BYTES: usize = 1024 * 1024;
const CAPTURE_STATE_EVENT: &str = "capture://state";
const CAPTURE_ENTRY_EVENT: &str = "capture://entry";

static CAPTURE_STORE: OnceLock<Mutex<CaptureStore>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserTargetSummary {
    pub target_id: String,
    pub title: String,
    pub url: String,
    pub r#type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureBrowserState {
    pub port: u16,
    pub websocket_url: String,
    pub browser_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRuntimeState {
    pub launched: bool,
    pub running: bool,
    pub browser_port: Option<u16>,
    pub mode: Option<String>,
    pub target_id: Option<String>,
    pub entry_count: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureHeader {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedNetworkEntry {
    pub id: String,
    pub started_at_ms: u64,
    pub finished_at_ms: Option<u64>,
    pub r#type: String,
    pub method: String,
    pub url: String,
    pub host: String,
    pub path: String,
    pub status: Option<u16>,
    pub duration_ms: Option<u64>,
    pub target_id: String,
    pub target_title: String,
    pub target_url: String,
    pub request_headers: Vec<CaptureHeader>,
    pub response_headers: Vec<CaptureHeader>,
    pub request_body_text: Option<String>,
    pub request_body_truncated: bool,
    pub response_body_text: Option<String>,
    pub response_body_truncated: bool,
    pub response_mime_type: Option<String>,
    pub error_text: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStartInput {
    pub mode: String,
    pub target_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BrowserVersionPayload {
    #[serde(rename = "Browser")]
    browser: String,
    #[serde(rename = "webSocketDebuggerUrl")]
    websocket_url: String,
}

#[derive(Debug, Deserialize)]
struct TargetListPayload {
    id: String,
    title: String,
    url: String,
    #[serde(rename = "type")]
    target_type: String,
}

#[derive(Debug, Clone)]
struct SessionTarget {
    target_id: String,
    title: String,
    url: String,
}

struct CaptureRuntimeHandle {
    id: u64,
    stop: oneshot::Sender<()>,
    mode: String,
    target_id: Option<String>,
}

#[derive(Default)]
struct CaptureStore {
    browser: Option<CaptureBrowserState>,
    runtime: Option<CaptureRuntimeHandle>,
    entries: Vec<CapturedNetworkEntry>,
    next_runtime_id: u64,
    error: Option<String>,
}

#[derive(Debug, Clone)]
struct CaptureBuffer {
    entry: CapturedNetworkEntry,
}

enum PendingCommand {
    AttachTarget(SessionTarget),
    RequestPostData { key: String },
    ResponseBody { key: String },
}

fn capture_store() -> &'static Mutex<CaptureStore> {
    CAPTURE_STORE.get_or_init(|| Mutex::new(CaptureStore::default()))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn available_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    listener
        .local_addr()
        .map(|addr| addr.port())
        .map_err(|error| error.to_string())
}

fn capture_profile_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?;
    let profile_dir = cache_dir
        .join("capture-browser")
        .join(format!("{}", now_ms()));
    fs::create_dir_all(&profile_dir).map_err(|error| error.to_string())?;
    Ok(profile_dir)
}

fn browser_status() -> CaptureRuntimeState {
    let store = capture_store().lock().expect("capture store poisoned");
    CaptureRuntimeState {
        launched: store.browser.is_some(),
        running: store.runtime.is_some(),
        browser_port: store.browser.as_ref().map(|browser| browser.port),
        mode: store.runtime.as_ref().map(|runtime| runtime.mode.clone()),
        target_id: store
            .runtime
            .as_ref()
            .and_then(|runtime| runtime.target_id.clone()),
        entry_count: store.entries.len(),
        error: store.error.clone(),
    }
}

fn emit_capture_state<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit(CAPTURE_STATE_EVENT, browser_status());
}

fn persist_capture_entry<R: Runtime>(app: &AppHandle<R>, entry: &CapturedNetworkEntry) {
    if let Ok(mut store) = capture_store().lock() {
        if let Some(index) = store.entries.iter().position(|item| item.id == entry.id) {
            store.entries[index] = entry.clone();
        } else {
            store.entries.push(entry.clone());
        }
        store
            .entries
            .sort_by(|left, right| right.started_at_ms.cmp(&left.started_at_ms));
    }
    let _ = app.emit(CAPTURE_ENTRY_EVENT, entry);
    emit_capture_state(app);
}

fn parse_browser_version_payload(value: Value) -> Result<BrowserVersionPayload, String> {
    serde_json::from_value(value).map_err(|error| error.to_string())
}

fn parse_target_list_payload(value: Value) -> Result<Vec<BrowserTargetSummary>, String> {
    let targets: Vec<TargetListPayload> =
        serde_json::from_value(value).map_err(|error| error.to_string())?;
    Ok(targets
        .into_iter()
        .filter(|target| target.target_type == "page")
        .map(|target| BrowserTargetSummary {
            target_id: target.id,
            title: target.title,
            url: target.url,
            r#type: target.target_type,
        })
        .collect())
}

fn truncate_text(value: String) -> (String, bool) {
    if value.len() <= BODY_LIMIT_BYTES {
        return (value, false);
    }
    let mut cutoff = BODY_LIMIT_BYTES;
    while cutoff > 0 && !value.is_char_boundary(cutoff) {
        cutoff -= 1;
    }
    (value[..cutoff].to_string(), true)
}

fn is_textual_mime(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    normalized.starts_with("text/")
        || normalized.contains("json")
        || normalized.contains("xml")
        || normalized.contains("javascript")
        || normalized.contains("x-www-form-urlencoded")
        || normalized.contains("graphql")
}

fn host_matches_filter(host: &str, filters: &[String]) -> bool {
    if filters.is_empty() {
        return true;
    }
    let normalized_host = host.trim().to_ascii_lowercase();
    filters.iter().any(|filter| {
        if filter.starts_with('.') {
            let suffix = filter.trim_start_matches('.');
            normalized_host == suffix || normalized_host.ends_with(filter)
        } else {
            normalized_host == *filter
        }
    })
}

fn headers_from_value(value: Option<&Value>) -> Vec<CaptureHeader> {
    let Some(Value::Object(map)) = value else {
        return Vec::new();
    };
    map.iter()
        .map(|(name, value)| CaptureHeader {
            name: name.clone(),
            value: match value {
                Value::String(text) => text.clone(),
                _ => value.to_string(),
            },
        })
        .collect()
}

fn response_mime_type(headers: &[CaptureHeader], explicit: Option<&str>) -> Option<String> {
    if let Some(value) = explicit.filter(|value| !value.trim().is_empty()) {
        return Some(value.to_string());
    }
    headers
        .iter()
        .find(|header| header.name.eq_ignore_ascii_case("content-type"))
        .map(|header| header.value.clone())
}

fn decode_body_text(result: &Value, mime_type: Option<&str>) -> (Option<String>, bool) {
    let body = result
        .get("body")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if body.is_empty() {
        return (None, false);
    }
    let textual = mime_type.map(is_textual_mime).unwrap_or(false);
    if !textual {
        return (None, false);
    }

    let base64_encoded = result
        .get("base64Encoded")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let decoded = if base64_encoded {
        match base64::engine::general_purpose::STANDARD.decode(body) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Err(_) => String::new(),
        }
    } else {
        body
    };
    if decoded.is_empty() {
        return (None, false);
    }
    let (text, truncated) = truncate_text(decoded);
    (Some(text), truncated)
}

async fn fetch_browser_version(
    client: &Client,
    port: u16,
) -> Result<BrowserVersionPayload, String> {
    let response = client
        .get(format!("http://127.0.0.1:{port}/json/version"))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;
    parse_browser_version_payload(response)
}

async fn fetch_targets(client: &Client, port: u16) -> Result<Vec<BrowserTargetSummary>, String> {
    let response = client
        .get(format!("http://127.0.0.1:{port}/json/list"))
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;
    parse_target_list_payload(response)
}

fn chrome_args(port: u16, profile_dir: &Path) -> Vec<String> {
    vec![
        format!("--remote-debugging-port={port}"),
        format!("--user-data-dir={}", profile_dir.to_string_lossy()),
        "--no-first-run".into(),
        "--no-default-browser-check".into(),
        "--new-window".into(),
        "about:blank".into(),
    ]
}

#[cfg(target_os = "macos")]
fn launch_chrome_process(port: u16, profile_dir: &Path) -> Result<(), String> {
    let args = chrome_args(port, profile_dir);
    let candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    for candidate in candidates {
        if Path::new(candidate).exists() {
            Command::new(candidate)
                .args(&args)
                .spawn()
                .map_err(|error| error.to_string())?;
            return Ok(());
        }
    }

    Command::new("open")
        .args(["-na", "Google Chrome", "--args"])
        .args(&args)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn launch_chrome_process(port: u16, profile_dir: &Path) -> Result<(), String> {
    let args = chrome_args(port, profile_dir);
    for program in ["google-chrome", "chromium", "chromium-browser"] {
        if Command::new(program).args(&args).spawn().is_ok() {
            return Ok(());
        }
    }
    Err("Chrome or Chromium was not found on PATH".into())
}

#[cfg(target_os = "windows")]
fn launch_chrome_process(port: u16, profile_dir: &Path) -> Result<(), String> {
    let args = chrome_args(port, profile_dir);
    let candidates = [
        std::env::var("ProgramFiles")
            .ok()
            .map(|base| format!("{base}\\Google\\Chrome\\Application\\chrome.exe")),
        std::env::var("ProgramFiles(x86)")
            .ok()
            .map(|base| format!("{base}\\Google\\Chrome\\Application\\chrome.exe")),
    ];
    for candidate in candidates.into_iter().flatten() {
        if Path::new(&candidate).exists() {
            Command::new(candidate)
                .args(&args)
                .spawn()
                .map_err(|error| error.to_string())?;
            return Ok(());
        }
    }
    Err("Google Chrome was not found in the default install locations".into())
}

async fn wait_for_browser(client: &Client, port: u16) -> Result<BrowserVersionPayload, String> {
    let mut attempts = 0;
    loop {
        match fetch_browser_version(client, port).await {
            Ok(payload) => return Ok(payload),
            Err(error) => {
                attempts += 1;
                if attempts >= 40 {
                    return Err(error);
                }
                sleep(Duration::from_millis(250)).await;
            }
        }
    }
}

async fn send_cdp_command<S>(
    sink: &mut S,
    pending: &mut HashMap<u64, PendingCommand>,
    next_id: &mut u64,
    session_id: Option<&str>,
    method: &str,
    params: Value,
    command: Option<PendingCommand>,
) -> Result<(), String>
where
    S: futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    *next_id += 1;
    let id = *next_id;
    if let Some(command) = command {
        pending.insert(id, command);
    }
    let mut payload = json!({
        "id": id,
        "method": method,
        "params": params
    });
    if let Some(session_id) = session_id {
        payload["sessionId"] = Value::String(session_id.to_string());
    }
    sink.send(Message::Text(payload.to_string().into()))
        .await
        .map_err(|error| error.to_string())
}

fn capture_key(session_id: &str, request_id: &str) -> String {
    format!("{session_id}:{request_id}")
}

fn target_from_summary(summary: &BrowserTargetSummary) -> SessionTarget {
    SessionTarget {
        target_id: summary.target_id.clone(),
        title: summary.title.clone(),
        url: summary.url.clone(),
    }
}

fn target_from_attached(params: &Value) -> Option<(String, SessionTarget)> {
    let session_id = params.get("sessionId")?.as_str()?.to_string();
    let target_info = params.get("targetInfo")?;
    if target_info
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default()
        != "page"
    {
        return None;
    }
    let target = SessionTarget {
        target_id: target_info
            .get("targetId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        title: target_info
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        url: target_info
            .get("url")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
    };
    Some((session_id, target))
}

async fn run_capture_loop(
    app: AppHandle,
    websocket_url: String,
    mode: String,
    initial_targets: Vec<BrowserTargetSummary>,
    stop_rx: oneshot::Receiver<()>,
) -> Result<(), String> {
    let (socket, _) = connect_async(&websocket_url)
        .await
        .map_err(|error| error.to_string())?;
    let (mut write, mut read) = socket.split();
    let mut stop_rx = stop_rx;
    let mut next_id = 0u64;
    let mut pending = HashMap::<u64, PendingCommand>::new();
    let mut session_targets = HashMap::<String, SessionTarget>::new();
    let mut buffers = HashMap::<String, CaptureBuffer>::new();

    for target in &initial_targets {
        send_cdp_command(
            &mut write,
            &mut pending,
            &mut next_id,
            None,
            "Target.attachToTarget",
            json!({
                "targetId": target.target_id,
                "flatten": true
            }),
            Some(PendingCommand::AttachTarget(target_from_summary(target))),
        )
        .await?;
    }

    if mode == "browser" {
        send_cdp_command(
            &mut write,
            &mut pending,
            &mut next_id,
            None,
            "Target.setAutoAttach",
            json!({
                "autoAttach": true,
                "waitForDebuggerOnStart": false,
                "flatten": true
            }),
            None,
        )
        .await?;
    }

    loop {
        tokio::select! {
            _ = &mut stop_rx => break,
            next = read.next() => {
                let Some(message) = next else {
                    break;
                };
                let Message::Text(text) = message.map_err(|error| error.to_string())? else {
                    continue;
                };
                let value: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
                if let Some(id) = value.get("id").and_then(Value::as_u64) {
                    match pending.remove(&id) {
                        Some(PendingCommand::AttachTarget(target)) => {
                            if let Some(session_id) = value.get("result").and_then(|result| result.get("sessionId")).and_then(Value::as_str) {
                                session_targets.insert(session_id.to_string(), target.clone());
                                send_cdp_command(
                                    &mut write,
                                    &mut pending,
                                    &mut next_id,
                                    Some(session_id),
                                    "Network.enable",
                                    json!({}),
                                    None,
                                )
                                .await?;
                            }
                        }
                        Some(PendingCommand::RequestPostData { key }) => {
                            if let Some(buffer) = buffers.get_mut(&key) {
                                if let Some(post_data) = value.get("result").and_then(|result| result.get("postData")).and_then(Value::as_str) {
                                    let (text, truncated) = truncate_text(post_data.to_string());
                                    buffer.entry.request_body_text = Some(text);
                                    buffer.entry.request_body_truncated = truncated;
                                    persist_capture_entry(&app, &buffer.entry);
                                }
                            }
                        }
                        Some(PendingCommand::ResponseBody { key }) => {
                            if let Some(buffer) = buffers.get_mut(&key) {
                                let mime_type = buffer.entry.response_mime_type.clone();
                                let (body_text, truncated) = decode_body_text(value.get("result").unwrap_or(&Value::Null), mime_type.as_deref());
                                buffer.entry.response_body_text = body_text;
                                buffer.entry.response_body_truncated = truncated;
                                persist_capture_entry(&app, &buffer.entry);
                            }
                        }
                        None => {}
                    }
                    continue;
                }

                let Some(method) = value.get("method").and_then(Value::as_str) else {
                    continue;
                };
                let params = value.get("params").unwrap_or(&Value::Null);
                let session_id = value.get("sessionId").and_then(Value::as_str).unwrap_or_default().to_string();

                match method {
                    "Target.attachedToTarget" => {
                        if let Some((attached_session_id, target)) = target_from_attached(params) {
                            if !target.target_id.is_empty() {
                                session_targets.insert(attached_session_id.clone(), target.clone());
                            }
                            send_cdp_command(
                                &mut write,
                                &mut pending,
                                &mut next_id,
                                Some(&attached_session_id),
                                "Network.enable",
                                json!({}),
                                None,
                            )
                            .await?;
                        }
                    }
                    "Target.detachedFromTarget" => {
                        if let Some(detached_session_id) = params.get("sessionId").and_then(Value::as_str) {
                            session_targets.remove(detached_session_id);
                        }
                    }
                    "Network.requestWillBeSent" => {
                        let request_type = params.get("type").and_then(Value::as_str).unwrap_or_default();
                        if request_type != "XHR" && request_type != "Fetch" {
                            continue;
                        }
                        let request_id = params.get("requestId").and_then(Value::as_str).unwrap_or_default();
                        let request = params.get("request").unwrap_or(&Value::Null);
                        let url = request.get("url").and_then(Value::as_str).unwrap_or_default();
                        let Ok(parsed_url) = reqwest::Url::parse(url) else {
                            continue;
                        };
                        let Some(target) = session_targets.get(&session_id) else {
                            continue;
                        };
                        let key = capture_key(&session_id, request_id);
                        let post_data = request.get("postData").and_then(Value::as_str).map(|value| truncate_text(value.to_string()));
                        let entry = CapturedNetworkEntry {
                            id: key.clone(),
                            started_at_ms: now_ms(),
                            finished_at_ms: None,
                            r#type: request_type.to_ascii_lowercase(),
                            method: request.get("method").and_then(Value::as_str).unwrap_or("GET").to_string(),
                            url: url.to_string(),
                            host: parsed_url.host_str().unwrap_or("unknown-host").to_string(),
                            path: if let Some(query) = parsed_url.query() {
                                format!("{}?{query}", parsed_url.path())
                            } else {
                                parsed_url.path().to_string()
                            },
                            status: None,
                            duration_ms: None,
                            target_id: target.target_id.clone(),
                            target_title: target.title.clone(),
                            target_url: target.url.clone(),
                            request_headers: headers_from_value(request.get("headers")),
                            response_headers: Vec::new(),
                            request_body_text: post_data.as_ref().map(|(text, _)| text.clone()),
                            request_body_truncated: post_data.as_ref().map(|(_, truncated)| *truncated).unwrap_or(false),
                            response_body_text: None,
                            response_body_truncated: false,
                            response_mime_type: None,
                            error_text: None,
                        };
                        if !host_matches_filter(&entry.host, &[]) {
                            continue;
                        }
                        buffers.insert(key.clone(), CaptureBuffer { entry: entry.clone() });
                        persist_capture_entry(&app, &entry);
                        let has_post_data = request.get("hasPostData").and_then(Value::as_bool).unwrap_or(false)
                            || params.get("hasPostData").and_then(Value::as_bool).unwrap_or(false);
                        if entry.request_body_text.is_none() && has_post_data {
                            send_cdp_command(
                                &mut write,
                                &mut pending,
                                &mut next_id,
                                Some(&session_id),
                                "Network.getRequestPostData",
                                json!({ "requestId": request_id }),
                                Some(PendingCommand::RequestPostData { key }),
                            )
                            .await?;
                        }
                    }
                    "Network.responseReceived" => {
                        let request_id = params.get("requestId").and_then(Value::as_str).unwrap_or_default();
                        let key = capture_key(&session_id, request_id);
                        if let Some(buffer) = buffers.get_mut(&key) {
                            let response = params.get("response").unwrap_or(&Value::Null);
                            buffer.entry.status = response
                                .get("status")
                                .and_then(Value::as_f64)
                                .map(|status| status as u16);
                            buffer.entry.response_headers = headers_from_value(response.get("headers"));
                            buffer.entry.response_mime_type = response_mime_type(
                                &buffer.entry.response_headers,
                                response.get("mimeType").and_then(Value::as_str),
                            );
                            persist_capture_entry(&app, &buffer.entry);
                        }
                    }
                    "Network.loadingFinished" => {
                        let request_id = params.get("requestId").and_then(Value::as_str).unwrap_or_default();
                        let key = capture_key(&session_id, request_id);
                        if let Some(buffer) = buffers.get_mut(&key) {
                            let finished_at = now_ms();
                            buffer.entry.finished_at_ms = Some(finished_at);
                            buffer.entry.duration_ms = Some(finished_at.saturating_sub(buffer.entry.started_at_ms));
                            let mime_type = buffer.entry.response_mime_type.clone().unwrap_or_default();
                            if is_textual_mime(&mime_type) {
                                send_cdp_command(
                                    &mut write,
                                    &mut pending,
                                    &mut next_id,
                                    Some(&session_id),
                                    "Network.getResponseBody",
                                    json!({ "requestId": request_id }),
                                    Some(PendingCommand::ResponseBody { key }),
                                )
                                .await?;
                            } else {
                                persist_capture_entry(&app, &buffer.entry);
                            }
                        }
                    }
                    "Network.loadingFailed" => {
                        let request_id = params.get("requestId").and_then(Value::as_str).unwrap_or_default();
                        let key = capture_key(&session_id, request_id);
                        if let Some(buffer) = buffers.get_mut(&key) {
                            let finished_at = now_ms();
                            buffer.entry.finished_at_ms = Some(finished_at);
                            buffer.entry.duration_ms = Some(finished_at.saturating_sub(buffer.entry.started_at_ms));
                            buffer.entry.error_text = params.get("errorText").and_then(Value::as_str).map(|value| value.to_string());
                            persist_capture_entry(&app, &buffer.entry);
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}

fn finalize_runtime<R: Runtime>(app: &AppHandle<R>, runtime_id: u64, error: Option<String>) {
    if let Ok(mut store) = capture_store().lock() {
        if store.runtime.as_ref().map(|runtime| runtime.id) == Some(runtime_id) {
            store.runtime = None;
            store.error = error;
        }
    }
    emit_capture_state(app);
}

fn stop_runtime<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(mut store) = capture_store().lock() {
        if let Some(runtime) = store.runtime.take() {
            let _ = runtime.stop.send(());
        }
        store.error = None;
    }
    emit_capture_state(app);
}

#[tauri::command]
pub async fn capture_browser_launch(app: AppHandle) -> Result<CaptureBrowserState, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| error.to_string())?;

    let existing_browser = {
        let store = capture_store()
            .lock()
            .map_err(|_| "capture store poisoned".to_string())?;
        store.browser.clone()
    };
    if let Some(existing) = existing_browser {
        if fetch_browser_version(&client, existing.port).await.is_ok() {
            emit_capture_state(&app);
            return Ok(existing);
        }
    }

    let port = available_port()?;
    let profile_dir = capture_profile_dir(&app)?;
    launch_chrome_process(port, &profile_dir)?;
    let payload = wait_for_browser(&client, port).await?;
    let browser = CaptureBrowserState {
        port,
        websocket_url: payload.websocket_url,
        browser_name: payload.browser,
    };

    {
        let mut store = capture_store()
            .lock()
            .map_err(|_| "capture store poisoned".to_string())?;
        store.browser = Some(browser.clone());
        store.error = None;
    }

    emit_capture_state(&app);
    Ok(browser)
}

#[tauri::command]
pub async fn capture_target_list() -> Result<Vec<BrowserTargetSummary>, String> {
    let browser = {
        let store = capture_store()
            .lock()
            .map_err(|_| "capture store poisoned".to_string())?;
        store.browser.clone()
    }
    .ok_or_else(|| "Launch Chrome first".to_string())?;
    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| error.to_string())?;
    fetch_targets(&client, browser.port).await
}

#[tauri::command]
pub async fn capture_start(
    app: AppHandle,
    input: CaptureStartInput,
) -> Result<CaptureRuntimeState, String> {
    let browser = {
        let store = capture_store()
            .lock()
            .map_err(|_| "capture store poisoned".to_string())?;
        store.browser.clone()
    }
    .ok_or_else(|| "Launch Chrome first".to_string())?;

    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| error.to_string())?;
    let targets = fetch_targets(&client, browser.port).await?;
    let initial_targets = if input.mode == "browser" {
        targets.clone()
    } else {
        let target_id = input
            .target_id
            .clone()
            .ok_or_else(|| "Select a browser target first".to_string())?;
        let matched = targets
            .into_iter()
            .find(|target| target.target_id == target_id)
            .ok_or_else(|| "Selected target is no longer available".to_string())?;
        vec![matched]
    };

    stop_runtime(&app);
    let (stop_tx, stop_rx) = oneshot::channel();
    let runtime_id = {
        let mut store = capture_store()
            .lock()
            .map_err(|_| "capture store poisoned".to_string())?;
        store.next_runtime_id += 1;
        let runtime_id = store.next_runtime_id;
        store.runtime = Some(CaptureRuntimeHandle {
            id: runtime_id,
            stop: stop_tx,
            mode: input.mode.clone(),
            target_id: input.target_id.clone(),
        });
        store.error = None;
        runtime_id
    };
    emit_capture_state(&app);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_capture_loop(
            app_handle.clone(),
            browser.websocket_url,
            input.mode,
            initial_targets,
            stop_rx,
        )
        .await;
        finalize_runtime(&app_handle, runtime_id, result.err());
    });

    Ok(browser_status())
}

#[tauri::command]
pub fn capture_stop(app: AppHandle) -> Result<CaptureRuntimeState, String> {
    stop_runtime(&app);
    Ok(browser_status())
}

#[tauri::command]
pub fn capture_clear(app: AppHandle) -> Result<CaptureRuntimeState, String> {
    if let Ok(mut store) = capture_store().lock() {
        store.entries.clear();
        store.error = None;
    }
    emit_capture_state(&app);
    Ok(browser_status())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_browser_version_payload() {
        let payload = parse_browser_version_payload(json!({
            "Browser": "Chrome/135.0.0.0",
            "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/browser/abc"
        }))
        .expect("version payload should parse");
        assert_eq!(payload.browser, "Chrome/135.0.0.0");
        assert_eq!(
            payload.websocket_url,
            "ws://127.0.0.1:9222/devtools/browser/abc"
        );
    }

    #[test]
    fn parses_target_list_payload() {
        let targets = parse_target_list_payload(json!([
            {
                "id": "page-1",
                "title": "Checkout",
                "url": "https://app.example.com/checkout",
                "type": "page"
            },
            {
                "id": "worker-1",
                "title": "Worker",
                "url": "https://app.example.com/worker.js",
                "type": "worker"
            }
        ]))
        .expect("target payload should parse");
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].target_id, "page-1");
    }

    #[test]
    fn host_filter_supports_exact_and_suffix() {
        assert!(host_matches_filter(
            "api.example.com",
            &[String::from("api.example.com")]
        ));
        assert!(host_matches_filter(
            "edge.api.example.com",
            &[String::from(".example.com")]
        ));
        assert!(!host_matches_filter(
            "example.net",
            &[String::from(".example.com")]
        ));
    }

    #[test]
    fn textual_body_is_truncated_at_limit() {
        let oversized = "a".repeat(BODY_LIMIT_BYTES + 12);
        let (text, truncated) = truncate_text(oversized);
        assert!(truncated);
        assert_eq!(text.len(), BODY_LIMIT_BYTES);
    }

    #[test]
    fn response_body_decoder_respects_text_mime() {
        let (body, truncated) = decode_body_text(
            &json!({
                "body": "{\"ok\":true}",
                "base64Encoded": false
            }),
            Some("application/json"),
        );
        assert_eq!(body.as_deref(), Some("{\"ok\":true}"));
        assert!(!truncated);
    }
}

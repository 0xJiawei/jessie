use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub transport: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub cwd: Option<String>,
    pub startup_timeout_ms: Option<u64>,
    pub endpoint_url: Option<String>,
    pub headers: HashMap<String, String>,
    pub enable_legacy_sse_fallback: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    pub app_resource_uri: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpConnectResponse {
    pub server_id: String,
    pub status: String,
    pub tools: Vec<McpTool>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    pub server_id: String,
    pub status: String,
    pub error: Option<String>,
    pub tool_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCallToolRequest {
    pub server_id: String,
    pub tool_name: String,
    pub arguments: Value,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCallToolResponse {
    pub result: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpReadResourceRequest {
    pub server_id: String,
    pub uri: String,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpReadResourceResponse {
    pub result: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRequestRequest {
    pub server_id: String,
    pub method: String,
    pub params: Option<Value>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRequestResponse {
    pub result: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRefreshToolsResponse {
    pub server_id: String,
    pub tools: Vec<McpTool>,
    pub warning: Option<String>,
}

struct McpStdioRuntime {
    server_id: String,
    child: Child,
    stdin: ChildStdin,
    rx: mpsc::Receiver<Value>,
    next_id: u64,
    tools: Vec<McpTool>,
    last_error: Option<String>,
}

struct McpHttpRuntime {
    server_id: String,
    endpoint_url: String,
    headers: HashMap<String, String>,
    session_id: Option<String>,
    next_id: u64,
    tools: Vec<McpTool>,
    last_error: Option<String>,
    enable_legacy_sse_fallback: bool,
}

enum McpServerRuntime {
    Stdio(McpStdioRuntime),
    Http(McpHttpRuntime),
}

impl McpStdioRuntime {
    fn is_alive(&mut self) -> Result<bool, String> {
        match self.child.try_wait().map_err(|error| error.to_string())? {
            Some(_) => Ok(false),
            None => Ok(true),
        }
    }

    fn request(&mut self, method: &str, params: Option<Value>, timeout_ms: u64) -> Result<Value, String> {
        if !self.is_alive()? {
            return Err("This MCP server disconnected unexpectedly.".to_string());
        }

        let request_id = self.next_id;
        self.next_id += 1;

        let mut payload = json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method
        });
        if let Some(params) = params {
            payload["params"] = params;
        }

        write_json_rpc_message(&mut self.stdin, &payload)?;

        let deadline = Instant::now() + Duration::from_millis(timeout_ms.max(100));
        loop {
            let now = Instant::now();
            if now >= deadline {
                return Err("The tool call timed out.".to_string());
            }
            let remaining = deadline.saturating_duration_since(now);
            let message = self
                .rx
                .recv_timeout(remaining)
                .map_err(|_| "The tool call timed out.".to_string())?;

            let id_matches = message
                .get("id")
                .and_then(Value::as_u64)
                .map(|id| id == request_id)
                .unwrap_or(false);
            if !id_matches {
                continue;
            }

            if let Some(error) = message.get("error") {
                let details = error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("Unknown MCP error");
                return Err(details.to_string());
            }

            return Ok(message
                .get("result")
                .cloned()
                .unwrap_or_else(|| json!({ "content": [] })));
        }
    }

    fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl McpHttpRuntime {
    fn request(&mut self, method: &str, params: Option<Value>, timeout_ms: u64) -> Result<Value, String> {
        let request_id = self.next_id;
        self.next_id += 1;

        let mut payload = json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method
        });
        if let Some(params) = params {
            payload["params"] = params;
        }

        match self.request_streamable(&payload, request_id, timeout_ms) {
            Ok(result) => Ok(result),
            Err(error) => {
                if self.enable_legacy_sse_fallback && should_try_sse_fallback(&error) {
                    self.request_legacy_sse(&payload, request_id, timeout_ms)
                } else {
                    Err(error)
                }
            }
        }
    }

    fn request_streamable(
        &mut self,
        payload: &Value,
        request_id: u64,
        timeout_ms: u64,
    ) -> Result<Value, String> {
        self.send_http_request(payload, request_id, timeout_ms, false)
    }

    fn request_legacy_sse(
        &mut self,
        payload: &Value,
        request_id: u64,
        timeout_ms: u64,
    ) -> Result<Value, String> {
        self.send_http_request(payload, request_id, timeout_ms, true)
    }

    fn send_http_request(
        &mut self,
        payload: &Value,
        request_id: u64,
        timeout_ms: u64,
        force_sse: bool,
    ) -> Result<Value, String> {
        let client = Client::builder()
            .timeout(Duration::from_millis(timeout_ms.max(100)))
            .build()
            .map_err(|error| format!("Failed to build HTTP client: {}", error))?;

        let payload_text =
            serde_json::to_string(payload).map_err(|error| format!("Failed to serialize payload: {}", error))?;

        let mut request = client
            .post(&self.endpoint_url)
            .header(CONTENT_TYPE, "application/json")
            .header(
                ACCEPT,
                if force_sse {
                    "text/event-stream"
                } else {
                    "application/json, text/event-stream"
                },
            );

        for (key, value) in &self.headers {
            if let Ok(header_name) = HeaderName::from_bytes(key.as_bytes()) {
                if let Ok(header_value) = HeaderValue::from_str(value) {
                    request = request.header(header_name, header_value);
                }
            }
        }

        if let Some(session_id) = &self.session_id {
            request = request.header("mcp-session-id", session_id);
        }

        let response = request
            .body(payload_text)
            .send()
            .map_err(|error| format!("HTTP request failed: {}", error))?;

        update_session_id_from_headers(response.headers(), &mut self.session_id);

        let status = response.status();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_lowercase();

        let body = response
            .text()
            .map_err(|error| format!("Failed to read HTTP response body: {}", error))?;

        if !status.is_success() {
            return Err(format!(
                "HTTP MCP request failed ({}): {}",
                status.as_u16(),
                truncate_error_body(&body)
            ));
        }

        if content_type.contains("text/event-stream") || force_sse {
            return parse_sse_response(&body, request_id);
        }

        parse_json_rpc_response(&body, request_id)
    }
}

impl McpServerRuntime {
    fn server_id(&self) -> String {
        match self {
            McpServerRuntime::Stdio(runtime) => runtime.server_id.clone(),
            McpServerRuntime::Http(runtime) => runtime.server_id.clone(),
        }
    }

    fn tools(&self) -> Vec<McpTool> {
        match self {
            McpServerRuntime::Stdio(runtime) => runtime.tools.clone(),
            McpServerRuntime::Http(runtime) => runtime.tools.clone(),
        }
    }

    fn set_tools(&mut self, tools: Vec<McpTool>) {
        match self {
            McpServerRuntime::Stdio(runtime) => runtime.tools = tools,
            McpServerRuntime::Http(runtime) => runtime.tools = tools,
        }
    }

    fn set_last_error(&mut self, error: Option<String>) {
        match self {
            McpServerRuntime::Stdio(runtime) => runtime.last_error = error,
            McpServerRuntime::Http(runtime) => runtime.last_error = error,
        }
    }

    fn last_error(&self) -> Option<String> {
        match self {
            McpServerRuntime::Stdio(runtime) => runtime.last_error.clone(),
            McpServerRuntime::Http(runtime) => runtime.last_error.clone(),
        }
    }

    fn is_alive(&mut self) -> bool {
        match self {
            McpServerRuntime::Stdio(runtime) => runtime.is_alive().unwrap_or(false),
            McpServerRuntime::Http(_) => true,
        }
    }

    fn request(&mut self, method: &str, params: Option<Value>, timeout_ms: u64) -> Result<Value, String> {
        let result = match self {
            McpServerRuntime::Stdio(runtime) => runtime.request(method, params, timeout_ms),
            McpServerRuntime::Http(runtime) => runtime.request(method, params, timeout_ms),
        };

        match &result {
            Ok(_) => self.set_last_error(None),
            Err(error) => self.set_last_error(Some(error.clone())),
        }
        result
    }

    fn refresh_tools(&mut self, timeout_ms: u64) -> Result<Option<String>, String> {
        let result = self.request("tools/list", Some(json!({})), timeout_ms)?;
        let (tools, malformed_count) = parse_tools_from_result(&result);
        self.set_tools(tools);
        if malformed_count > 0 {
            return Ok(Some(
                "This server connected, but its tool definitions were invalid.".to_string(),
            ));
        }
        Ok(None)
    }

    fn initialize(&mut self, timeout_ms: u64) -> Result<(), String> {
        let _ = self.request(
            "initialize",
            Some(json!({
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {
                    "name": "Jessie",
                    "version": "0.2.0"
                }
            })),
            timeout_ms,
        )?;

        if let McpServerRuntime::Stdio(runtime) = self {
            write_json_rpc_message(
                &mut runtime.stdin,
                &json!({
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized",
                    "params": {}
                }),
            )?;
        }

        Ok(())
    }

    fn kill(&mut self) {
        if let McpServerRuntime::Stdio(runtime) = self {
            runtime.kill();
        }
    }
}

#[derive(Default)]
pub struct McpRuntimeState {
    runtimes: Mutex<HashMap<String, Arc<Mutex<McpServerRuntime>>>>,
}

fn parse_tools_from_result(result: &Value) -> (Vec<McpTool>, usize) {
    let mut tools = Vec::new();
    let mut malformed_count = 0;

    let Some(items) = result.get("tools").and_then(Value::as_array) else {
        return (tools, malformed_count);
    };

    for item in items {
        let Some(name) = item.get("name").and_then(Value::as_str) else {
            malformed_count += 1;
            continue;
        };
        if name.trim().is_empty() {
            malformed_count += 1;
            continue;
        }

        let description = item
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        let schema = item
            .get("inputSchema")
            .or_else(|| item.get("input_schema"))
            .cloned()
            .unwrap_or_else(|| json!({}));
        if !schema.is_object() {
            malformed_count += 1;
            continue;
        }

        tools.push(McpTool {
            name: name.to_string(),
            description,
            input_schema: schema,
            app_resource_uri: extract_tool_ui_resource_uri(item),
        });
    }

    (tools, malformed_count)
}

fn extract_tool_ui_resource_uri(tool: &Value) -> Option<String> {
    let candidates = [
        tool.get("_meta")
            .and_then(|meta| meta.get("ui"))
            .and_then(|ui| ui.get("resourceUri"))
            .and_then(Value::as_str),
        tool.get("_meta")
            .and_then(|meta| meta.get("ui/resourceUri"))
            .and_then(Value::as_str),
        tool.get("_meta")
            .and_then(|meta| meta.get("openai/outputTemplate"))
            .and_then(Value::as_str),
        tool.get("meta")
            .and_then(|meta| meta.get("ui"))
            .and_then(|ui| ui.get("resourceUri"))
            .and_then(Value::as_str),
        tool.get("meta")
            .and_then(|meta| meta.get("openai"))
            .and_then(|openai| openai.get("outputTemplate"))
            .and_then(Value::as_str),
        tool.get("appResourceUri").and_then(Value::as_str),
    ];

    candidates
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(str::to_string)
}

fn write_json_rpc_message(stdin: &mut ChildStdin, payload: &Value) -> Result<(), String> {
    let body = serde_json::to_vec(payload).map_err(|error| error.to_string())?;
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    stdin
        .write_all(header.as_bytes())
        .map_err(|error| error.to_string())?;
    stdin.write_all(&body).map_err(|error| error.to_string())?;
    stdin.flush().map_err(|error| error.to_string())
}

fn read_json_rpc_message(reader: &mut BufReader<ChildStdout>) -> Result<Option<Value>, String> {
    let mut content_length: Option<usize> = None;

    loop {
        let mut line = String::new();
        let bytes_read = reader
            .read_line(&mut line)
            .map_err(|error| error.to_string())?;
        if bytes_read == 0 {
            return Ok(None);
        }

        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            break;
        }

        if let Some((key, value)) = line.split_once(':') {
            if key.eq_ignore_ascii_case("content-length") {
                let parsed = value
                    .trim()
                    .parse::<usize>()
                    .map_err(|_| "Invalid Content-Length header".to_string())?;
                content_length = Some(parsed);
            }
        }
    }

    let Some(length) = content_length else {
        return Err("Missing Content-Length header".to_string());
    };

    let mut body = vec![0_u8; length];
    reader
        .read_exact(&mut body)
        .map_err(|error| error.to_string())?;
    let value = serde_json::from_slice::<Value>(&body).map_err(|error| error.to_string())?;
    Ok(Some(value))
}

fn spawn_stdout_reader(stdout: ChildStdout) -> mpsc::Receiver<Value> {
    let (tx, rx) = mpsc::channel::<Value>();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        while let Ok(message) = read_json_rpc_message(&mut reader) {
            let Some(message) = message else {
                break;
            };
            if tx.send(message).is_err() {
                break;
            }
        }
    });
    rx
}

fn spawn_stderr_drain(stderr: ChildStderr, server_id: String) {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        loop {
            let mut line = String::new();
            let Ok(bytes) = reader.read_line(&mut line) else {
                break;
            };
            if bytes == 0 {
                break;
            }
            println!("[Jessie][MCP][{}][stderr] {}", server_id, line.trim());
        }
    });
}

fn validate_server_config(config: &McpServerConfig) -> Result<(), String> {
    if config.id.trim().is_empty() {
        return Err("Server id is required.".to_string());
    }
    let transport = config.transport.trim().to_lowercase();
    if transport != "stdio" && transport != "http" {
        return Err("Transport must be stdio or http.".to_string());
    }

    if transport == "stdio" && config.command.trim().is_empty() {
        return Err("Command is required for stdio MCP server.".to_string());
    }

    if transport == "http" {
        let endpoint_url = config
            .endpoint_url
            .as_ref()
            .map(|value| value.trim().to_string())
            .unwrap_or_default();
        if endpoint_url.is_empty() {
            return Err("Endpoint URL is required for HTTP MCP server.".to_string());
        }
        let parsed =
            reqwest::Url::parse(&endpoint_url).map_err(|_| "Endpoint URL is invalid.".to_string())?;
        if parsed.scheme() != "https" {
            return Err("HTTP MCP server endpoint must use HTTPS.".to_string());
        }
    }

    if let Some(startup_timeout_ms) = config.startup_timeout_ms {
        if startup_timeout_ms == 0 {
            return Err("Startup timeout must be greater than 0.".to_string());
        }
    }

    for key in config.env.keys() {
        let mut chars = key.chars();
        let Some(first) = chars.next() else {
            return Err("Environment variable key cannot be empty.".to_string());
        };
        let first_valid = first == '_' || first.is_ascii_alphabetic();
        if !first_valid || !chars.all(|ch| ch == '_' || ch.is_ascii_alphanumeric()) {
            return Err("Environment variable keys must be KEY format.".to_string());
        }
    }

    for key in config.headers.keys() {
        let is_valid = !key.trim().is_empty()
            && key
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-');
        if !is_valid {
            return Err("Header keys must use Header-Name format.".to_string());
        }
    }

    Ok(())
}

fn parse_json_rpc_response(body: &str, request_id: u64) -> Result<Value, String> {
    let parsed = serde_json::from_str::<Value>(body)
        .map_err(|error| format!("Failed to parse JSON response: {}", error))?;

    if let Some(value) = extract_result_by_request_id(&parsed, request_id)? {
        return Ok(value);
    }

    Err("MCP response did not include a matching result.".to_string())
}

fn parse_sse_response(body: &str, request_id: u64) -> Result<Value, String> {
    let events = parse_sse_events(body);
    for event_data in events {
        if event_data.trim() == "[DONE]" {
            continue;
        }
        let parsed = serde_json::from_str::<Value>(&event_data)
            .map_err(|error| format!("Failed to parse SSE data as JSON: {}", error))?;

        if let Some(value) = extract_result_by_request_id(&parsed, request_id)? {
            return Ok(value);
        }
    }

    Err("MCP SSE response did not include a matching result.".to_string())
}

fn parse_sse_events(body: &str) -> Vec<String> {
    let mut events = Vec::new();
    let mut current_data = Vec::new();

    for line in body.lines() {
        if line.trim().is_empty() {
            if !current_data.is_empty() {
                events.push(current_data.join("\n"));
                current_data.clear();
            }
            continue;
        }

        if let Some(data) = line.strip_prefix("data:") {
            current_data.push(data.trim().to_string());
        }
    }

    if !current_data.is_empty() {
        events.push(current_data.join("\n"));
    }

    events
}

fn extract_result_by_request_id(parsed: &Value, request_id: u64) -> Result<Option<Value>, String> {
    if let Some(items) = parsed.as_array() {
        for item in items {
            if let Some(result) = extract_result_by_request_id(item, request_id)? {
                return Ok(Some(result));
            }
        }
        return Ok(None);
    }

    let id_matches = parsed
        .get("id")
        .and_then(Value::as_u64)
        .map(|id| id == request_id)
        .unwrap_or(false);

    if !id_matches {
        return Ok(None);
    }

    if let Some(error) = parsed.get("error") {
        let message = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Unknown MCP error");
        return Err(message.to_string());
    }

    Ok(Some(
        parsed
            .get("result")
            .cloned()
            .unwrap_or_else(|| json!({ "content": [] })),
    ))
}

fn update_session_id_from_headers(headers: &HeaderMap, session_id: &mut Option<String>) {
    for key in ["mcp-session-id", "Mcp-Session-Id"] {
        if let Some(value) = headers.get(key) {
            if let Ok(parsed) = value.to_str() {
                if !parsed.trim().is_empty() {
                    *session_id = Some(parsed.trim().to_string());
                }
            }
        }
    }
}

fn truncate_error_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.len() <= 220 {
        return trimmed.to_string();
    }
    format!("{}...", &trimmed[..220])
}

fn should_try_sse_fallback(error: &str) -> bool {
    ["404", "405", "406", "415", "501"]
        .iter()
        .any(|code| error.contains(code))
}

#[tauri::command]
pub fn mcp_connect_server(
    state: State<'_, McpRuntimeState>,
    config: McpServerConfig,
) -> Result<McpConnectResponse, String> {
    validate_server_config(&config)?;

    if let Some(existing) = state
        .runtimes
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?
        .remove(&config.id)
    {
        if let Ok(mut runtime) = existing.lock() {
            runtime.kill();
        }
    }

    let transport = config.transport.trim().to_lowercase();
    let startup_timeout = config.startup_timeout_ms.unwrap_or(12_000);

    let mut runtime = if transport == "stdio" {
        let mut command = Command::new(&config.command);
        command.args(config.args.clone());
        command.stdin(Stdio::piped());
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());
        if let Some(cwd) = &config.cwd {
            if !cwd.trim().is_empty() {
                command.current_dir(cwd);
            }
        }
        for (key, value) in &config.env {
            command.env(key, value);
        }

        let mut child = command
            .spawn()
            .map_err(|_| "Could not start this MCP server. Check the command and arguments.".to_string())?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to open MCP stdin.".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to open MCP stdout.".to_string())?;
        if let Some(stderr) = child.stderr.take() {
            spawn_stderr_drain(stderr, config.id.clone());
        }

        let rx = spawn_stdout_reader(stdout);
        McpServerRuntime::Stdio(McpStdioRuntime {
            server_id: config.id.clone(),
            child,
            stdin,
            rx,
            next_id: 1,
            tools: Vec::new(),
            last_error: None,
        })
    } else {
        McpServerRuntime::Http(McpHttpRuntime {
            server_id: config.id.clone(),
            endpoint_url: config
                .endpoint_url
                .clone()
                .unwrap_or_default()
                .trim()
                .to_string(),
            headers: config.headers.clone(),
            session_id: None,
            next_id: 1,
            tools: Vec::new(),
            last_error: None,
            enable_legacy_sse_fallback: config.enable_legacy_sse_fallback.unwrap_or(true),
        })
    };

    runtime.initialize(startup_timeout).map_err(|error| {
        runtime.kill();
        format!("Could not initialize this MCP server: {}", error)
    })?;

    let warning = runtime.refresh_tools(startup_timeout).map_err(|error| {
        runtime.kill();
        format!("Could not list tools from this MCP server: {}", error)
    })?;

    let tools = runtime.tools();
    let runtime = Arc::new(Mutex::new(runtime));
    state
        .runtimes
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?
        .insert(config.id.clone(), runtime);

    Ok(McpConnectResponse {
        server_id: config.id,
        status: "Connected".to_string(),
        tools,
        warning,
    })
}

#[tauri::command]
pub fn mcp_disconnect_server(
    state: State<'_, McpRuntimeState>,
    server_id: String,
) -> Result<(), String> {
    let runtime = state
        .runtimes
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?
        .remove(&server_id);

    if let Some(runtime) = runtime {
        if let Ok(mut runtime) = runtime.lock() {
            runtime.kill();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn mcp_get_server_statuses(state: State<'_, McpRuntimeState>) -> Result<Vec<McpServerStatus>, String> {
    let runtimes = state
        .runtimes
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?;

    let mut statuses = Vec::new();
    for runtime in runtimes.values() {
        let Ok(mut runtime) = runtime.lock() else {
            continue;
        };
        let connected = runtime.is_alive();
        let status = if connected { "Connected" } else { "Disconnected" };
        statuses.push(McpServerStatus {
            server_id: runtime.server_id(),
            status: status.to_string(),
            error: runtime.last_error(),
            tool_count: runtime.tools().len(),
        });
    }

    Ok(statuses)
}

#[tauri::command]
pub fn mcp_refresh_server_tools(
    state: State<'_, McpRuntimeState>,
    server_id: String,
) -> Result<McpRefreshToolsResponse, String> {
    let runtime = state
        .runtimes
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?
        .get(&server_id)
        .cloned()
        .ok_or_else(|| "This MCP server is disconnected.".to_string())?;

    let mut runtime = runtime
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?;
    let warning = runtime.refresh_tools(12_000)?;
    Ok(McpRefreshToolsResponse {
        server_id,
        tools: runtime.tools(),
        warning,
    })
}

#[tauri::command]
pub fn mcp_call_tool(
    state: State<'_, McpRuntimeState>,
    request: McpCallToolRequest,
) -> Result<McpCallToolResponse, String> {
    let runtime = state
        .runtimes
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?
        .get(&request.server_id)
        .cloned()
        .ok_or_else(|| "This MCP server is disconnected unexpectedly.".to_string())?;

    let mut runtime = runtime
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?;
    if !runtime.is_alive() {
        return Err("This MCP server disconnected unexpectedly.".to_string());
    }

    let timeout_ms = request.timeout_ms.unwrap_or(15_000);
    let result = runtime.request(
        "tools/call",
        Some(json!({
            "name": request.tool_name,
            "arguments": request.arguments
        })),
        timeout_ms,
    )?;

    Ok(McpCallToolResponse { result })
}

#[tauri::command]
pub fn mcp_read_resource(
    state: State<'_, McpRuntimeState>,
    request: McpReadResourceRequest,
) -> Result<McpReadResourceResponse, String> {
    let runtime = state
        .runtimes
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?
        .get(&request.server_id)
        .cloned()
        .ok_or_else(|| "This MCP server is disconnected unexpectedly.".to_string())?;

    let mut runtime = runtime
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?;
    if !runtime.is_alive() {
        return Err("This MCP server disconnected unexpectedly.".to_string());
    }

    let timeout_ms = request.timeout_ms.unwrap_or(15_000);
    let result = runtime.request(
        "resources/read",
        Some(json!({
            "uri": request.uri
        })),
        timeout_ms,
    )?;

    Ok(McpReadResourceResponse { result })
}

#[tauri::command]
pub fn mcp_request(
    state: State<'_, McpRuntimeState>,
    request: McpRequestRequest,
) -> Result<McpRequestResponse, String> {
    let runtime = state
        .runtimes
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?
        .get(&request.server_id)
        .cloned()
        .ok_or_else(|| "This MCP server is disconnected unexpectedly.".to_string())?;

    let mut runtime = runtime
        .lock()
        .map_err(|_| "MCP runtime lock poisoned".to_string())?;
    if !runtime.is_alive() {
        return Err("This MCP server disconnected unexpectedly.".to_string());
    }

    let timeout_ms = request.timeout_ms.unwrap_or(15_000);
    let result = runtime.request(&request.method, request.params, timeout_ms)?;
    Ok(McpRequestResponse { result })
}

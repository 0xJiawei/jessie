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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpRefreshToolsResponse {
    pub server_id: String,
    pub tools: Vec<McpTool>,
    pub warning: Option<String>,
}

struct McpServerRuntime {
    server_id: String,
    child: Child,
    stdin: ChildStdin,
    rx: mpsc::Receiver<Value>,
    next_id: u64,
    tools: Vec<McpTool>,
    last_error: Option<String>,
}

impl McpServerRuntime {
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

    fn initialize(&mut self, timeout_ms: u64) -> Result<(), String> {
        let _ = self.request(
            "initialize",
            Some(json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "Jessie",
                    "version": "0.1.0"
                }
            })),
            timeout_ms,
        )?;

        write_json_rpc_message(
            &mut self.stdin,
            &json!({
                "jsonrpc": "2.0",
                "method": "notifications/initialized",
                "params": {}
            }),
        )?;

        Ok(())
    }

    fn refresh_tools(&mut self, timeout_ms: u64) -> Result<Option<String>, String> {
        let result = self.request("tools/list", Some(json!({})), timeout_ms)?;
        let (tools, malformed_count) = parse_tools_from_result(&result);
        self.tools = tools;
        if malformed_count > 0 {
            return Ok(Some(
                "This server connected, but its tool definitions were invalid.".to_string(),
            ));
        }
        Ok(None)
    }

    fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
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
        });
    }

    (tools, malformed_count)
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
    if config.command.trim().is_empty() {
        return Err("Command is required for stdio MCP server.".to_string());
    }
    if config.transport.trim().to_lowercase() != "stdio" {
        return Err("Only stdio transport is supported in MCP v1.".to_string());
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
    Ok(())
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
    let mut runtime = McpServerRuntime {
        server_id: config.id.clone(),
        child,
        stdin,
        rx,
        next_id: 1,
        tools: Vec::new(),
        last_error: None,
    };

    let startup_timeout = config.startup_timeout_ms.unwrap_or(12_000);
    runtime
        .initialize(startup_timeout)
        .map_err(|error| {
            runtime.kill();
            format!("Could not initialize this MCP server: {}", error)
        })?;

    let warning = runtime.refresh_tools(startup_timeout).map_err(|error| {
        runtime.kill();
        format!("Could not list tools from this MCP server: {}", error)
    })?;

    let tools = runtime.tools.clone();
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
        let connected = runtime.is_alive().unwrap_or(false);
        let status = if connected { "Connected" } else { "Disconnected" };
        statuses.push(McpServerStatus {
            server_id: runtime.server_id.clone(),
            status: status.to_string(),
            error: runtime.last_error.clone(),
            tool_count: runtime.tools.len(),
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
        tools: runtime.tools.clone(),
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
    if !runtime.is_alive().unwrap_or(false) {
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

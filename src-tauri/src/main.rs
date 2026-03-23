#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod mcp;

fn main() {
    tauri::Builder::default()
        .manage(mcp::McpRuntimeState::default())
        .invoke_handler(tauri::generate_handler![
            mcp::mcp_connect_server,
            mcp::mcp_disconnect_server,
            mcp::mcp_get_server_statuses,
            mcp::mcp_refresh_server_tools,
            mcp::mcp_call_tool,
            mcp::mcp_read_resource,
            mcp::mcp_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

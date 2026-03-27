// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// ── Bun Sidecar ─────────────────────────────────────────────────────────────

struct BunProcess(Option<Child>);

impl Drop for BunProcess {
    fn drop(&mut self) {
        if let Some(ref mut child) = self.0 {
            let _ = child.kill();
        }
    }
}

fn find_bun() -> Option<String> {
    let candidates = [
        dirs::home_dir().map(|h| h.join(".bun/bin/bun").to_string_lossy().to_string()),
        Some("bun".to_string()),
    ];
    for candidate in candidates.into_iter().flatten() {
        if Command::new(&candidate)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok()
        {
            return Some(candidate);
        }
    }
    None
}

fn spawn_bun_server(app: &AppHandle) -> Result<Child, String> {
    let bun = find_bun().ok_or("Bun not found. Install from https://bun.sh")?;

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Cannot find resource dir: {}", e))?;

    // In dev mode, server is in the project root. In release, it's bundled in Resources.
    let server_script = if cfg!(debug_assertions) {
        std::env::current_dir()
            .unwrap_or_default()
            .join("server/index.ts")
    } else {
        resource_dir.join("_up_/server/index.ts")
    };

    if !server_script.exists() {
        return Err(format!("Server script not found: {:?}", server_script));
    }

    // Set working directory to where server script lives so relative paths work
    let server_dir = server_script.parent().unwrap().parent().unwrap();

    let child = Command::new(&bun)
        .arg("run")
        .arg(&server_script)
        .current_dir(server_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Bun: {}", e))?;

    Ok(child)
}

// ── PTY Management ──────────────────────────────────────────────────────────

struct PtyInstance {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    _child: Box<dyn portable_pty::Child + Send>,
}

struct PtyState {
    instances: HashMap<String, PtyInstance>,
}

#[derive(Serialize, Deserialize)]
struct SpawnResult {
    terminal_id: String,
}

#[tauri::command]
fn pty_spawn(
    state: tauri::State<'_, Arc<Mutex<PtyState>>>,
    app: AppHandle,
    cols: u16,
    rows: u16,
    cwd: String,
    terminal_id: String,
) -> Result<SpawnResult, String> {
    let pty_system = NativePtySystem::default();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "windows") {
            "powershell.exe".to_string()
        } else {
            "/bin/zsh".to_string()
        }
    });

    let mut cmd = CommandBuilder::new(&shell);
    if !cfg!(target_os = "windows") {
        cmd.arg("-l");
    }
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("OBSERVATORY_TERMINAL_ID", &terminal_id);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take writer: {}", e))?;

    // Read PTY output in a background thread, emit to frontend
    let tid = terminal_id.clone();
    std::thread::spawn(move || {
        let mut buf_reader = BufReader::with_capacity(4096, reader);
        let mut buf = [0u8; 4096];
        loop {
            match std::io::Read::read(&mut buf_reader, &mut buf) {
                Ok(0) => {
                    let _ = app.emit(&format!("pty-exit-{}", tid), ());
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app.emit(&format!("pty-data-{}", tid), data);
                }
                Err(_) => break,
            }
        }
    });

    let mut pty_state = state.lock().map_err(|e| e.to_string())?;
    pty_state.instances.insert(
        terminal_id.clone(),
        PtyInstance {
            writer,
            master: pair.master,
            _child: child,
        },
    );

    Ok(SpawnResult { terminal_id })
}

#[tauri::command]
fn pty_write(
    state: tauri::State<'_, Arc<Mutex<PtyState>>>,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    let mut pty_state = state.lock().map_err(|e| e.to_string())?;
    if let Some(instance) = pty_state.instances.get_mut(&terminal_id) {
        instance
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Write failed: {}", e))?;
        instance
            .writer
            .flush()
            .map_err(|e| format!("Flush failed: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn pty_resize(
    state: tauri::State<'_, Arc<Mutex<PtyState>>>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pty_state = state.lock().map_err(|e| e.to_string())?;
    if let Some(instance) = pty_state.instances.get(&terminal_id) {
        instance
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize failed: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn pty_kill(
    state: tauri::State<'_, Arc<Mutex<PtyState>>>,
    terminal_id: String,
) -> Result<(), String> {
    let mut pty_state = state.lock().map_err(|e| e.to_string())?;
    pty_state.instances.remove(&terminal_id);
    Ok(())
}

// ── Hook Setup ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct HookStatus {
    configured: bool,
    hooks_path: String,
}

#[tauri::command]
fn check_hooks() -> HookStatus {
    let home = dirs::home_dir().unwrap_or_default();
    let settings_path = home.join(".claude/settings.json");

    let configured = if let Ok(contents) = std::fs::read_to_string(&settings_path) {
        contents.contains("observatory-hook")
    } else {
        false
    };

    HookStatus {
        configured,
        hooks_path: settings_path.to_string_lossy().to_string(),
    }
}

#[tauri::command]
fn setup_hooks() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let hooks_dir = home.join(".claude/hooks");
    let settings_path = home.join(".claude/settings.json");

    std::fs::create_dir_all(&hooks_dir).map_err(|e| e.to_string())?;

    let hook_js = include_str!("../../hooks/observatory-hook.js");
    let hook_path = hooks_dir.join("observatory-hook.js");
    std::fs::write(&hook_path, hook_js).map_err(|e| e.to_string())?;

    let mut settings: serde_json::Value = if settings_path.exists() {
        let contents = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&contents).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let hook_command = format!("node {}", hook_path.to_string_lossy());

    let hook_entry = serde_json::json!([{
        "matcher": "",
        "hooks": [{
            "type": "command",
            "command": hook_command
        }]
    }]);

    let hooks = settings
        .as_object_mut()
        .ok_or("Invalid settings format")?
        .entry("hooks")
        .or_insert(serde_json::json!({}));

    let hooks_obj = hooks.as_object_mut().ok_or("Invalid hooks format")?;
    for event in &["PreToolUse", "PostToolUse", "Stop", "UserPromptSubmit"] {
        hooks_obj.insert(event.to_string(), hook_entry.clone());
    }

    let formatted = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, formatted).map_err(|e| e.to_string())?;

    Ok("Hooks configured successfully".to_string())
}

// ── Main ────────────────────────────────────────────────────────────────────

fn main() {
    let pty_state = Arc::new(Mutex::new(PtyState {
        instances: HashMap::new(),
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(pty_state)
        .setup(|app| {
            let handle = app.handle().clone();
            match spawn_bun_server(&handle) {
                Ok(child) => {
                    app.manage(BunProcess(Some(child)));
                    println!("Bun server started");
                }
                Err(e) => {
                    eprintln!("Failed to start Bun server: {}", e);
                }
            }

            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let url = "http://localhost:7337";
                for _ in 0..50 {
                    if ureq::get(url).call().is_ok() {
                        let _ = WebviewWindowBuilder::new(
                            &app_handle,
                            "main",
                            WebviewUrl::External(url.parse().unwrap()),
                        )
                        .title("Observatory")
                        .inner_size(1200.0, 800.0)
                        .build();
                        return;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                eprintln!("Server did not start within 5 seconds");
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            check_hooks,
            setup_hooks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

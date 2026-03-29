// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// ── Bun Sidecar ─────────────────────────────────────────────────────────────

struct BunProcess(Mutex<Option<Child>>);

impl BunProcess {
    fn new(child: Child) -> Self {
        Self(Mutex::new(Some(child)))
    }

    /// Kill the Bun sidecar process explicitly.
    fn kill(&self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(ref mut child) = *guard {
                println!("[observatory] killing Bun sidecar (pid={})", child.id());
                let _ = child.kill();
                let _ = child.wait();
            }
            *guard = None;
        }
    }
}

impl Drop for BunProcess {
    fn drop(&mut self) {
        self.kill();
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
            .map_err(|e| format!("Cannot determine current directory: {}", e))?
            .join("server/index.ts")
    } else {
        resource_dir.join("_up_/server/index.ts")
    };

    if !server_script.exists() {
        return Err(format!("Server script not found: {:?}", server_script));
    }

    // Set working directory to where server script lives so relative paths work
    let server_dir = server_script
        .parent()
        .and_then(|p| p.parent())
        .ok_or_else(|| format!("Cannot determine server directory from {:?}", server_script))?;

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
    child: Box<dyn portable_pty::Child + Send>,
}

impl PtyInstance {
    /// Kill the child process explicitly, with a timeout fallback.
    fn kill(&mut self) {
        // Try graceful kill first, then force
        let _ = self.child.kill();
        // Wait briefly to avoid zombies
        match self.child.try_wait() {
            Ok(Some(_)) => {} // already exited
            _ => {
                // Give it 100ms then move on — OS will reap on Drop
                std::thread::sleep(std::time::Duration::from_millis(100));
                let _ = self.child.try_wait();
            }
        }
    }
}

struct PtyState {
    instances: HashMap<String, PtyInstance>,
    /// Global shutdown flag — reader threads check this to exit cleanly
    shutdown: Arc<AtomicBool>,
}

impl PtyState {
    fn new() -> Self {
        Self {
            instances: HashMap::new(),
            shutdown: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Kill all PTY instances. Called on app exit.
    fn kill_all(&mut self) {
        self.shutdown.store(true, Ordering::SeqCst);
        for (id, inst) in self.instances.iter_mut() {
            println!("[pty] shutting down {}", id);
            inst.kill();
        }
        self.instances.clear();
    }
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

    // Grab shutdown flag before locking state
    let shutdown_flag = {
        let pty_state = state.lock().map_err(|e| e.to_string())?;
        Arc::clone(&pty_state.shutdown)
    };

    // Read PTY output in a background thread, emit to frontend
    let tid = terminal_id.clone();
    std::thread::Builder::new()
        .name(format!("pty-reader-{}", &terminal_id))
        .spawn(move || {
            let mut buf_reader = BufReader::with_capacity(4096, reader);
            let mut buf = [0u8; 4096];
            loop {
                if shutdown_flag.load(Ordering::SeqCst) {
                    break;
                }
                match std::io::Read::read(&mut buf_reader, &mut buf) {
                    Ok(0) => {
                        let _ = app.emit(&format!("pty-exit-{}", tid), ());
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app.emit(&format!("pty-data-{}", tid), data);
                    }
                    Err(e) => {
                        eprintln!("[pty] reader error for {}: {}", tid, e);
                        let _ = app.emit(&format!("pty-exit-{}", tid), ());
                        break;
                    }
                }
            }
        })
        .map_err(|e| format!("Failed to spawn reader thread: {}", e))?;

    let mut pty_state = state.lock().map_err(|e| e.to_string())?;
    pty_state.instances.insert(
        terminal_id.clone(),
        PtyInstance {
            writer,
            master: pair.master,
            child,
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
    if let Some(mut instance) = pty_state.instances.remove(&terminal_id) {
        instance.kill();
        println!("[pty] killed {}", terminal_id);
    }
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

    let hook_js = include_str!("../../observatory-hook.js");
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
    let pty_state = Arc::new(Mutex::new(PtyState::new()));
    let pty_state_for_exit = Arc::clone(&pty_state);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(pty_state)
        .setup(|app| {
            let handle = app.handle().clone();
            match spawn_bun_server(&handle) {
                Ok(child) => {
                    println!("Bun server started (pid={})", child.id());
                    app.manage(BunProcess::new(child));
                }
                Err(e) => {
                    eprintln!("Failed to start Bun server: {}", e);
                }
            }

            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let url = "http://localhost:7337";
                for i in 0..50 {
                    if ureq::get(url).call().is_ok() {
                        match WebviewWindowBuilder::new(
                            &app_handle,
                            "main",
                            WebviewUrl::External(url.parse().unwrap()),
                        )
                        .title("Observatory")
                        .inner_size(1200.0, 800.0)
                        .build()
                        {
                            Ok(_) => println!("Window created"),
                            Err(e) => {
                                eprintln!("Failed to create window: {}", e);
                                // Kill Bun since we can't show UI
                                if let Some(bun) = app_handle.try_state::<BunProcess>() {
                                    bun.kill();
                                }
                            }
                        }
                        return;
                    }
                    if i == 49 {
                        eprintln!("Server did not start within 5 seconds — killing Bun sidecar");
                        // BunProcess Drop will kill it when app exits
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                println!("[observatory] shutting down — cleaning up PTYs and sidecar");
                // Kill all PTY child processes
                if let Ok(mut state) = pty_state_for_exit.lock() {
                    state.kill_all();
                }
                // Explicitly kill Bun sidecar (Drop would also do this, but be explicit)
                if let Some(bun) = app_handle.try_state::<BunProcess>() {
                    bun.kill();
                }
            }
        });
}

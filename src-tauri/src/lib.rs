// Plume's native side: file access inside a book folder, and the `claude`
// command line run on the user's subscription, streamed back line by line.
use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct Runs(Arc<Mutex<HashMap<String, Child>>>);

/// Joins a path relative to the book folder, refusing anything that could leave it.
fn safe_join(root: &str, rel: &str) -> Result<PathBuf, String> {
    let r = Path::new(rel);
    let escapes = r.components().any(|c| {
        matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_))
    });
    if rel.is_empty() || escapes {
        return Err(format!("Path outside the book folder: {rel}"));
    }
    Ok(Path::new(root).join(r))
}

#[tauri::command]
fn read_text(root: String, rel: String) -> Result<String, String> {
    std::fs::read_to_string(safe_join(&root, &rel)?).map_err(|e| format!("{rel}: {e}"))
}

/// Writes to a temp file first, then swaps it in, so a crash never leaves half a file.
#[tauri::command]
fn write_text(root: String, rel: String, content: String) -> Result<(), String> {
    let path = safe_join(&root, &rel)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("plume-tmp");
    std::fs::write(&tmp, content).map_err(|e| format!("{rel}: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("{rel}: {e}"))
}

/// Plume's own small data files (the prompt library), in its folder on this computer.
fn app_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(format!("Bad file name: {name}"));
    }
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("data");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

#[tauri::command]
fn app_read(app: AppHandle, name: String) -> Result<String, String> {
    std::fs::read_to_string(app_file(&app, &name)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_write(app: AppHandle, name: String, content: String) -> Result<(), String> {
    std::fs::write(app_file(&app, &name)?, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(root: String, rel: String) -> bool {
    if rel.is_empty() {
        return Path::new(&root).exists();
    }
    safe_join(&root, &rel).map(|p| p.exists()).unwrap_or(false)
}

/// Every .md file under `rel`, as forward-slash paths relative to the book folder.
#[tauri::command]
fn list_files(root: String, rel: String) -> Result<Vec<String>, String> {
    fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(&p, base, out);
            } else if p.extension().is_some_and(|x| x == "md") {
                if let Ok(r) = p.strip_prefix(base) {
                    out.push(r.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
    let mut out = Vec::new();
    walk(&safe_join(&root, &rel)?, Path::new(&root), &mut out);
    out.sort();
    Ok(out)
}

/// Nothing is deleted: removed files go to .plume/trash inside the book.
#[tauri::command]
fn move_to_trash(root: String, rel: String) -> Result<(), String> {
    let from = safe_join(&root, &rel)?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let name = rel.replace('/', "__");
    let to = safe_join(&root, &format!(".plume/trash/{stamp}-{name}"))?;
    std::fs::create_dir_all(to.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::rename(from, to).map_err(|e| e.to_string())
}

// --- Binary files, outside files, backups --------------------------------------
// Pictures, imports, exports and backups move as base64 text between the two sides.

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn b64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(B64[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

fn b64_decode(text: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(text.len() / 4 * 3);
    let mut buf = 0u32;
    let mut bits = 0;
    for c in text.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\n' | b'\r' => continue,
            _ => return Err("Invalid base64".into()),
        } as u32;
        buf = buf << 6 | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits & 255) as u8);
        }
    }
    Ok(out)
}

/// A file of the book as base64 (pictures, the map).
#[tauri::command]
fn read_base64(root: String, rel: String) -> Result<String, String> {
    std::fs::read(safe_join(&root, &rel)?).map(|d| b64_encode(&d)).map_err(|e| format!("{rel}: {e}"))
}

/// Copies a file the user picked into the book (a portrait, a map).
#[tauri::command]
fn copy_into(root: String, src: String, rel: String) -> Result<(), String> {
    let to = safe_join(&root, &rel)?;
    if let Some(dir) = to.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &to).map(|_| ()).map_err(|e| format!("{src}: {e}"))
}

/// A file the user picked to import (.docx, .md), as base64.
#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    std::fs::read(&path).map(|d| b64_encode(&d)).map_err(|e| format!("{path}: {e}"))
}

/// An export, written where the user chose.
#[tauri::command]
fn write_file_base64(path: String, data: String) -> Result<(), String> {
    std::fs::write(&path, b64_decode(&data)?).map_err(|e| format!("{path}: {e}"))
}

/// Every file of the book except Plume's own folder, for a backup.
#[tauri::command]
fn list_all(root: String) -> Vec<String> {
    fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for e in entries.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().into_owned();
            if name == ".plume" || name.ends_with(".plume-tmp") {
                continue;
            }
            if p.is_dir() {
                walk(&p, base, out);
            } else if let Ok(r) = p.strip_prefix(base) {
                out.push(r.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    let mut out = Vec::new();
    walk(Path::new(&root), Path::new(&root), &mut out);
    out
}

/// Writes today's backup zip of a book and removes the ones older than two weeks.
#[tauri::command]
fn write_backup(app: AppHandle, name: String, date: String, data: String) -> Result<String, String> {
    let safe: String = name.chars().map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' }).collect();
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("backups").join(safe.trim());
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join(format!("{date}.zip"));
    std::fs::write(&file, b64_decode(&data)?).map_err(|e| e.to_string())?;
    let cutoff = SystemTime::now() - std::time::Duration::from_secs(14 * 24 * 3600);
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let old = e.metadata().and_then(|m| m.modified()).map(|t| t < cutoff).unwrap_or(false);
            if old {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    Ok(file.to_string_lossy().into_owned())
}

/// Backups already made for a book, newest first.
#[tauri::command]
fn list_backups(app: AppHandle, name: String) -> Vec<String> {
    let safe: String = name.chars().map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' }).collect();
    let Ok(dir) = app.path().app_local_data_dir().map(|d| d.join("backups").join(safe.trim())) else { return vec![] };
    let mut out: Vec<String> = std::fs::read_dir(&dir).map(|r| r.flatten().map(|e| e.path().to_string_lossy().into_owned()).collect()).unwrap_or_default();
    out.sort();
    out.reverse();
    out
}

/// When a file of the book last changed (ms), for safe sync; 0 if missing.
#[tauri::command]
fn file_mtime(root: String, rel: String) -> u64 {
    safe_join(&root, &rel)
        .ok()
        .and_then(|p| std::fs::metadata(p).ok())
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// This computer's name, so two devices on a synced folder can tell each other apart.
#[tauri::command]
fn device_name() -> String {
    std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).unwrap_or_else(|_| "this computer".into())
}

#[tauri::command]
fn find_claude(custom: Option<String>) -> Option<String> {
    if let Some(c) = custom.filter(|c| !c.trim().is_empty()) {
        return Path::new(&c).is_file().then_some(c);
    }
    let names = ["claude.exe", "claude.cmd", "claude"];
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            for n in names {
                let p = dir.join(n);
                if p.is_file() {
                    return Some(p.to_string_lossy().into_owned());
                }
            }
        }
    }
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    let p = Path::new(&home).join(".local/bin/claude.exe");
    p.is_file().then(|| p.to_string_lossy().into_owned())
}

#[derive(Clone, Serialize)]
struct Line {
    id: String,
    line: String,
}

#[derive(Clone, Serialize)]
struct Done {
    id: String,
    code: Option<i32>,
    stderr: String,
}

/// Runs one stripped-down `claude -p` call. The system prompt goes through a
/// file (no command-line length limit) and the message through stdin.
#[tauri::command]
fn run_claude(
    app: AppHandle,
    runs: State<Runs>,
    id: String,
    exe: String,
    model: String,
    effort: String,
    system: String,
    message: String,
    tools: Option<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    // An empty folder of Plume's own, so no CLAUDE.md or project file is ever read.
    let run_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("run");
    std::fs::create_dir_all(&run_dir).map_err(|e| e.to_string())?;
    let sp_file = run_dir.join(format!("system-{id}.txt"));
    std::fs::write(&sp_file, system).map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&exe);
    // Writing calls get no tools at all; agent tasks get read-only ones (or web search), pre-approved.
    let tools = tools.unwrap_or_default();
    cmd.args(["-p", "--safe-mode", "--tools", &tools]);
    if !tools.is_empty() {
        cmd.args(["--allowedTools", &tools]);
    }
    cmd.args([
        "--strict-mcp-config", "--disable-slash-commands",
        "--no-session-persistence", "--output-format", "stream-json",
        "--include-partial-messages", "--verbose", "--model", &model,
    ]);
    if !effort.is_empty() {
        cmd.args(["--effort", &effort]);
    }
    cmd.arg("--system-prompt-file").arg(&sp_file);
    // Agent tasks read the book folder; everything else runs in Plume's empty folder.
    let work_dir = cwd.filter(|c| Path::new(c).is_dir()).map(PathBuf::from).unwrap_or(run_dir.clone());
    cmd.current_dir(&work_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|e| format!("Could not start claude: {e}"))?;
    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    runs.0.lock().unwrap().insert(id.clone(), child);

    std::thread::spawn(move || {
        let _ = stdin.write_all(message.as_bytes());
    });
    let err_text = Arc::new(Mutex::new(String::new()));
    let err_sink = err_text.clone();
    let err_thread = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stderr.read_to_string(&mut s);
        *err_sink.lock().unwrap() = s;
    });
    let map = runs.0.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = app.emit("claude-line", Line { id: id.clone(), line });
        }
        let _ = err_thread.join();
        let code = map.lock().unwrap().remove(&id).and_then(|mut c| c.wait().ok()).and_then(|s| s.code());
        let _ = std::fs::remove_file(&sp_file);
        let stderr = err_text.lock().unwrap().clone();
        let _ = app.emit("claude-done", Done { id, code, stderr });
    });
    Ok(())
}

#[tauri::command]
fn cancel_claude(runs: State<Runs>, id: String) {
    if let Some(child) = runs.0.lock().unwrap().get_mut(&id) {
        let _ = child.kill();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Runs::default())
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_text,
            app_read,
            app_write,
            path_exists,
            list_files,
            move_to_trash,
            find_claude,
            run_claude,
            cancel_claude,
            read_base64,
            copy_into,
            read_file_base64,
            write_file_base64,
            list_all,
            write_backup,
            list_backups,
            file_mtime,
            device_name
        ])
        .run(tauri::generate_context!())
        .expect("error while running Plume");
}

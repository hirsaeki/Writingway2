use keyring::{Entry, Error as KeyringError};
use reqwest::header::{HeaderName, HeaderValue, CONTENT_TYPE};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use tauri::Manager;
use url::Url;

const SECRET_SERVICE: &str = "Writingway 2";
const AI_API_KEY_SECRET_KEY: &str = "ai.apiKey";

fn validate_secret_key(key: &str) -> Result<String, String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("Secret key is required.".to_string());
    }
    if trimmed.len() > 128 {
        return Err("Secret key is too long.".to_string());
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | ':'))
    {
        return Err("Secret key contains unsupported characters.".to_string());
    }
    Ok(trimmed.to_string())
}

fn secret_entry(key: &str) -> Result<Entry, String> {
    Entry::new(SECRET_SERVICE, key).map_err(secret_storage_error)
}

fn secret_storage_error(error: KeyringError) -> String {
    match error {
        KeyringError::NoEntry => "Secret was not found.".to_string(),
        _ => "Native secret storage is unavailable.".to_string(),
    }
}

fn load_optional_secret(key: &str) -> Result<String, String> {
    let key = validate_secret_key(key)?;
    let entry = secret_entry(&key)?;
    match entry.get_password() {
        Ok(secret) => Ok(secret),
        Err(KeyringError::NoEntry) => Ok(String::new()),
        Err(error) => Err(secret_storage_error(error)),
    }
}

#[tauri::command]
fn writingway2_save_secret(key: String, value: String) -> Result<(), String> {
    let key = validate_secret_key(&key)?;
    if value.is_empty() {
        return writingway2_delete_secret(key);
    }
    let entry = secret_entry(&key)?;
    entry.set_password(&value).map_err(secret_storage_error)
}

#[tauri::command]
fn writingway2_load_secret(key: String) -> Result<String, String> {
    let key = validate_secret_key(&key)?;
    let entry = secret_entry(&key)?;
    match entry.get_password() {
        Ok(secret) => Ok(secret),
        Err(KeyringError::NoEntry) => Ok(String::new()),
        Err(error) => Err(secret_storage_error(error)),
    }
}

#[tauri::command]
fn writingway2_delete_secret(key: String) -> Result<(), String> {
    let key = validate_secret_key(&key)?;
    let entry = secret_entry(&key)?;
    match entry.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(secret_storage_error(error)),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiProxyRequest {
    provider: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiProxyResponse {
    status: u16,
    status_text: String,
    content_type: String,
    body: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SqliteStorageStatus {
    kind: String,
    ready: bool,
    active: bool,
    database_name: String,
    database_path: String,
    existed_before_open: bool,
    schema_version: i64,
}

fn normalize_ai_provider(provider: &str) -> Result<String, String> {
    let normalized = provider.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "openai" | "openrouter" | "nanogpt" | "custom" | "lmstudio" | "ollama" => Ok(normalized),
        _ => Err("AI proxy provider is not supported.".to_string()),
    }
}

fn is_local_host(host: &str) -> bool {
    host == "localhost" || host == "::1" || host == "127.0.0.1" || host.starts_with("127.")
}

fn validate_ai_proxy_url(provider: &str, url: &str) -> Result<String, String> {
    let parsed = Url::parse(url).map_err(|_| "AI proxy URL is invalid.".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("AI proxy URL must use HTTP or HTTPS.".to_string());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "AI proxy URL must include a host.".to_string())?;
    let host = host.to_ascii_lowercase();
    let allowed = match provider {
        "openai" => host == "api.openai.com",
        "openrouter" => host == "openrouter.ai",
        "nanogpt" => host == "nano-gpt.com",
        "lmstudio" | "ollama" => is_local_host(&host),
        "custom" => true,
        _ => false,
    };

    if !allowed {
        return Err("AI proxy URL is not allowed for this provider.".to_string());
    }

    Ok(parsed.to_string())
}

fn provider_requires_secret(provider: &str) -> bool {
    matches!(provider, "openai" | "openrouter" | "nanogpt")
}

fn provider_can_use_bearer_secret(provider: &str) -> bool {
    matches!(provider, "openai" | "openrouter" | "nanogpt" | "custom")
}

fn forwarded_header_name(name: &str) -> Option<HeaderName> {
    match name.to_ascii_lowercase().as_str() {
        "http-referer" => Some(HeaderName::from_static("http-referer")),
        "x-title" => Some(HeaderName::from_static("x-title")),
        _ => None,
    }
}

#[tauri::command]
async fn writingway2_ai_chat_completion(
    request: AiProxyRequest,
) -> Result<AiProxyResponse, String> {
    let provider = normalize_ai_provider(&request.provider)?;
    let url = validate_ai_proxy_url(&provider, &request.url)?;
    let client = reqwest::Client::new();
    let mut builder = client
        .post(url)
        .header(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    if let Some(headers) = &request.headers {
        for (name, value) in headers {
            if let Some(header_name) = forwarded_header_name(name) {
                let header_value = HeaderValue::from_str(value)
                    .map_err(|_| "AI proxy header value is invalid.".to_string())?;
                builder = builder.header(header_name, header_value);
            }
        }
    }

    if provider_can_use_bearer_secret(&provider) {
        let api_key = load_optional_secret(AI_API_KEY_SECRET_KEY)?;
        if provider_requires_secret(&provider) && api_key.is_empty() {
            return Err("API key is required for this provider.".to_string());
        }
        if !api_key.is_empty() {
            builder = builder.bearer_auth(api_key);
        }
    }

    let response = builder
        .json(&request.body)
        .send()
        .await
        .map_err(|_| "AI proxy request failed.".to_string())?;
    let status = response.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response
        .text()
        .await
        .map_err(|_| "AI proxy response could not be read.".to_string())?;

    Ok(AiProxyResponse {
        status: status.as_u16(),
        status_text,
        content_type,
        body,
    })
}

#[tauri::command]
fn writingway2_sqlite_storage_status(app: tauri::AppHandle) -> Result<SqliteStorageStatus, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Could not resolve app data directory.".to_string())?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|_| "Could not create app data directory.".to_string())?;

    let database_name = "writingway2.sqlite3".to_string();
    let database_path = app_data_dir.join(&database_name);
    let existed_before_open = database_path.exists();
    let connection = Connection::open(&database_path)
        .map_err(|_| "Could not open SQLite storage database.".to_string())?;
    let schema_version = connection
        .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
        .map_err(|_| "Could not read SQLite storage schema version.".to_string())?;

    Ok(SqliteStorageStatus {
        kind: "sqlite".to_string(),
        ready: true,
        active: false,
        database_name,
        database_path: database_path.to_string_lossy().to_string(),
        existed_before_open,
        schema_version,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            writingway2_save_secret,
            writingway2_load_secret,
            writingway2_delete_secret,
            writingway2_ai_chat_completion,
            writingway2_sqlite_storage_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

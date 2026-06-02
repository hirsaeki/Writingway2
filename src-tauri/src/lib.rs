use keyring::{Entry, Error as KeyringError};

const SECRET_SERVICE: &str = "Writingway 2";

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            writingway2_save_secret,
            writingway2_load_secret,
            writingway2_delete_secret
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

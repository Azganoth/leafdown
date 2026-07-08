use std::{fs, path::Path};

use serde::Serialize;
use tauri::{plugin::TauriPlugin, AppHandle, Manager, Runtime};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

use crate::path_utils::path_to_string;

pub(crate) const DIAGNOSTIC_LOG_FILE_NAME: &str = "leafdown";
pub(crate) const DIAGNOSTIC_LOG_MAX_FILE_SIZE_BYTES: u64 = 1_048_576;
pub(crate) const DIAGNOSTIC_LOG_FILE_COUNT: usize = 5;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiagnosticsSummary {
    app_name: String,
    app_version: String,
    app_identifier: String,
    operating_system: &'static str,
    architecture: &'static str,
    log_directory_path: String,
    log_file_path: String,
    log_file_name: &'static str,
    log_max_file_size_bytes: u64,
    log_file_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum DiagnosticsError {
    LogDirectoryUnavailable { message: String },
    CreateLogDirectoryFailed { path: String, message: String },
}

pub(crate) fn build_log_plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::LogDir {
            file_name: Some(DIAGNOSTIC_LOG_FILE_NAME.to_owned()),
        }))
        .target(Target::new(TargetKind::Stdout))
        .level(log::LevelFilter::Info)
        .max_file_size(DIAGNOSTIC_LOG_MAX_FILE_SIZE_BYTES.into())
        .rotation_strategy(RotationStrategy::KeepSome(DIAGNOSTIC_LOG_FILE_COUNT))
        .build()
}

#[tauri::command]
pub(crate) fn get_diagnostics_summary(
    app: AppHandle,
) -> Result<DiagnosticsSummary, DiagnosticsError> {
    let log_directory_path =
        app.path()
            .app_log_dir()
            .map_err(|error| DiagnosticsError::LogDirectoryUnavailable {
                message: error.to_string(),
            })?;

    fs::create_dir_all(log_directory_path.as_path()).map_err(|error| {
        DiagnosticsError::CreateLogDirectoryFailed {
            path: path_to_string(log_directory_path.as_path()),
            message: error.to_string(),
        }
    })?;

    Ok(create_diagnostics_summary(
        app.package_info().name.clone(),
        app.package_info().version.to_string(),
        app.config().identifier.clone(),
        log_directory_path.as_path(),
    ))
}

fn create_diagnostics_summary(
    app_name: String,
    app_version: String,
    app_identifier: String,
    log_directory_path: &Path,
) -> DiagnosticsSummary {
    let log_file_path = log_directory_path
        .join(DIAGNOSTIC_LOG_FILE_NAME)
        .with_extension("log");

    DiagnosticsSummary {
        app_name,
        app_version,
        app_identifier,
        operating_system: std::env::consts::OS,
        architecture: std::env::consts::ARCH,
        log_directory_path: path_to_string(log_directory_path),
        log_file_path: path_to_string(log_file_path.as_path()),
        log_file_name: DIAGNOSTIC_LOG_FILE_NAME,
        log_max_file_size_bytes: DIAGNOSTIC_LOG_MAX_FILE_SIZE_BYTES,
        log_file_count: DIAGNOSTIC_LOG_FILE_COUNT,
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::Value;

    use super::{
        create_diagnostics_summary, DIAGNOSTIC_LOG_FILE_COUNT, DIAGNOSTIC_LOG_FILE_NAME,
        DIAGNOSTIC_LOG_MAX_FILE_SIZE_BYTES,
    };

    #[test]
    fn diagnostics_summary_serializes_frontend_contract() {
        let summary = create_diagnostics_summary(
            "Leafdown".to_owned(),
            "0.1.0".to_owned(),
            "com.azganoth.leafdown".to_owned(),
            Path::new("/tmp/leafdown/logs"),
        );
        let value = serde_json::to_value(summary).expect("summary should serialize");

        assert_eq!(json_string(&value, "appName"), "Leafdown");
        assert_eq!(json_string(&value, "appVersion"), "0.1.0");
        assert_eq!(
            json_string(&value, "appIdentifier"),
            "com.azganoth.leafdown"
        );
        assert_eq!(json_string(&value, "logFileName"), DIAGNOSTIC_LOG_FILE_NAME);
        assert_eq!(
            value["logMaxFileSizeBytes"].as_u64(),
            Some(DIAGNOSTIC_LOG_MAX_FILE_SIZE_BYTES)
        );
        assert_eq!(
            value["logFileCount"].as_u64(),
            Some(DIAGNOSTIC_LOG_FILE_COUNT as u64)
        );
        assert!(json_string(&value, "logFilePath").ends_with("leafdown.log"));
    }

    fn json_string<'a>(value: &'a Value, key: &str) -> &'a str {
        value
            .get(key)
            .and_then(Value::as_str)
            .expect("JSON field should be a string")
    }
}

use std::{fs, path::Path};

use serde::Serialize;
use tauri::{plugin::TauriPlugin, AppHandle, Manager, Runtime};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::path_utils::path_to_string;

const BACKEND_LOG_TARGET: &str = "backend";
const FRONTEND_LOG_TARGET: &str = "frontend";
const FALLBACK_LOG_TIMESTAMP: &str = "unknown-time";
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
        .format(|out, message, record| {
            out.finish(format_args!(
                "[{}][{}][{}] {}",
                current_log_timestamp(),
                normalize_log_target(record.target()),
                record.level(),
                message
            ));
        })
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

fn current_log_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| FALLBACK_LOG_TIMESTAMP.to_owned())
}

fn normalize_log_target(target: &str) -> String {
    if target == "webview" || target.starts_with("webview:") {
        return FRONTEND_LOG_TARGET.to_owned();
    }

    target
        .strip_prefix(env!("CARGO_CRATE_NAME"))
        .map(|suffix| format!("{BACKEND_LOG_TARGET}{suffix}"))
        .unwrap_or_else(|| target.to_owned())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::Value;

    use super::{
        create_diagnostics_summary, normalize_log_target, DIAGNOSTIC_LOG_FILE_COUNT,
        DIAGNOSTIC_LOG_FILE_NAME, DIAGNOSTIC_LOG_MAX_FILE_SIZE_BYTES,
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

    #[test]
    fn diagnostic_log_targets_hide_generated_webview_call_sites() {
        assert_eq!(
            normalize_log_target(
                "webview:writeUnexpectedErrorDiagnostic@http://localhost:1420/src/features/diagnostics/services/diagnosticLog.ts:11:8",
            ),
            "frontend"
        );
        assert_eq!(normalize_log_target("webview"), "frontend");
    }

    #[test]
    fn diagnostic_log_targets_keep_backend_module_context() {
        assert_eq!(normalize_log_target("leafdown_lib"), "backend");
        assert_eq!(
            normalize_log_target("leafdown_lib::folder::watch"),
            "backend::folder::watch"
        );
    }

    fn json_string<'a>(value: &'a Value, key: &str) -> &'a str {
        value
            .get(key)
            .and_then(Value::as_str)
            .expect("JSON field should be a string")
    }
}

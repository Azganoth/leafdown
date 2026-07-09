use std::{fs, path::Path};

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{plugin::TauriPlugin, AppHandle, Manager, Runtime, State};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::path_utils::path_to_string;

const BACKEND_LOG_TARGET: &str = "backend";
const BACKEND_CRATE_LOG_TARGET: &str = env!("CARGO_CRATE_NAME");
const APP_STARTED_DIAGNOSTIC_EVENT: &str = "appStarted";
const FRONTEND_LOG_TARGET: &str = "frontend";
const FALLBACK_LOG_TIMESTAMP: &str = "unknown-time";
pub(crate) const DIAGNOSTIC_LOG_FILE_NAME: &str = "leafdown";
pub(crate) const DIAGNOSTIC_LOG_MAX_FILE_SIZE_BYTES: u64 = 1_048_576;
pub(crate) const DIAGNOSTIC_LOG_FILE_COUNT: usize = 5;
const LOG_TIMESTAMP_FIELD: &str = "timestamp";
const LOG_RUN_ID_FIELD: &str = "runId";
const LOG_TARGET_FIELD: &str = "target";
const LOG_LEVEL_FIELD: &str = "level";
const LOG_MESSAGE_FIELD: &str = "message";

#[derive(Debug)]
pub(crate) struct DiagnosticsRuntime {
    run_id: String,
}

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
    run_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppStartedDiagnosticPayload<'a> {
    app_identifier: &'a str,
    app_name: &'a str,
    app_version: &'a str,
    architecture: &'static str,
    event: &'static str,
    operating_system: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum DiagnosticsError {
    LogDirectoryUnavailable { message: String },
    CreateLogDirectoryFailed { path: String, message: String },
}

pub(crate) fn build_log_plugin<R: Runtime>(run_id: String) -> TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::LogDir {
            file_name: Some(DIAGNOSTIC_LOG_FILE_NAME.to_owned()),
        }))
        .target(Target::new(TargetKind::Stdout))
        .format(move |out, message, record| {
            let level = record.level().as_str().to_ascii_lowercase();
            let message = message.to_string();
            let line = format_diagnostic_log_record(
                current_log_timestamp().as_str(),
                run_id.as_str(),
                record.target(),
                level.as_str(),
                message.as_str(),
            );

            out.finish(format_args!("{line}"));
        })
        .level(log::LevelFilter::Info)
        .max_file_size(DIAGNOSTIC_LOG_MAX_FILE_SIZE_BYTES.into())
        .rotation_strategy(RotationStrategy::KeepSome(DIAGNOSTIC_LOG_FILE_COUNT))
        .build()
}

impl DiagnosticsRuntime {
    pub(crate) fn new() -> Self {
        Self {
            run_id: create_diagnostics_run_id(),
        }
    }

    pub(crate) fn run_id(&self) -> &str {
        self.run_id.as_str()
    }
}

#[tauri::command]
pub(crate) fn get_diagnostics_summary(
    app: AppHandle,
    runtime: State<'_, DiagnosticsRuntime>,
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
        runtime.run_id(),
    ))
}

pub(crate) fn format_app_started_diagnostic(
    app_name: &str,
    app_version: &str,
    app_identifier: &str,
) -> String {
    let payload = AppStartedDiagnosticPayload {
        app_identifier,
        app_name,
        app_version,
        architecture: std::env::consts::ARCH,
        event: APP_STARTED_DIAGNOSTIC_EVENT,
        operating_system: std::env::consts::OS,
    };

    serde_json::to_string(&payload)
        .unwrap_or_else(|_| format!("{{\"event\":\"{APP_STARTED_DIAGNOSTIC_EVENT}\"}}"))
}

fn format_diagnostic_log_record(
    timestamp: &str,
    run_id: &str,
    target: &str,
    level: &str,
    message: &str,
) -> String {
    let mut fields = match serde_json::from_str::<Value>(message) {
        Ok(Value::Object(fields)) => fields,
        _ => {
            let mut fields = Map::new();
            fields.insert(
                LOG_MESSAGE_FIELD.to_owned(),
                Value::String(message.to_owned()),
            );
            fields
        }
    };

    fields.insert(
        LOG_TIMESTAMP_FIELD.to_owned(),
        Value::String(timestamp.to_owned()),
    );
    fields.insert(
        LOG_RUN_ID_FIELD.to_owned(),
        Value::String(run_id.to_owned()),
    );
    fields.insert(
        LOG_TARGET_FIELD.to_owned(),
        Value::String(normalize_log_target(target)),
    );
    fields.insert(LOG_LEVEL_FIELD.to_owned(), Value::String(level.to_owned()));

    serde_json::to_string(&Value::Object(fields))
        .unwrap_or_else(|_| fallback_log_record(timestamp, run_id, target, level, message))
}

fn fallback_log_record(
    timestamp: &str,
    run_id: &str,
    target: &str,
    level: &str,
    message: &str,
) -> String {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct FallbackLogRecord<'a> {
        timestamp: &'a str,
        run_id: &'a str,
        target: String,
        level: &'a str,
        message: &'a str,
    }

    serde_json::to_string(&FallbackLogRecord {
        timestamp,
        run_id,
        target: normalize_log_target(target),
        level,
        message,
    })
    .unwrap_or_else(|_| "{}".to_owned())
}

fn create_diagnostics_summary(
    app_name: String,
    app_version: String,
    app_identifier: String,
    log_directory_path: &Path,
    run_id: &str,
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
        run_id: run_id.to_owned(),
    }
}

fn create_diagnostics_run_id() -> String {
    format!(
        "{}-{}",
        OffsetDateTime::now_utc().unix_timestamp_nanos(),
        std::process::id()
    )
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

    if target == BACKEND_CRATE_LOG_TARGET {
        return BACKEND_LOG_TARGET.to_owned();
    }

    target
        .strip_prefix(BACKEND_CRATE_LOG_TARGET)
        .and_then(|suffix| suffix.strip_prefix("::"))
        .map(|module_path| format!("{BACKEND_LOG_TARGET}::{module_path}"))
        .unwrap_or_else(|| target.to_owned())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use serde_json::Value;

    use super::{
        create_diagnostics_run_id, create_diagnostics_summary, format_app_started_diagnostic,
        format_diagnostic_log_record, normalize_log_target, DIAGNOSTIC_LOG_FILE_COUNT,
        DIAGNOSTIC_LOG_FILE_NAME, DIAGNOSTIC_LOG_MAX_FILE_SIZE_BYTES,
    };

    #[test]
    fn diagnostics_summary_serializes_frontend_contract() {
        let summary = create_diagnostics_summary(
            "Leafdown".to_owned(),
            "0.1.0".to_owned(),
            "com.azganoth.leafdown".to_owned(),
            Path::new("/tmp/leafdown/logs"),
            "run-test",
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
        assert_eq!(json_string(&value, "runId"), "run-test");
        assert!(json_string(&value, "logFilePath").ends_with("leafdown.log"));
    }

    #[test]
    fn app_started_diagnostic_serializes_as_structured_payload() {
        let diagnostic =
            format_app_started_diagnostic("Leafdown", "0.1.0", "com.azganoth.leafdown");
        let value: Value =
            serde_json::from_str(diagnostic.as_str()).expect("startup diagnostic should be JSON");

        assert_eq!(json_string(&value, "event"), "appStarted");
        assert_eq!(json_string(&value, "appName"), "Leafdown");
        assert_eq!(json_string(&value, "appVersion"), "0.1.0");
        assert_eq!(
            json_string(&value, "appIdentifier"),
            "com.azganoth.leafdown"
        );
        assert!(value.get("runId").is_none());
    }

    #[test]
    fn diagnostic_log_records_merge_structured_payloads_with_backend_envelope() {
        let line = format_diagnostic_log_record(
            "2026-07-09T12:00:00Z",
            "run-test",
            "webview:writeDiagnostic@http://localhost:1420/source.ts:1:1",
            "warn",
            r#"{"event":"operationFailed","feature":"document","level":"payload-level","runId":"payload-run"}"#,
        );
        let value = parse_json_line(line.as_str());

        assert_eq!(json_string(&value, "timestamp"), "2026-07-09T12:00:00Z");
        assert_eq!(json_string(&value, "runId"), "run-test");
        assert_eq!(json_string(&value, "target"), "frontend");
        assert_eq!(json_string(&value, "level"), "warn");
        assert_eq!(json_string(&value, "event"), "operationFailed");
        assert_eq!(json_string(&value, "feature"), "document");
    }

    #[test]
    fn diagnostic_log_records_wrap_plain_text_messages_as_jsonl() {
        let line = format_diagnostic_log_record(
            "2026-07-09T12:00:00Z",
            "run-test",
            "leafdown_lib::folder::watch",
            "error",
            "failed to emit close-requested event",
        );
        let value = parse_json_line(line.as_str());

        assert_eq!(json_string(&value, "timestamp"), "2026-07-09T12:00:00Z");
        assert_eq!(json_string(&value, "runId"), "run-test");
        assert_eq!(json_string(&value, "target"), "backend::folder::watch");
        assert_eq!(json_string(&value, "level"), "error");
        assert_eq!(
            json_string(&value, "message"),
            "failed to emit close-requested event"
        );
    }

    #[test]
    fn diagnostics_run_ids_are_non_empty() {
        assert!(!create_diagnostics_run_id().is_empty());
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

    fn parse_json_line(line: &str) -> Value {
        serde_json::from_str(line).expect("log line should be valid JSON")
    }
}

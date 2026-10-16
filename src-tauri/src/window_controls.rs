use serde::{Deserialize, Serialize};

/// Far beyond any client area, and small enough that offsets stay within `i32`.
const MAX_BOUNDS_COORDINATE: u32 = 1 << 16;

/// The rendered maximize control in physical pixels, measured from the top and right edges of the
/// client area so a resize can keep the native region in place before the webview reports again.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MaximizeControlBounds {
    right: u32,
    top: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(windows), allow(dead_code))]
struct ClientRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

impl MaximizeControlBounds {
    fn validate(self) -> Result<Self, WindowControlsError> {
        let in_range = [self.right, self.top, self.width, self.height]
            .iter()
            .all(|coordinate| *coordinate <= MAX_BOUNDS_COORDINATE);

        if in_range && self.width > 0 && self.height > 0 {
            Ok(self)
        } else {
            Err(WindowControlsError::InvalidBounds)
        }
    }

    // Validated coordinates are bounded by `MAX_BOUNDS_COORDINATE`, so the casts are lossless.
    #[cfg_attr(not(windows), allow(dead_code))]
    fn client_rect(self, client_width: i32) -> ClientRect {
        ClientRect {
            x: client_width - self.right as i32 - self.width as i32,
            y: self.top as i32,
            width: self.width as i32,
            height: self.height as i32,
        }
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum WindowControlsError {
    InvalidBounds,
    Unavailable { message: String },
}

/// Places the native region that answers hit-tests as the maximize button, which is what opens the
/// Windows 11 snap layouts flyout. `None` removes it while the control is not rendered.
#[tauri::command]
pub(crate) fn set_maximize_control_bounds(
    window: tauri::Window,
    bounds: Option<MaximizeControlBounds>,
) -> Result<(), WindowControlsError> {
    let bounds = bounds.map(MaximizeControlBounds::validate).transpose()?;

    native::set_bounds(window, bounds)
}

pub(crate) fn reposition_maximize_control(window: &tauri::Window) {
    native::reposition(window);
}

pub(crate) fn forget_maximize_control(window: &tauri::Window) {
    native::forget(window);
}

#[cfg(windows)]
mod native {
    use std::{cell::RefCell, collections::HashMap, sync::LazyLock};

    use tauri::{Emitter, EventTarget};
    use windows_sys::Win32::{
        Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM},
        Graphics::Gdi::{GetStockObject, HBRUSH, NULL_BRUSH},
        System::LibraryLoader::GetModuleHandleW,
        UI::{
            Input::KeyboardAndMouse::{TME_LEAVE, TME_NONCLIENT, TRACKMOUSEEVENT, TrackMouseEvent},
            WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, GetClientRect, GetParent, HTMAXBUTTON, HWND_TOP,
                RegisterClassExW, SW_HIDE, SWP_NOACTIVATE, SWP_SHOWWINDOW, SetWindowPos,
                ShowWindow, WM_NCHITTEST, WM_NCLBUTTONDOWN, WM_NCLBUTTONUP, WM_NCMOUSELEAVE,
                WM_NCMOUSEMOVE, WNDCLASSEXW, WS_CHILD, WS_CLIPSIBLINGS,
            },
        },
    };

    use super::{MaximizeControlBounds, WindowControlsError};

    // The plugin's injected controls listen for these to show hover and toggle maximize.
    const EVENT_MOUSEENTER: &str = "tauri-frame://snap/mouseenter";
    const EVENT_MOUSELEAVE: &str = "tauri-frame://snap/mouseleave";
    const EVENT_MOUSEDOWN: &str = "tauri-frame://snap/mousedown";
    const EVENT_MOUSEUP: &str = "tauri-frame://snap/mouseup";
    const EVENT_CLICK: &str = "tauri-frame://snap/click";

    static CLASS_NAME: LazyLock<Vec<u16>> = LazyLock::new(|| {
        "LeafdownMaximizeControl"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect()
    });

    struct Region {
        window: tauri::Window,
        parent: isize,
        overlay: isize,
        bounds: Option<MaximizeControlBounds>,
        hovering: bool,
        pressing: bool,
    }

    thread_local! {
        // Windows, their child regions, and window events all live on the main thread.
        static REGIONS: RefCell<HashMap<String, Region>> = RefCell::new(HashMap::new());
    }

    pub(super) fn set_bounds(
        window: tauri::Window,
        bounds: Option<MaximizeControlBounds>,
    ) -> Result<(), WindowControlsError> {
        let unavailable = |error: tauri::Error| WindowControlsError::Unavailable {
            message: error.to_string(),
        };
        let parent = window.hwnd().map_err(unavailable)?.0 as isize;
        let main_window = window.clone();

        main_window
            .run_on_main_thread(move || {
                let label = window.label().to_owned();
                let updated = REGIONS.with_borrow_mut(|regions| {
                    regions
                        .get_mut(&label)
                        .filter(|region| region.parent == parent)
                        .map(|region| region.bounds = bounds)
                        .is_some()
                });

                if !updated {
                    let Some(overlay) = create_overlay(parent) else {
                        log::warn!(
                            "could not create the maximize control region for window {label}"
                        );
                        return;
                    };
                    REGIONS.with_borrow_mut(|regions| {
                        regions.insert(
                            label.clone(),
                            Region {
                                window,
                                parent,
                                overlay,
                                bounds,
                                hovering: false,
                                pressing: false,
                            },
                        )
                    });
                }

                position(&label);
            })
            .map_err(unavailable)
    }

    pub(super) fn reposition(window: &tauri::Window) {
        position(window.label());
    }

    pub(super) fn forget(window: &tauri::Window) {
        REGIONS.with_borrow_mut(|regions| regions.remove(window.label()));
    }

    fn position(label: &str) {
        let Some((parent, overlay, bounds)) = REGIONS.with_borrow(|regions| {
            regions
                .get(label)
                .map(|region| (region.parent, region.overlay, region.bounds))
        }) else {
            return;
        };

        // SAFETY: both handles belong to this thread's live window, which owns the overlay.
        unsafe {
            let Some(bounds) = bounds else {
                ShowWindow(overlay as HWND, SW_HIDE);
                return;
            };

            let mut client = RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            if GetClientRect(parent as HWND, &mut client) == 0 {
                return;
            }

            let rect = bounds.client_rect(client.right);
            SetWindowPos(
                overlay as HWND,
                HWND_TOP,
                rect.x,
                rect.y,
                rect.width,
                rect.height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        }
    }

    fn create_overlay(parent: isize) -> Option<isize> {
        // SAFETY: the class outlives every overlay, and the parent is a live window on this thread.
        unsafe {
            let instance = GetModuleHandleW(std::ptr::null());
            let class = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                style: 0,
                lpfnWndProc: Some(overlay_proc),
                cbClsExtra: 0,
                cbWndExtra: 0,
                hInstance: instance,
                hIcon: std::ptr::null_mut(),
                hCursor: std::ptr::null_mut(),
                hbrBackground: GetStockObject(NULL_BRUSH) as HBRUSH,
                lpszMenuName: std::ptr::null(),
                lpszClassName: CLASS_NAME.as_ptr(),
                hIconSm: std::ptr::null_mut(),
            };
            // Fails harmlessly once the class is registered.
            RegisterClassExW(&class);

            let overlay = CreateWindowExW(
                0,
                CLASS_NAME.as_ptr(),
                CLASS_NAME.as_ptr(),
                WS_CHILD | WS_CLIPSIBLINGS,
                0,
                0,
                0,
                0,
                parent as HWND,
                std::ptr::null_mut(),
                instance,
                std::ptr::null(),
            );

            (!overlay.is_null()).then_some(overlay as isize)
        }
    }

    /// Updates the region that owns `overlay` and returns its window with the events to send, so
    /// they are emitted after the region is released.
    fn update_region(
        overlay: HWND,
        update: impl FnOnce(&mut Region) -> Vec<&'static str>,
    ) -> Option<(tauri::Window, Vec<&'static str>)> {
        // SAFETY: the overlay is a live child window, so its parent query cannot outlive it.
        let parent = unsafe { GetParent(overlay) } as isize;

        REGIONS.with_borrow_mut(|regions| {
            regions
                .values_mut()
                .find(|region| region.parent == parent && region.overlay == overlay as isize)
                .map(|region| (region.window.clone(), update(region)))
        })
    }

    fn emit_events(window: &tauri::Window, events: Vec<&'static str>) {
        // Plain `emit` would reach the controls of every window.
        let target = EventTarget::window(window.label());

        for event in events {
            if let Err(error) = window.emit_to(target.clone(), event, ()) {
                log::warn!(
                    "could not send {event} to window {}: {error}",
                    window.label()
                );
            }
        }
    }

    unsafe extern "system" fn overlay_proc(
        overlay: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        let events = match message {
            WM_NCHITTEST => return HTMAXBUTTON as LRESULT,
            WM_NCMOUSEMOVE => {
                let entered = update_region(overlay, |region| {
                    if std::mem::replace(&mut region.hovering, true) {
                        Vec::new()
                    } else {
                        vec![EVENT_MOUSEENTER]
                    }
                });

                if entered
                    .as_ref()
                    .is_some_and(|(_, events)| !events.is_empty())
                {
                    let mut track = TRACKMOUSEEVENT {
                        cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                        dwFlags: TME_LEAVE | TME_NONCLIENT,
                        hwndTrack: overlay,
                        dwHoverTime: 0,
                    };
                    // SAFETY: `track` describes this live overlay for the duration of the call.
                    unsafe { TrackMouseEvent(&mut track) };
                }

                entered
            }
            WM_NCMOUSELEAVE => update_region(overlay, |region| {
                region.hovering = false;
                region.pressing = false;
                vec![EVENT_MOUSELEAVE]
            }),
            WM_NCLBUTTONDOWN => update_region(overlay, |region| {
                region.pressing = true;
                vec![EVENT_MOUSEDOWN]
            }),
            WM_NCLBUTTONUP => update_region(overlay, |region| {
                let pressed = std::mem::replace(&mut region.pressing, false);
                if pressed {
                    vec![EVENT_MOUSEUP, EVENT_CLICK]
                } else {
                    vec![EVENT_MOUSEUP]
                }
            }),
            // SAFETY: forwards this window procedure's own arguments.
            _ => return unsafe { DefWindowProcW(overlay, message, wparam, lparam) },
        };

        if let Some((window, events)) = events {
            emit_events(&window, events);
        }

        // Handling the button messages here keeps the default caption behavior from running.
        0
    }
}

#[cfg(not(windows))]
mod native {
    use super::{MaximizeControlBounds, WindowControlsError};

    pub(super) fn set_bounds(
        _window: tauri::Window,
        _bounds: Option<MaximizeControlBounds>,
    ) -> Result<(), WindowControlsError> {
        Ok(())
    }

    pub(super) fn reposition(_window: &tauri::Window) {}

    pub(super) fn forget(_window: &tauri::Window) {}
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn bounds(right: u32, top: u32, width: u32, height: u32) -> MaximizeControlBounds {
        MaximizeControlBounds {
            right,
            top,
            width,
            height,
        }
    }

    #[test]
    fn deserializes_bounds_from_camel_case_payload() {
        let parsed: MaximizeControlBounds =
            serde_json::from_value(json!({ "right": 78, "top": 0, "width": 78, "height": 48 }))
                .expect("bounds should deserialize");

        assert_eq!(parsed, bounds(78, 0, 78, 48));
    }

    #[test]
    fn rejects_empty_or_out_of_range_bounds() {
        assert_eq!(
            bounds(52, 0, 0, 32).validate(),
            Err(WindowControlsError::InvalidBounds)
        );
        assert_eq!(
            bounds(52, 0, 52, 0).validate(),
            Err(WindowControlsError::InvalidBounds)
        );
        assert_eq!(
            bounds(u32::MAX, 0, 52, 32).validate(),
            Err(WindowControlsError::InvalidBounds)
        );
        assert_eq!(
            bounds(52, 0, 52, MAX_BOUNDS_COORDINATE + 1).validate(),
            Err(WindowControlsError::InvalidBounds)
        );
        assert_eq!(bounds(52, 0, 52, 32).validate(), Ok(bounds(52, 0, 52, 32)));
    }

    #[test]
    fn anchors_the_region_to_the_right_edge_of_the_client_area() {
        let maximize = bounds(78, 0, 78, 48);

        assert_eq!(
            maximize.client_rect(1200),
            ClientRect {
                x: 1044,
                y: 0,
                width: 78,
                height: 48,
            }
        );
        assert_eq!(maximize.client_rect(1920).x, 1764);
    }

    #[test]
    fn serializes_errors_with_a_stable_kind() {
        assert_eq!(
            serde_json::to_value(WindowControlsError::InvalidBounds).expect("error serializes"),
            json!({ "kind": "invalidBounds" })
        );
        assert_eq!(
            serde_json::to_value(WindowControlsError::Unavailable {
                message: "gone".to_owned(),
            })
            .expect("error serializes"),
            json!({ "kind": "unavailable", "message": "gone" })
        );
    }
}

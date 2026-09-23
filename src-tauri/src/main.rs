// A Windows release build needs no console alongside its desktop window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    leafdown_lib::run()
}

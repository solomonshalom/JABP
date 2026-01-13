// Haptic feedback module for macOS
// Creates exceptional, vinyl-like tactile experiences

#[cfg(target_os = "macos")]
mod haptics {
    use objc::{class, msg_send, sel, sel_impl};
    use objc::runtime::Object;
    use std::thread;
    use std::time::Duration;

    // NSHapticFeedbackPattern values
    #[allow(dead_code)]
    #[repr(i64)]
    #[derive(Clone, Copy)]
    pub enum HapticPattern {
        Generic = 0,      // General-purpose feedback
        Alignment = 1,    // Alignment/snapping feedback
        LevelChange = 2,  // Level change (strongest)
    }

    // NSHapticFeedbackPerformanceTime values
    #[repr(i64)]
    pub enum PerformanceTime {
        Default = 0,
        Now = 1,
        DrawCompleted = 2,
    }

    // Fire a single haptic
    pub fn perform_haptic(pattern: HapticPattern) {
        unsafe {
            let manager: *mut Object = msg_send![
                class!(NSHapticFeedbackManager),
                defaultPerformer
            ];

            if !manager.is_null() {
                let _: () = msg_send![
                    manager,
                    performFeedbackPattern: pattern as i64
                    performanceTime: PerformanceTime::Now as i64
                ];
            }
        }
    }

    // Fire multiple haptics with timing for compound effects
    pub fn perform_pattern(pattern: HapticPattern, count: u32, interval_ms: u64) {
        for i in 0..count {
            perform_haptic(pattern);
            if i < count - 1 && interval_ms > 0 {
                thread::sleep(Duration::from_millis(interval_ms));
            }
        }
    }
}

// ============================================
// Basic Haptic Commands
// ============================================

/// Ultra-light tick - for vinyl groove simulation
#[tauri::command]
fn haptic_tick() {
    #[cfg(target_os = "macos")]
    haptics::perform_haptic(haptics::HapticPattern::Generic);
}

/// Soft tap - subtle button feedback
#[tauri::command]
fn haptic_soft() {
    #[cfg(target_os = "macos")]
    haptics::perform_haptic(haptics::HapticPattern::Generic);
}

/// Standard tap - general interactions
#[tauri::command]
fn haptic_tap() {
    #[cfg(target_os = "macos")]
    haptics::perform_haptic(haptics::HapticPattern::Generic);
}

/// Alignment snap - for precise actions like play/pause
#[tauri::command]
fn haptic_alignment() {
    #[cfg(target_os = "macos")]
    haptics::perform_haptic(haptics::HapticPattern::Alignment);
}

/// Level change - strongest single feedback
#[tauri::command]
fn haptic_level_change() {
    #[cfg(target_os = "macos")]
    haptics::perform_haptic(haptics::HapticPattern::LevelChange);
}

// ============================================
// Compound Haptic Patterns
// ============================================

/// Double tap - for CD swap, feels like a satisfying "click-clack"
#[tauri::command]
fn haptic_double_tap() {
    #[cfg(target_os = "macos")]
    haptics::perform_pattern(haptics::HapticPattern::Alignment, 2, 60);
}

/// Triple tap - error/warning feedback
#[tauri::command]
fn haptic_triple_tap() {
    #[cfg(target_os = "macos")]
    haptics::perform_pattern(haptics::HapticPattern::LevelChange, 3, 80);
}

/// Success pattern - satisfying confirmation (snap + settle)
#[tauri::command]
fn haptic_success() {
    #[cfg(target_os = "macos")]
    {
        haptics::perform_haptic(haptics::HapticPattern::Alignment);
        std::thread::sleep(std::time::Duration::from_millis(40));
        haptics::perform_haptic(haptics::HapticPattern::Generic);
    }
}

/// Thunk - heavy impact feel (for significant actions)
#[tauri::command]
fn haptic_thunk() {
    #[cfg(target_os = "macos")]
    {
        haptics::perform_haptic(haptics::HapticPattern::LevelChange);
        std::thread::sleep(std::time::Duration::from_millis(25));
        haptics::perform_haptic(haptics::HapticPattern::Generic);
    }
}

/// Play feedback - ascending energy feel
#[tauri::command]
fn haptic_play() {
    #[cfg(target_os = "macos")]
    {
        haptics::perform_haptic(haptics::HapticPattern::Generic);
        std::thread::sleep(std::time::Duration::from_millis(50));
        haptics::perform_haptic(haptics::HapticPattern::Alignment);
    }
}

/// Pause feedback - descending/settling feel
#[tauri::command]
fn haptic_pause() {
    #[cfg(target_os = "macos")]
    {
        haptics::perform_haptic(haptics::HapticPattern::Alignment);
        std::thread::sleep(std::time::Duration::from_millis(50));
        haptics::perform_haptic(haptics::HapticPattern::Generic);
    }
}

/// Scrub tick - for vinyl groove simulation (varies by intensity)
#[tauri::command]
fn haptic_scrub(intensity: f64) {
    #[cfg(target_os = "macos")]
    {
        // Higher intensity = stronger pattern
        if intensity.abs() > 0.7 {
            haptics::perform_haptic(haptics::HapticPattern::Alignment);
        } else if intensity.abs() > 0.3 {
            haptics::perform_haptic(haptics::HapticPattern::Generic);
        } else {
            haptics::perform_haptic(haptics::HapticPattern::Generic);
        }
    }
}

/// Direction change - when scrubbing reverses direction
#[tauri::command]
fn haptic_direction_change() {
    #[cfg(target_os = "macos")]
    {
        haptics::perform_haptic(haptics::HapticPattern::Alignment);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Basic
            haptic_tick,
            haptic_soft,
            haptic_tap,
            haptic_alignment,
            haptic_level_change,
            // Compound patterns
            haptic_double_tap,
            haptic_triple_tap,
            haptic_success,
            haptic_thunk,
            haptic_play,
            haptic_pause,
            haptic_scrub,
            haptic_direction_change
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

# Native Android Browser Architecture (No JS/HTML/CSS UI)

## 1) Recommended Stack

### Chosen stack
- **Chromium Android embedding (content_shell-style embed)** for rendering + networking + sandbox/process model.
- **Rust-first app/runtime** for browser orchestration, storage/services, and most business logic.
- **C++ thin platform layer** only where Chromium integration or Android NDK/JNI hooks are required.
- **Slint (Rust)** for fully-native UI widgets (tabs, omnibox, settings, downloads, history, reader controls).
  - Rationale: deterministic native rendering, good performance, Rust-native architecture, easier Android packaging than desktop-centric toolkits.

### Why this stack over alternatives
- **CEF on Android is not production-standard** and often needs heavy patching; Chromium embedding is better aligned with Android/browser process patterns.
- **Rust + Slint** gives memory safety and native UI without web technologies.
- **C++ integration boundary is minimized** to reduce unsafe surface and maintenance cost.

---

## 2) High-level Architecture

```text
+---------------------------------------------------------------+
|                        Android App (APK)                      |
|                                                               |
|  +----------------------+     +----------------------------+  |
|  | Rust UI Shell       |     | Rust Browser Services      |  |
|  | (Slint)             |<--->| Tabs, Bookmarks, History,  |  |
|  | Tab Grid, Omnibox,  | IPC | Downloads, Password Vault, |  |
|  | Menus, Settings     |     | Permissions, Reader Mode   |  |
|  +----------+-----------+     +-------------+--------------+  |
|             | JNI                             |                 |
|  +----------v---------------------------------v--------------+ |
|  |      C++ Integration Layer (NDK + JNI bridge)            | |
|  | Chromium lifecycle, surface binding, process bootstrap    | |
|  +-----------+--------------------------+--------------------+ |
|              |                          |                      |
|      +-------v--------+         +-------v----------------+     |
|      | Browser Proc   | IPC     | Renderer/GPU/Utility   |     |
|      | (Chromium)     +-------->+ Processes (sandboxed)  |     |
|      +----------------+         +------------------------+     |
+---------------------------------------------------------------+
```

### Core principles
1. **No web-based UI layer**: all controls/settings are native Slint widgets.
2. **Strict process isolation**: renderer in separate sandboxed process.
3. **Rust-owned domain logic** with explicit FFI boundaries.
4. **Battery-aware scheduling** for background tabs and tasks.

---

## 3) Feature Mapping

### Core browsing
- Multi-tab + tab overview/grid: `tab_service` + `tab_grid_view`.
- Address bar parsing/search engine: `omnibox_service` with URL heuristics.
- Back/forward/reload: command routing to Chromium navigation controller.
- Download manager: Chromium download delegate + Rust download DB.
- Bookmarks/history/incognito: dedicated Rust services with separate stores.
- Desktop/mobile UA switching: per-tab user-agent override.
- File upload: Android SAF picker through JNI callbacks.
- Native PDF viewing: Chromium PDFium integration rendered in content area.
- Cookie/site permissions: Chromium content settings bridged to Rust UI.
- Password manager: encrypted vault (SQLCipher or libsodium sealed box).
- Ad/tracker blocking: native filter engine (uBO-style static rules parser).
- Reader mode: native distilled content model + Slint reader renderer.
- Find-in-page: Chromium find API exposed via Rust command.
- Pull-to-refresh + gesture nav: Slint gesture recognizers mapped to nav events.

### Android integration
- Deep links/open-from-other-apps/share-to-browser through intent filters.
- Notifications via Android notification manager (download completion, site alerts).
- Hardware acceleration via Surface/ANativeWindow + Chromium compositor.
- Lifecycle correctness via `onPause/onResume/onStop` ↔ browser visibility states.

---

## 4) Proposed Folder Structure

```text
native-browser/
  android/
    app/
      src/main/
        AndroidManifest.xml
        java/com/example/browser/
          MainActivity.kt           # Minimal host, lifecycle bridge
          IntentBridge.kt
      build.gradle.kts
    gradle.properties
    settings.gradle.kts
  rust/
    Cargo.toml
    crates/
      ui-shell/                     # Slint UI and view models
      browser-core/                 # tab/navigation/session orchestration
      storage/                      # bookmarks/history/password/db
      blocker-engine/               # ad/tracker rules
      reader-mode/                  # native content distillation
      ipc-types/                    # shared IPC message schema
      android-bridge/               # JNI-safe Rust wrappers
  cpp/
    CMakeLists.txt
    chromium_embed/
      browser_host.cc
      surface_binding.cc
      process_bootstrap.cc
      ipc_bridge.cc
      jni_entrypoints.cc
  third_party/
    chromium/                       # pinned revision tooling metadata
    rulesets/
  tooling/
    fetch_chromium.sh
    build_chromium_android.sh
    package_apk.sh
  docs/
    architecture.md
    threat_model.md
```

---

## 5) Android Toolchain + Build Pipeline

1. Install Android Studio, SDK 35+, NDK r27+, CMake 3.28+.
2. Install Rust targets:
   - `rustup target add aarch64-linux-android`
3. Use `cargo-ndk` for Rust static/shared libs.
4. Build Chromium Android artifacts at pinned commit.
5. Build C++ bridge with NDK/CMake.
6. Link Rust + C++ + Chromium into app module.
7. Produce signed APK/AAB via Gradle.

### Example build commands
```bash
# Rust
cargo ndk -t arm64-v8a -o ../android/app/src/main/jniLibs build --release

# C++ bridge
cmake -S cpp -B out/android-arm64 \
  -DANDROID_ABI=arm64-v8a \
  -DANDROID_PLATFORM=android-29 \
  -DCMAKE_TOOLCHAIN_FILE=$ANDROID_NDK/build/cmake/android.toolchain.cmake
cmake --build out/android-arm64 --config Release

# APK
cd android && ./gradlew assembleRelease
```

---

## 6) JNI/FFI Boundary

### Boundary rules
- JNI only in `android-bridge` + `jni_entrypoints.cc`.
- All cross-language messages are versioned typed envelopes.
- Never pass raw pointers across ownership domains without explicit lifecycle API.

### Example message envelope
```rust
#[repr(C)]
pub struct IpcEnvelope {
    pub version: u16,
    pub kind: u16,
    pub payload_ptr: *const u8,
    pub payload_len: usize,
}
```

---

## 7) Rendering Pipeline

1. Slint renders native chrome (top/bottom bars, tabs, menus).
2. Chromium renders page into dedicated GPU surface.
3. Compositor scene combines native UI layers + page surface.
4. Input dispatcher routes touch/gesture to UI first, then web content.

### Example native render loop (conceptual)
```rust
loop {
    poll_android_events();
    ui_shell.process_input();
    browser_core.tick();
    chromium_embed.composite_frame();
    ui_shell.render();
    submit_gpu_frame();
}
```

---

## 8) Multiprocess + IPC Model

- **Browser process**: tab model, navigation policy, permissions.
- **Renderer process(es)**: page JS execution + layout/paint (site isolated).
- **GPU process**: compositing.
- **Network/utility**: DNS, safe browsing checks, downloads.

### IPC channels
- Chromium internal Mojo IPC for engine components.
- App-level IPC (Rust/C++) for UI commands and state snapshots.
- Backpressure-aware event queue to avoid UI jank.

---

## 9) Networking Architecture

- Chromium network stack with HTTPS-first default.
- DNS-over-HTTPS optional.
- Safe browsing URL checks before navigation commit.
- Ad/tracker request interception in request pipeline.
- Per-profile cookie jar (normal/incognito isolated).

---

## 10) Storage Architecture

- SQLite/SQLCipher for bookmarks/history/download metadata.
- Encrypted password vault using Android Keystore-wrapped key.
- Separate on-disk partitions by profile:
  - `default/`
  - `incognito_ephemeral/` (memory-backed, wiped on exit)
- Crash recovery session store with write-ahead snapshots.

---

## 11) Threading Model

- UI thread: Slint events + composition scheduling.
- Browser orchestration thread pool (Rust): I/O, parsing, storage.
- Chromium-managed threads/process threads remain isolated.
- Strict no-blocking rule on UI thread; use async command bus.

---

## 12) Security Model

- Chromium sandbox enabled for renderer/utility processes.
- Site isolation enabled.
- HTTPS-first + upgrade insecure requests where possible.
- Permission prompts are one-time scoped and revocable.
- Minimal telemetry (off by default), explicit user opt-in.
- Certificate viewer: chain, SAN, issuer, validity, pinning warnings.
- Memory-safe Rust for sensitive components (passwords, permissions logic).

### Hardening checklist
- [ ] Enable Control Flow Integrity where available.
- [ ] Strip symbols in release APK, keep split debug symbols.
- [ ] Validate all JNI inputs.
- [ ] Enforce strict CSP for internal content pipeline if any parsed artifacts.
- [ ] Periodic dependency pin and CVE scanning.
- [ ] Seccomp / sandbox profile verification on each release.

---

## 13) MVP Roadmap

### Phase 0: Foundation (2–4 weeks)
- Android host app + Chromium embed proof.
- Slint shell with omnibox + single tab.
- Navigation controls and page rendering.

### Phase 1: Essential Browser (4–8 weeks)
- Multi-tab + tab grid.
- Bookmarks/history/downloads.
- Incognito mode.
- File upload and intent handling.

### Phase 2: Privacy & Security (4–6 weeks)
- Ad/tracker blocking.
- Password vault.
- Site permissions manager.
- Safe browsing + certificate viewer.

### Phase 3: Performance & UX Polish (4–8 weeks)
- Lazy tabs, tab suspension.
- Reader mode + native PDF UX polish.
- Crash restore and startup optimization.

---

## 14) Performance Strategy

- Prewarm browser process only when user likely to launch.
- Lazy-create renderer for background tabs.
- Freeze suspended tabs after inactivity thresholds.
- Image/cache budgets tied to device RAM tier.
- Batched UI state diffs to avoid rerender churn.
- Profile-driven optimization with Perfetto + Android GPU Inspector.

---

## 15) CMake + Cargo Baseline

### Minimal CMake sketch
```cmake
cmake_minimum_required(VERSION 3.28)
project(native_browser_android LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 20)
add_library(chromium_bridge SHARED
  chromium_embed/browser_host.cc
  chromium_embed/surface_binding.cc
  chromium_embed/ipc_bridge.cc
  chromium_embed/jni_entrypoints.cc)
# target_link_libraries(chromium_bridge ...chromium libs...)
```

### Minimal Cargo workspace
```toml
[workspace]
members = [
  "crates/ui-shell",
  "crates/browser-core",
  "crates/storage",
  "crates/android-bridge",
]
resolver = "2"
```

---

## 16) Packaging Instructions

1. Generate release signing key.
2. Configure Gradle signing configs via CI secrets.
3. Build `assembleRelease` and optionally `bundleRelease`.
4. Run instrumentation smoke tests on ARM64 emulator/device.
5. Verify sandbox/process flags at runtime.
6. Publish internal track first, then staged rollout.

---

## 17) What “Production-grade” Means Here

- Deterministic crash recovery and corruption-resistant storage.
- Continuous security patching from Chromium upstream.
- Reproducible pinned builds.
- Telemetry/privacy defaults aligned with least data collection.
- Performance budgets enforced in CI.


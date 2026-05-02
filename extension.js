/* Focus Lock Extension for GNOME Shell 45+
 * Locks window focus to a specific application
 * Works on Wayland and X11
 */

import St from 'gi://St';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const UNLOCKED_ICON = '◎';  // Open circle - green
const LOCKED_ICON = '◉';    // Filled circle - red

export default class FocusLockExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._button = null;
        this._label = null;
        this._buttonClickHandlerId = null;
        this._isLocked = false;
        this._lockedWindow = null;
        this._focusHandlerId = null;
        this._windowCreatedId = null;
        this._focusTimeoutId = null;
        this._minimizeTimeoutId = null;
        this._unmanagedId = null;
    }

    enable() {
        // Create a simple St.Button and add it to the panel
        this._button = new St.Button({
            reactive: true,
            can_focus: false,
            track_hover: true,
            style_class: 'panel-button focus-lock-indicator unlocked',
        });

        this._label = new St.Label({
            text: UNLOCKED_ICON,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._button.set_child(this._label);

        this._buttonClickHandlerId = this._button.connect('clicked', () => {
            this._toggleLock();
        });

        // Add to the right side of the panel
        Main.panel._rightBox.insert_child_at_index(this._button, 0);
    }

    disable() {
        this._unlock();

        if (this._buttonClickHandlerId) {
            if (this._button) {
                this._button.disconnect(this._buttonClickHandlerId);
            }
            this._buttonClickHandlerId = null;
        }

        if (this._label) {
            this._label.destroy();
            this._label = null;
        }

        if (this._button) {
            Main.panel._rightBox.remove_child(this._button);
            this._button.destroy();
            this._button = null;
        }
    }

    _toggleLock() {
        if (this._isLocked) {
            this._unlock();
        } else {
            this._lock();
        }
    }

    _lock() {
        const focusedWindow = global.display.get_focus_window();

        if (!focusedWindow) {
            Main.notify('Focus Lock', 'No window is currently focused!');
            return;
        }

        this._lockedWindow = focusedWindow;
        this._isLocked = true;

        // Update UI
        this._label.text = LOCKED_ICON;
        this._button.style_class = 'panel-button focus-lock-indicator locked';

        // Connect to focus changes
        this._focusHandlerId = global.display.connect('notify::focus-window', () => {
            this._onFocusChanged();
        });

        // Connect to new window creation
        this._windowCreatedId = global.display.connect('window-created', (_display, window) => {
            this._onWindowCreated(window);
        });

        // Track if the locked window is closed
        this._unmanagedId = this._lockedWindow.connect('unmanaged', () => {
            if (this._isLocked) {
                this._unlock();
            }
        });

        // Get app name for notification
        const app = Shell.WindowTracker.get_default().get_window_app(focusedWindow);
        const appName = app ? app.get_name() : 'Window';
        Main.notify('Focus Lock', `Locked to: ${appName}`);
    }

    _unlock() {
        if (this._focusHandlerId) {
            global.display.disconnect(this._focusHandlerId);
            this._focusHandlerId = null;
        }

        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }

        if (this._unmanagedId && this._lockedWindow) {
            try {
                this._lockedWindow.disconnect(this._unmanagedId);
            } catch (_e) {
                // Window may already be destroyed
            }
            this._unmanagedId = null;
        }

        if (this._focusTimeoutId) {
            GLib.source_remove(this._focusTimeoutId);
            this._focusTimeoutId = null;
        }

        if (this._minimizeTimeoutId) {
            GLib.source_remove(this._minimizeTimeoutId);
            this._minimizeTimeoutId = null;
        }

        const wasLocked = this._isLocked;
        this._lockedWindow = null;
        this._isLocked = false;

        // Update UI
        if (this._label) {
            this._label.text = UNLOCKED_ICON;
        }
        if (this._button) {
            this._button.style_class = 'panel-button focus-lock-indicator unlocked';
        }

        if (wasLocked) {
            Main.notify('Focus Lock', 'Unlocked - you can now switch windows');
        }
    }

    _refocusLockedWindow() {
        if (!this._isLocked || !this._lockedWindow) {
            return;
        }

        if (this._focusTimeoutId) {
            GLib.source_remove(this._focusTimeoutId);
        }

        this._focusTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._focusTimeoutId = null;
            if (this._isLocked && this._lockedWindow) {
                const activeWorkspace = global.workspace_manager.get_active_workspace();
                if (!this._lockedWindow.located_on_workspace(activeWorkspace)) {
                    this._lockedWindow.change_workspace(activeWorkspace);
                }
                if (this._lockedWindow.minimized) {
                    this._lockedWindow.unminimize();
                }
                this._lockedWindow.activate(global.get_current_time());
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _onFocusChanged() {
        if (!this._isLocked || !this._lockedWindow) {
            return;
        }

        const currentFocus = global.display.get_focus_window();

        if (currentFocus && currentFocus !== this._lockedWindow) {
            const windowType = currentFocus.get_window_type();
            if (windowType === Meta.WindowType.MENU ||
                windowType === Meta.WindowType.DROPDOWN_MENU ||
                windowType === Meta.WindowType.POPUP_MENU ||
                windowType === Meta.WindowType.MODAL_DIALOG) {
                return;
            }

            if (currentFocus.can_minimize()) {
                currentFocus.minimize();
            }

            this._refocusLockedWindow();
        }
    }

    _onWindowCreated(window) {
        if (!this._isLocked || !this._lockedWindow) {
            return;
        }

        if (this._minimizeTimeoutId) {
            GLib.source_remove(this._minimizeTimeoutId);
        }

        this._minimizeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            this._minimizeTimeoutId = null;
            if (this._isLocked && window && window !== this._lockedWindow) {
                if (window.get_window_type() !== Meta.WindowType.NORMAL) {
                    return GLib.SOURCE_REMOVE;
                }
                if (window.can_minimize()) {
                    window.minimize();
                }
                this._refocusLockedWindow();
            }
            return GLib.SOURCE_REMOVE;
        });
    }
}

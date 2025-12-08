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
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const UNLOCKED_ICON = '🔓';
const LOCKED_ICON = '🔒';

const FocusLockIndicator = GObject.registerClass(
class FocusLockIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Focus Lock Indicator');

        // State
        this._isLocked = false;
        this._lockedWindow = null;
        this._focusHandlerId = null;
        this._windowCreatedId = null;
        this._focusTimeoutId = null;
        this._minimizeTimeoutId = null;

        // Create the label for the panel
        this._label = new St.Label({
            text: UNLOCKED_ICON,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'focus-lock-indicator unlocked'
        });
        this.add_child(this._label);

        // Connect click handler
        this.connect('button-press-event', () => {
            this._toggleLock();
            return Clutter.EVENT_STOP;
        });
    }

    _toggleLock() {
        if (this._isLocked) {
            this._unlock();
        } else {
            this._lock();
        }
    }

    _lock() {
        // Get the currently focused window
        const focusedWindow = global.display.get_focus_window();
        
        if (!focusedWindow) {
            Main.notify('Focus Lock', 'No window is currently focused!');
            return;
        }

        this._lockedWindow = focusedWindow;
        this._isLocked = true;

        // Update UI
        this._label.text = LOCKED_ICON;
        this._label.style_class = 'focus-lock-indicator locked';

        // Connect to focus changes
        this._focusHandlerId = global.display.connect('notify::focus-window', () => {
            this._onFocusChanged();
        });

        // Connect to new window creation - minimize any new windows
        this._windowCreatedId = global.display.connect('window-created', (display, window) => {
            this._onWindowCreated(window);
        });

        // Get app name for notification
        const app = Shell.WindowTracker.get_default().get_window_app(focusedWindow);
        const appName = app ? app.get_name() : 'Window';
        Main.notify('Focus Lock', `Locked to: ${appName}`);
    }

    _unlock() {
        // Disconnect focus handler
        if (this._focusHandlerId) {
            global.display.disconnect(this._focusHandlerId);
            this._focusHandlerId = null;
        }

        // Disconnect window created handler
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }
        
        // Clear timeouts
        if (this._focusTimeoutId) {
            GLib.source_remove(this._focusTimeoutId);
            this._focusTimeoutId = null;
        }
        
        if (this._minimizeTimeoutId) {
            GLib.source_remove(this._minimizeTimeoutId);
            this._minimizeTimeoutId = null;
        }

        this._lockedWindow = null;
        this._isLocked = false;

        // Update UI
        this._label.text = UNLOCKED_ICON;
        this._label.style_class = 'focus-lock-indicator unlocked';

        Main.notify('Focus Lock', 'Unlocked - you can now switch windows');
    }

    _onFocusChanged() {
        // If we're locked and focus changed away from our window, refocus it
        if (!this._isLocked || !this._lockedWindow) {
            return;
        }

        const currentFocus = global.display.get_focus_window();
        
        // If focus moved to a different window, minimize it and bring back our locked window
        if (currentFocus && currentFocus !== this._lockedWindow) {
            // Check if the locked window still exists
            if (this._lockedWindow.get_compositor_private()) {
                // Minimize the intruding window
                if (currentFocus.can_minimize()) {
                    currentFocus.minimize();
                }
                
                // Use a small timeout to avoid focus race conditions
                if (this._focusTimeoutId) {
                    GLib.source_remove(this._focusTimeoutId);
                }
                
                this._focusTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                    this._focusTimeoutId = null;
                    if (this._isLocked && this._lockedWindow) {
                        const timestamp = global.get_current_time();
                        this._lockedWindow.activate(timestamp);
                    }
                    return GLib.SOURCE_REMOVE;
                });
            } else {
                // Window was closed, unlock
                this._unlock();
            }
        }
    }

    _onWindowCreated(window) {
        // Minimize any new window that opens while locked
        if (!this._isLocked || !this._lockedWindow) {
            return;
        }

        // Wait a bit for the window to be ready, then minimize it
        if (this._minimizeTimeoutId) {
            GLib.source_remove(this._minimizeTimeoutId);
        }

        this._minimizeTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._minimizeTimeoutId = null;
            if (this._isLocked && window && window !== this._lockedWindow) {
                if (window.can_minimize()) {
                    window.minimize();
                }
                // Refocus our locked window
                if (this._lockedWindow) {
                    const timestamp = global.get_current_time();
                    this._lockedWindow.activate(timestamp);
                }
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._focusHandlerId) {
            global.display.disconnect(this._focusHandlerId);
            this._focusHandlerId = null;
        }
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }
        if (this._focusTimeoutId) {
            GLib.source_remove(this._focusTimeoutId);
            this._focusTimeoutId = null;
        }
        if (this._minimizeTimeoutId) {
            GLib.source_remove(this._minimizeTimeoutId);
            this._minimizeTimeoutId = null;
        }
        super.destroy();
    }
});

export default class FocusLockExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
    }

    enable() {
        this._indicator = new FocusLockIndicator();
        Main.panel.addToStatusArea('focus-lock-indicator', this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}

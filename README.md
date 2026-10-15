# Focus Lock GNOME Extension

## Description

Focus Lock is a GNOME Shell extension that locks focus to a specific application window. When enabled, you cannot switch to other windows until you unlock it.

## Installation

1. Clone or download this repository.
2. Copy the `focuslock@kavinda` folder to `~/.local/share/gnome-shell/extensions/`.
3. Restart GNOME Shell (Alt+F2, type `r`, press Enter).
4. Enable the extension using GNOME Extensions or GNOME Tweaks.

## Usage

- Enable the extension to lock focus to the current window.
- To unlock, disable the extension or use the provided unlock mechanism.
- A notification is shown when the lock is turned on or off.
- If you try to switch to another window while the lock is on, a notification reminds you that Focus Lock is active (at most once every 5 seconds).

## Compatibility

- GNOME Shell versions: 45, 46, 47, 48, 49, 50
- e.g. Ubuntu 24.04+ and Fedora 39+

## About the Author

**Created by [Kavinda Mihiran](https://github.com/kavindamihiran)**

## License

This project is licensed under the **GNU General Public License v3.0**.
See the [LICENSE](LICENSE) file for more details.

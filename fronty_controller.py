#!/usr/bin/env python3
"""Desktop controller for the Fronty project."""

from __future__ import annotations

import json
import os
import platform
import re
import shlex
import socket
import shutil
import sqlite3
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

MODERN_STYLESHEET = """
QMainWindow {
    background: #0b1220;
}
QWidget {
    color: #d5e0f0;
    font-size: 13px;
}
QFrame#heroCard {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #111f39, stop:1 #0f2b41);
    border: 1px solid #274061;
    border-radius: 14px;
}
QLabel#heroTitle {
    color: #f8fbff;
    font-size: 22px;
    font-weight: 700;
}
QLabel#heroSubTitle {
    color: #9fc6eb;
    font-size: 12px;
}
QGroupBox {
    border: 1px solid #24384f;
    border-radius: 12px;
    margin-top: 16px;
    padding: 12px;
    background: #101a2d;
}
QGroupBox::title {
    subcontrol-origin: margin;
    left: 12px;
    top: 2px;
    padding: 0 6px;
    color: #91b6da;
    font-weight: 600;
}
QLineEdit, QPlainTextEdit, QSpinBox, QComboBox, QTableWidget {
    background: #0d1728;
    border: 1px solid #2b3f58;
    border-radius: 10px;
    padding: 7px;
    color: #e5edf8;
    selection-background-color: #2f81f7;
}
QLineEdit:focus, QPlainTextEdit:focus, QSpinBox:focus, QComboBox:focus, QTableWidget:focus {
    border: 1px solid #4a9bff;
}
QPushButton {
    background: #1d4ed8;
    border: 0;
    border-radius: 10px;
    padding: 9px 14px;
    color: #ffffff;
    font-weight: 600;
}
QPushButton:hover {
    background: #2563eb;
}
QPushButton:pressed {
    background: #1e40af;
}
QPushButton:disabled {
    background: #334155;
    color: #94a3b8;
}
QTabWidget::pane {
    border: 1px solid #24384f;
    border-radius: 12px;
    background: #0f1b2f;
}
QTabBar::tab {
    background: #16243a;
    color: #b6c9de;
    border: 1px solid #2a3d55;
    padding: 9px 14px;
    margin-right: 6px;
    border-top-left-radius: 10px;
    border-top-right-radius: 10px;
}
QTabBar::tab:selected {
    background: #1d3656;
    color: #f0f6ff;
}
QStatusBar {
    background: #091321;
    color: #9ec3e7;
    border-top: 1px solid #20354d;
}
QHeaderView::section {
    background: #14263d;
    color: #b9d2ea;
    border: 1px solid #304560;
    padding: 6px;
    font-weight: 600;
}
"""


APP_NAME = "Fronty Control Center"
APP_ID = "fronty-control-center"
WINDOWS_APP_USER_MODEL_ID = "Fronty.ControlCenter"
APP_ICON_FILES = (
    Path("assets") / "fronty-control-center.png",
    Path("assets") / "fronty-control-center.ico",
    Path("assets") / "fronty-control-center.svg",
)


def _resource_base() -> Path:
    bundled_base = getattr(sys, "_MEIPASS", None)
    if bundled_base:
        return Path(bundled_base)
    return Path(__file__).resolve().parent


def _resource_path(relative_path: Path) -> Path:
    return _resource_base() / relative_path


def _app_icon_path() -> Path | None:
    for relative_path in APP_ICON_FILES:
        path = _resource_path(relative_path)
        if path.exists():
            return path
    return None


def _set_windows_app_id() -> None:
    if platform.system() != "Windows":
        return
    try:
        import ctypes

        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(WINDOWS_APP_USER_MODEL_ID)
    except (AttributeError, OSError, ValueError):
        pass


@dataclass(frozen=True)
class ServiceInfo:
    kind: str
    name: str
    state: str
    source: str
    details: str


def _run_probe(command: list[str], timeout: float = 5.0) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None


def _combined_output(result: subprocess.CompletedProcess[str] | None) -> str:
    if result is None:
        return ""
    return "\n".join(part.strip() for part in (result.stdout, result.stderr) if part.strip())


def _first_output_line(result: subprocess.CompletedProcess[str] | None) -> str:
    output = _combined_output(result)
    return output.splitlines()[0].strip() if output else ""


def _service_kind(name: str, details: str = "") -> str:
    text = f"{name} {details}".lower()
    if any(token in text for token in ("fronty", "php", "php-fpm")):
        return "Fronty/PHP"
    if any(token in text for token in ("mysql", "mariadb", "sqlite", "postgres")):
        return "Database"
    if any(token in text for token in ("apache", "httpd", "nginx", "iis", "w3svc")):
        return "Web Server"
    if any(token in text for token in ("docker", "containerd", "podman")):
        return "Containers"
    return "System"


def _windows_service_state(value: object) -> str:
    states = {
        "1": "Stopped",
        "2": "Start Pending",
        "3": "Stop Pending",
        "4": "Running",
        "5": "Continue Pending",
        "6": "Pause Pending",
        "7": "Paused",
    }
    text = str(value).strip()
    return states.get(text, text or "Unknown")


def _important_service_sort_key(service: ServiceInfo) -> tuple[int, str, str]:
    priority = 0 if service.kind != "System" else 1
    return (priority, service.kind.lower(), service.name.lower())


def _autostart_target() -> Path | None:
    system_name = platform.system()
    if system_name == "Windows":
        appdata = os.environ.get("APPDATA")
        base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
        return base / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup" / f"{APP_ID}.cmd"
    if system_name == "Linux":
        return Path.home() / ".config" / "autostart" / f"{APP_ID}.desktop"
    return None


def _python_launcher() -> Path:
    executable = Path(sys.executable).resolve()
    if platform.system() == "Windows" and executable.name.lower() == "python.exe":
        pythonw = executable.with_name("pythonw.exe")
        if pythonw.exists():
            return pythonw
    return executable


def _app_launch_parts() -> list[str]:
    return [str(_python_launcher()), str(Path(__file__).resolve())]


def install_autostart() -> tuple[bool, str]:
    target = _autostart_target()
    if target is None:
        return False, "Autostart is supported here for Windows and Linux only."

    target.parent.mkdir(parents=True, exist_ok=True)
    system_name = platform.system()

    if system_name == "Windows":
        command = subprocess.list2cmdline(_app_launch_parts())
        working_dir = str(Path(__file__).resolve().parent)
        target.write_text(
            f"@echo off\r\ncd /d {subprocess.list2cmdline([working_dir])}\r\nstart \"\" {command}\r\n",
            encoding="utf-8",
        )
    elif system_name == "Linux":
        command = " ".join(shlex.quote(part) for part in _app_launch_parts())
        desktop_lines = [
            "[Desktop Entry]",
            "Type=Application",
            f"Name={APP_NAME}",
            f"Exec={command}",
            "Terminal=false",
            "X-GNOME-Autostart-enabled=true",
            "Comment=Start Fronty Control Center automatically",
            "",
        ]
        icon_path = _app_icon_path()
        if icon_path is not None:
            desktop_lines.insert(4, f"Icon={icon_path}")
        target.write_text("\n".join(desktop_lines), encoding="utf-8")
    else:
        return False, "Autostart is supported here for Windows and Linux only."

    return True, f"Autostart enabled: {target}"


def remove_autostart() -> tuple[bool, str]:
    target = _autostart_target()
    if target is None:
        return False, "Autostart is supported here for Windows and Linux only."
    if not target.exists():
        return True, "Autostart is already disabled."

    target.unlink()
    return True, f"Autostart disabled: {target}"


def is_autostart_enabled() -> bool:
    target = _autostart_target()
    return bool(target and target.exists())


def autostart_status_text() -> str:
    target = _autostart_target()
    if target is None:
        return "Unsupported on this OS"
    state = "Enabled" if is_autostart_enabled() else "Disabled"
    return f"{state} ({target})"


def _unique_existing_paths(paths: list[Path]) -> list[Path]:
    unique: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        key = str(path).casefold()
        if key in seen or not path.exists():
            continue
        unique.append(path)
        seen.add(key)
    return unique


def _laragon_roots() -> list[Path]:
    candidates: list[Path] = []
    for env_name in ("LARAGON_ROOT", "LARAGON_HOME"):
        value = os.environ.get(env_name)
        if value:
            candidates.append(Path(value).expanduser())

    if platform.system() == "Windows":
        candidates.extend(Path(f"{drive}:/laragon") for drive in ("C", "D", "E", "F"))

    candidates.extend(
        [
            Path.home() / "laragon",
            Path.home() / "Desktop" / "laragon",
        ]
    )
    return _unique_existing_paths(candidates)


def _version_key(path: Path) -> tuple[int, ...]:
    text = " ".join(part.name for part in (path.parent.parent, path.parent, path))
    return tuple(int(value) for value in re.findall(r"\d+", text))


def _newest_existing_file(paths: list[Path]) -> Path | None:
    existing = _unique_existing_paths(paths)
    if not existing:
        return None
    return sorted(existing, key=lambda item: (_version_key(item), str(item).casefold()))[-1]


def find_laragon_executable(kind: str) -> str | None:
    candidates: list[Path] = []
    for root in _laragon_roots():
        if kind == "php":
            candidates.extend((root / "bin" / "php").glob("*/php.exe"))
        elif kind == "mysql":
            candidates.extend((root / "bin" / "mysql").glob("*/bin/mysql.exe"))
            candidates.extend((root / "bin" / "mariadb").glob("*/bin/mysql.exe"))
            candidates.extend((root / "bin" / "mariadb").glob("*/bin/mariadb.exe"))
        elif kind == "apache":
            candidates.extend((root / "bin" / "apache").glob("*/bin/httpd.exe"))
        elif kind == "nginx":
            candidates.extend((root / "bin" / "nginx").glob("*/nginx.exe"))

    executable = _newest_existing_file(candidates)
    return str(executable) if executable else None


def find_runtime_executable(names: list[str], laragon_kind: str | None = None) -> tuple[str | None, str]:
    for name in names:
        found = shutil.which(name)
        if found:
            return found, "PATH"

    if laragon_kind:
        found = find_laragon_executable(laragon_kind)
        if found:
            return found, "Laragon"

    return None, "PATH/Laragon"


def resolve_php_executable(entry: str = "php") -> str | None:
    value = entry.strip().strip("\"'") or "php"
    path = Path(value).expanduser()
    if path.exists():
        if path.is_dir():
            executable = path / ("php.exe" if platform.system() == "Windows" else "php")
            return str(executable) if executable.exists() else None
        return str(path)

    if path.name == value:
        found, _source = find_runtime_executable([value, "php"], "php")
        return found

    return find_laragon_executable("php")


def resolve_mysql_executable() -> str | None:
    found, _source = find_runtime_executable(["mysql", "mariadb"], "mysql")
    return found


def discover_runtime_tools() -> list[ServiceInfo]:
    probes: list[tuple[str, list[str], list[str], str | None]] = [
        ("PHP", ["php"], ["-v"], "php"),
        ("MySQL client", ["mysql", "mariadb"], ["--version"], "mysql"),
        ("SQLite client", ["sqlite3"], ["--version"], None),
        ("Apache", ["apache2", "httpd", "apachectl"], ["-v"], "apache"),
        ("Nginx", ["nginx"], ["-v"], "nginx"),
    ]
    services: list[ServiceInfo] = []

    for label, executable_names, version_args, laragon_kind in probes:
        executable, source = find_runtime_executable(executable_names, laragon_kind)
        if not executable:
            services.append(ServiceInfo(_service_kind(label), label, "Missing", source, "Not found"))
            continue

        command = [executable, *version_args]
        version = _first_output_line(_run_probe(command, timeout=4.0))
        services.append(ServiceInfo(_service_kind(label, version), label, "Available", source, version or executable))

    return services


def discover_windows_services() -> list[ServiceInfo]:
    powershell = shutil.which("powershell") or shutil.which("pwsh")
    if powershell:
        command = [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            "Get-Service | Select-Object Name,DisplayName,Status | ConvertTo-Json -Compress",
        ]
        result = _run_probe(command, timeout=8.0)
        output = _combined_output(result)
        if result and result.returncode == 0 and output:
            try:
                payload = json.loads(output)
                rows = payload if isinstance(payload, list) else [payload]
                services = []
                for row in rows:
                    name = str(row.get("Name", "")).strip()
                    display_name = str(row.get("DisplayName", "")).strip()
                    state = _windows_service_state(row.get("Status", ""))
                    details = display_name or name
                    services.append(ServiceInfo(_service_kind(name, details), name, state, "Windows Service", details))
                return services
            except (TypeError, json.JSONDecodeError):
                pass

    sc_bin = shutil.which("sc.exe")
    if not sc_bin:
        return []

    result = _run_probe([sc_bin, "query", "state=", "all"], timeout=8.0)
    services: list[ServiceInfo] = []
    current: dict[str, str] = {}

    for raw_line in _combined_output(result).splitlines():
        line = raw_line.strip()
        if line.startswith("SERVICE_NAME:"):
            if current.get("name"):
                details = current.get("display", current["name"])
                services.append(
                    ServiceInfo(_service_kind(current["name"], details), current["name"], current.get("state", "Unknown"), "Windows Service", details)
                )
            current = {"name": line.split(":", 1)[1].strip()}
        elif line.startswith("DISPLAY_NAME:"):
            current["display"] = line.split(":", 1)[1].strip()
        elif line.startswith("STATE"):
            match = re.search(r":\s+\d+\s+(\w+)", line)
            current["state"] = match.group(1).title() if match else line.split(":", 1)[-1].strip()

    if current.get("name"):
        details = current.get("display", current["name"])
        services.append(
            ServiceInfo(_service_kind(current["name"], details), current["name"], current.get("state", "Unknown"), "Windows Service", details)
        )

    return services


def discover_linux_services() -> list[ServiceInfo]:
    systemctl = shutil.which("systemctl")
    if systemctl:
        result = _run_probe(
            [systemctl, "list-units", "--type=service", "--all", "--no-pager", "--no-legend"],
            timeout=8.0,
        )
        if result and result.returncode == 0:
            services = []
            for raw_line in result.stdout.splitlines():
                line = raw_line.strip()
                if not line:
                    continue
                parts = line.split(None, 4)
                if len(parts) < 4:
                    continue
                name = parts[0]
                state = f"{parts[2]}/{parts[3]}"
                details = parts[4] if len(parts) > 4 else name
                services.append(ServiceInfo(_service_kind(name, details), name, state, "systemd", details))
            return services

    service_bin = shutil.which("service")
    if not service_bin:
        return []

    result = _run_probe([service_bin, "--status-all"], timeout=8.0)
    services: list[ServiceInfo] = []
    for raw_line in _combined_output(result).splitlines():
        match = re.match(r"\[\s*([+\-?])\s*\]\s+(.+)", raw_line.strip())
        if not match:
            continue
        marker, name = match.groups()
        state = {"+": "Running", "-": "Stopped", "?": "Unknown"}.get(marker, "Unknown")
        services.append(ServiceInfo(_service_kind(name), name.strip(), state, "service", name.strip()))
    return services


def discover_system_services() -> list[ServiceInfo]:
    system_name = platform.system()
    discovered = discover_runtime_tools()
    if system_name == "Windows":
        discovered.extend(discover_windows_services())
    elif system_name == "Linux":
        discovered.extend(discover_linux_services())

    return sorted(discovered, key=_important_service_sort_key)


def detect_default_project() -> Path:
    current_dir = Path(__file__).resolve().parent
    if (current_dir / "api" / "index.php").exists():
        return current_dir

    candidates = [
        Path.cwd(),
        Path.home() / "Desktop" / "fronty",
        Path.home() / "Documents" / "fronty",
        Path("/home/glitch/Desktop/fronty"),
    ]
    for parent in current_dir.parents:
        candidates.append(parent)

    for candidate in candidates:
        if (candidate / "api" / "index.php").exists():
            return candidate

    return current_dir


def _print_cli_help() -> None:
    print(
        "\n".join(
            [
                f"{APP_NAME}",
                "Usage:",
                "  py -3 fronty_controller.py                 # open the desktop app",
                "  py -3 fronty_controller.py --install-autostart",
                "  py -3 fronty_controller.py --remove-autostart",
                "  py -3 fronty_controller.py --list-services",
                "  py -3 fronty_controller.py --system-info",
            ]
        )
    )


def _handle_cli(argv: list[str]) -> bool:
    if not argv:
        return False

    handled = False
    if "--help" in argv or "-h" in argv:
        _print_cli_help()
        handled = True

    if "--system-info" in argv:
        print(f"OS: {platform.system()} {platform.release()} ({platform.machine()})")
        print(f"Autostart: {autostart_status_text()}")
        print(f"Project: {detect_default_project()}")
        roots = ", ".join(str(path) for path in _laragon_roots()) or "Not found"
        print(f"Laragon: {roots}")
        print(f"PHP: {resolve_php_executable('php') or 'Not found'}")
        print(f"MySQL client: {resolve_mysql_executable() or 'Not found'}")
        handled = True

    if "--install-autostart" in argv:
        ok, message = install_autostart()
        print(message)
        handled = True
        if not ok:
            raise SystemExit(1)

    if "--remove-autostart" in argv or "--uninstall-autostart" in argv:
        ok, message = remove_autostart()
        print(message)
        handled = True
        if not ok:
            raise SystemExit(1)

    if "--list-services" in argv:
        services = discover_system_services()
        for service in services:
            print(f"{service.kind}\t{service.name}\t{service.state}\t{service.source}\t{service.details}")
        handled = True

    return handled


if __name__ == "__main__" and _handle_cli(sys.argv[1:]):
    raise SystemExit(0)


try:
    from PyQt6.QtCore import QProcess, Qt, QTimer, QUrl
    from PyQt6.QtGui import QCloseEvent, QDesktopServices, QIcon
    from PyQt6.QtWidgets import (
        QAbstractItemView,
        QApplication,
        QComboBox,
        QFileDialog,
        QFormLayout,
        QFrame,
        QGridLayout,
        QGroupBox,
        QHBoxLayout,
        QHeaderView,
        QLabel,
        QLineEdit,
        QMainWindow,
        QMessageBox,
        QPlainTextEdit,
        QPushButton,
        QSpinBox,
        QStatusBar,
        QTabWidget,
        QTableWidget,
        QTableWidgetItem,
        QVBoxLayout,
        QWidget,
    )
except ModuleNotFoundError as err:
    if (err.name or "").startswith("PyQt6"):
        raise SystemExit(
            "PyQt6 is required for the desktop UI.\n"
            "Windows: py -3 -m pip install PyQt6\n"
            "Linux: python3 -m pip install PyQt6"
        ) from err
    raise


def _load_app_icon() -> QIcon:
    for relative_path in APP_ICON_FILES:
        path = _resource_path(relative_path)
        if not path.exists():
            continue
        icon = QIcon(str(path))
        if not icon.isNull():
            return icon
    return QIcon()


class FrontyController(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.project_dir = detect_default_project()
        self.server_process = QProcess(self)
        self.server_process.setProcessChannelMode(QProcess.ProcessChannelMode.MergedChannels)
        self._stopping_server = False
        self._port_probe_supported = True

        self.setWindowTitle(APP_NAME)
        app_icon = _load_app_icon()
        if not app_icon.isNull():
            self.setWindowIcon(app_icon)
        self.resize(1020, 680)
        self.setStyleSheet(MODERN_STYLESHEET)

        self._build_ui()
        self._fit_window_to_screen()
        self._wire_process_signals()
        self._set_controls_for_state()
        self._on_sql_engine_changed(self.sql_engine_combo.currentText())
        QTimer.singleShot(100, self.refresh_system_overview)
        self.refresh_db_tables()

        self.auto_refresh_timer = QTimer(self)
        self.auto_refresh_timer.setInterval(20000)
        self.auto_refresh_timer.timeout.connect(self.refresh_stats)
        self.auto_refresh_timer.start()

    def _build_ui(self) -> None:
        root = QWidget(self)
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(14, 14, 14, 10)
        layout.setSpacing(12)

        layout.addWidget(self._build_hero_card())
        layout.addWidget(self._build_project_group())
        layout.addWidget(self._build_server_group())

        self.tabs = QTabWidget()
        self.tabs.addTab(self._build_dashboard_tab(), "Dashboard")
        self.tabs.addTab(self._build_system_tab(), "System Services")
        self.tabs.addTab(self._build_database_tab(), "Database Explorer")
        self.tabs.addTab(self._build_sql_console_tab(), "SQL Console")
        self.tabs.addTab(self._build_logs_tab(), "Logs")
        layout.addWidget(self.tabs, stretch=1)

        self.setStatusBar(QStatusBar(self))
        self.statusBar().showMessage("Ready")

    def _build_hero_card(self) -> QFrame:
        card = QFrame()
        card.setObjectName("heroCard")
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(16, 12, 16, 12)

        title = QLabel("Fronty Control Center")
        title.setObjectName("heroTitle")
        subtitle = QLabel("Manage server, browse database, run SQLite/MySQL commands from one place.")
        subtitle.setObjectName("heroSubTitle")

        card_layout.addWidget(title)
        card_layout.addWidget(subtitle)
        return card

    def _build_project_group(self) -> QGroupBox:
        group = QGroupBox("Project")
        row = QHBoxLayout(group)

        self.project_path_input = QLineEdit(str(self.project_dir))
        browse_btn = QPushButton("Browse")
        open_folder_btn = QPushButton("Open Folder")

        browse_btn.clicked.connect(self.browse_project_dir)
        open_folder_btn.clicked.connect(self.open_project_folder)

        row.addWidget(QLabel("Path:"))
        row.addWidget(self.project_path_input, stretch=1)
        row.addWidget(browse_btn)
        row.addWidget(open_folder_btn)
        return group

    def _build_server_group(self) -> QGroupBox:
        group = QGroupBox("Server")
        grid = QGridLayout(group)

        self.php_path_input = QLineEdit(resolve_php_executable("php") or "php")
        self.host_input = QLineEdit("127.0.0.1")
        self.port_input = QSpinBox()
        self.port_input.setRange(1024, 65535)
        self.port_input.setValue(8000)

        self.server_state_value = QLabel("Stopped")
        self.server_state_value.setStyleSheet("font-weight: 700; color: #ef4444;")

        self.start_btn = QPushButton("Start")
        self.stop_btn = QPushButton("Stop")
        self.restart_btn = QPushButton("Restart")
        self.check_api_btn = QPushButton("Refresh Stats")
        self.backup_db_btn = QPushButton("Backup DB")
        self.detect_php_btn = QPushButton("Detect PHP")

        self.start_btn.clicked.connect(self.start_server)
        self.stop_btn.clicked.connect(self.stop_server)
        self.restart_btn.clicked.connect(self.restart_server)
        self.check_api_btn.clicked.connect(self.refresh_stats)
        self.backup_db_btn.clicked.connect(self.backup_database)
        self.detect_php_btn.clicked.connect(self.detect_php_runtime)

        grid.addWidget(QLabel("PHP:"), 0, 0)
        grid.addWidget(self.php_path_input, 0, 1)
        grid.addWidget(QLabel("Host:"), 0, 2)
        grid.addWidget(self.host_input, 0, 3)
        grid.addWidget(QLabel("Port:"), 0, 4)
        grid.addWidget(self.port_input, 0, 5)
        grid.addWidget(self.detect_php_btn, 0, 6)

        grid.addWidget(QLabel("State:"), 1, 0)
        grid.addWidget(self.server_state_value, 1, 1)
        grid.addWidget(self.start_btn, 1, 2)
        grid.addWidget(self.stop_btn, 1, 3)
        grid.addWidget(self.restart_btn, 1, 4)
        grid.addWidget(self.check_api_btn, 1, 5)
        grid.addWidget(self.backup_db_btn, 1, 6)
        return group

    def _build_dashboard_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        layout.addWidget(self._build_shortcuts_group())
        layout.addWidget(self._build_stats_group())
        layout.addStretch(1)
        return tab

    def _build_system_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        system_group = QGroupBox("System Detection")
        system_layout = QGridLayout(system_group)

        self.system_summary_label = QLabel("-")
        self.autostart_status_label = QLabel("-")
        self.service_summary_label = QLabel("-")

        refresh_system_btn = QPushButton("Refresh")
        enable_startup_btn = QPushButton("Enable Autostart")
        disable_startup_btn = QPushButton("Disable Autostart")

        refresh_system_btn.clicked.connect(self.refresh_system_overview)
        enable_startup_btn.clicked.connect(self.enable_autostart)
        disable_startup_btn.clicked.connect(self.disable_autostart)

        system_layout.addWidget(QLabel("OS:"), 0, 0)
        system_layout.addWidget(self.system_summary_label, 0, 1, 1, 3)
        system_layout.addWidget(QLabel("Autostart:"), 1, 0)
        system_layout.addWidget(self.autostart_status_label, 1, 1, 1, 3)
        system_layout.addWidget(QLabel("Services:"), 2, 0)
        system_layout.addWidget(self.service_summary_label, 2, 1, 1, 3)
        system_layout.addWidget(refresh_system_btn, 3, 1)
        system_layout.addWidget(enable_startup_btn, 3, 2)
        system_layout.addWidget(disable_startup_btn, 3, 3)

        services_group = QGroupBox("Detected Services")
        services_layout = QVBoxLayout(services_group)
        self.services_table = QTableWidget()
        self._configure_data_table(self.services_table)
        self.services_table.setColumnCount(5)
        self.services_table.setHorizontalHeaderLabels(["Kind", "Name", "State", "Source", "Details"])
        services_layout.addWidget(self.services_table)

        layout.addWidget(system_group)
        layout.addWidget(services_group, stretch=1)
        return tab

    def _build_shortcuts_group(self) -> QGroupBox:
        group = QGroupBox("Quick Open")
        row = QHBoxLayout(group)

        open_store_btn = QPushButton("Store")
        open_sell_btn = QPushButton("Sell")
        open_admin_btn = QPushButton("Admin")
        open_api_btn = QPushButton("API Endpoint")

        open_store_btn.clicked.connect(lambda: self.open_page("index.html"))
        open_sell_btn.clicked.connect(lambda: self.open_page("sell.html"))
        open_admin_btn.clicked.connect(lambda: self.open_page("admin.html"))
        open_api_btn.clicked.connect(lambda: self.open_page("api/index.php?action=products.stats"))
        open_builder_btn = QPushButton("🏗️ Builder")
        open_builder_btn.clicked.connect(lambda: self.open_page("builder.html"))

        row.addWidget(open_store_btn)
        row.addWidget(open_sell_btn)
        row.addWidget(open_admin_btn)
        row.addWidget(open_builder_btn)
        row.addWidget(open_api_btn)
        return group

    def _build_stats_group(self) -> QGroupBox:
        group = QGroupBox("API Stats")
        grid = QGridLayout(group)

        self.total_value = QLabel("-")
        self.pending_value = QLabel("-")
        self.approved_value = QLabel("-")
        self.rejected_value = QLabel("-")
        self.stats_status = QLabel("Not loaded")

        labels = [
            ("Total:", self.total_value),
            ("Pending:", self.pending_value),
            ("Approved:", self.approved_value),
            ("Rejected:", self.rejected_value),
            ("Status:", self.stats_status),
        ]

        for row, (label, value) in enumerate(labels):
            value.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
            value.setStyleSheet("font-weight: 700; color: #e2eefc;")
            grid.addWidget(QLabel(label), row, 0)
            grid.addWidget(value, row, 1)

        return group

    def _build_database_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        controls_group = QGroupBox("SQLite Browser")
        controls_layout = QVBoxLayout(controls_group)

        row1 = QHBoxLayout()
        self.db_file_path_value = QLabel(str(self._sqlite_db_path()))
        self.db_file_path_value.setStyleSheet("color: #9fc3e7;")
        open_db_file_btn = QPushButton("Open DB File")
        open_db_file_btn.clicked.connect(self.open_sqlite_file)
        row1.addWidget(QLabel("Database:"))
        row1.addWidget(self.db_file_path_value, stretch=1)
        row1.addWidget(open_db_file_btn)
        controls_layout.addLayout(row1)

        row2 = QHBoxLayout()
        self.db_table_combo = QComboBox()
        self.db_limit_spin = QSpinBox()
        self.db_limit_spin.setRange(1, 2000)
        self.db_limit_spin.setValue(200)
        refresh_tables_btn = QPushButton("Refresh Tables")
        load_table_btn = QPushButton("Load Table")

        refresh_tables_btn.clicked.connect(self.refresh_db_tables)
        load_table_btn.clicked.connect(self.load_selected_table)

        row2.addWidget(QLabel("Table:"))
        row2.addWidget(self.db_table_combo, stretch=1)
        row2.addWidget(QLabel("Limit:"))
        row2.addWidget(self.db_limit_spin)
        row2.addWidget(refresh_tables_btn)
        row2.addWidget(load_table_btn)
        controls_layout.addLayout(row2)

        self.db_status_label = QLabel("No table loaded")
        self.db_status_label.setStyleSheet("color: #93b8db;")
        controls_layout.addWidget(self.db_status_label)

        self.db_table_view = QTableWidget()
        self._configure_data_table(self.db_table_view)

        layout.addWidget(controls_group)
        layout.addWidget(self.db_table_view, stretch=1)
        return tab

    def _build_sql_console_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        conn_group = QGroupBox("SQL Engine")
        conn_layout = QVBoxLayout(conn_group)

        engine_row = QHBoxLayout()
        self.sql_engine_combo = QComboBox()
        self.sql_engine_combo.addItems(["SQLite", "MySQL"])
        self.sql_engine_combo.currentTextChanged.connect(self._on_sql_engine_changed)
        engine_row.addWidget(QLabel("Engine:"))
        engine_row.addWidget(self.sql_engine_combo)
        engine_row.addStretch(1)
        conn_layout.addLayout(engine_row)

        self.mysql_group = QGroupBox("MySQL Connection")
        mysql_form = QFormLayout(self.mysql_group)
        self.mysql_host_input = QLineEdit("127.0.0.1")
        self.mysql_port_input = QSpinBox()
        self.mysql_port_input.setRange(1, 65535)
        self.mysql_port_input.setValue(3306)
        self.mysql_user_input = QLineEdit("root")
        self.mysql_password_input = QLineEdit()
        self.mysql_password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.mysql_db_input = QLineEdit("fronty")

        mysql_form.addRow("Host:", self.mysql_host_input)
        mysql_form.addRow("Port:", self.mysql_port_input)
        mysql_form.addRow("User:", self.mysql_user_input)
        mysql_form.addRow("Password:", self.mysql_password_input)
        mysql_form.addRow("Database:", self.mysql_db_input)
        conn_layout.addWidget(self.mysql_group)

        sql_group = QGroupBox("SQL Command")
        sql_layout = QVBoxLayout(sql_group)
        self.sql_editor = QPlainTextEdit()
        self.sql_editor.setPlaceholderText(
            "Examples:\nSELECT * FROM products LIMIT 20;\nSHOW TABLES;\nUPDATE products SET status='approved' WHERE id=1;"
        )
        sql_layout.addWidget(self.sql_editor)

        sql_buttons = QHBoxLayout()
        execute_sql_btn = QPushButton("Execute")
        clear_sql_btn = QPushButton("Clear Editor")
        clear_results_btn = QPushButton("Clear Results")

        execute_sql_btn.clicked.connect(self.execute_sql_command)
        clear_sql_btn.clicked.connect(self.sql_editor.clear)
        clear_results_btn.clicked.connect(self.clear_sql_results)

        sql_buttons.addWidget(execute_sql_btn)
        sql_buttons.addWidget(clear_sql_btn)
        sql_buttons.addWidget(clear_results_btn)
        sql_buttons.addStretch(1)
        sql_layout.addLayout(sql_buttons)

        results_group = QGroupBox("Result")
        results_layout = QVBoxLayout(results_group)
        self.sql_result_table = QTableWidget()
        self._configure_data_table(self.sql_result_table)
        self.sql_output = QPlainTextEdit()
        self.sql_output.setReadOnly(True)
        self.sql_output.setMaximumBlockCount(1000)
        self.sql_output.setPlaceholderText("Execution output will appear here.")

        results_layout.addWidget(self.sql_result_table, stretch=1)
        results_layout.addWidget(self.sql_output, stretch=0)

        layout.addWidget(conn_group)
        layout.addWidget(sql_group)
        layout.addWidget(results_group, stretch=1)
        return tab

    def _build_logs_tab(self) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(10)

        group = QGroupBox("Server Logs")
        group_layout = QVBoxLayout(group)
        controls = QHBoxLayout()

        self.clear_logs_btn = QPushButton("Clear Logs")
        self.clear_logs_btn.clicked.connect(self.clear_logs)

        controls.addStretch(1)
        controls.addWidget(self.clear_logs_btn)

        self.logs = QPlainTextEdit()
        self.logs.setReadOnly(True)
        self.logs.setMaximumBlockCount(3000)

        group_layout.addLayout(controls)
        group_layout.addWidget(self.logs, stretch=1)

        layout.addWidget(group, stretch=1)
        return tab

    def _wire_process_signals(self) -> None:
        self.server_process.started.connect(self._on_server_started)
        self.server_process.finished.connect(self._on_server_finished)
        self.server_process.readyReadStandardOutput.connect(self._on_process_output)
        self.server_process.errorOccurred.connect(self._on_server_error)

    def _configure_data_table(self, table: QTableWidget) -> None:
        table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        table.setAlternatingRowColors(True)
        table.verticalHeader().setVisible(False)
        table.horizontalHeader().setStretchLastSection(True)
        table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.ResizeToContents)

    def _populate_table(self, table: QTableWidget, headers: list[str], rows: list[tuple]) -> None:
        table.clear()
        table.setColumnCount(len(headers))
        table.setHorizontalHeaderLabels(headers)
        table.setRowCount(len(rows))

        for row_idx, row in enumerate(rows):
            for col_idx, value in enumerate(row):
                item = QTableWidgetItem("" if value is None else str(value))
                table.setItem(row_idx, col_idx, item)

        table.resizeColumnsToContents()

    def _set_controls_for_state(self) -> None:
        running = self._is_server_running()
        self.start_btn.setEnabled(not running)
        self.stop_btn.setEnabled(running)
        self.restart_btn.setEnabled(running)

        if running:
            self.server_state_value.setText("Running")
            self.server_state_value.setStyleSheet("font-weight: 700; color: #22c55e;")
        else:
            self.server_state_value.setText("Stopped")
            self.server_state_value.setStyleSheet("font-weight: 700; color: #ef4444;")

    def _is_server_running(self) -> bool:
        return self.server_process.state() == QProcess.ProcessState.Running

    def _fit_window_to_screen(self) -> None:
        screen = self.screen() or QApplication.primaryScreen()
        if screen is None:
            return

        available = screen.availableGeometry()
        target_width = min(1120, max(780, int(available.width() * 0.92)))
        target_height = min(760, max(560, int(available.height() * 0.9)))
        self.resize(target_width, target_height)
        self.setMinimumSize(620, 460)

        x = available.x() + max(0, (available.width() - target_width) // 2)
        y = available.y() + max(0, (available.height() - target_height) // 2)
        self.move(x, y)

    def _is_port_available(self, host: str, port: int) -> bool:
        if not self._port_probe_supported:
            return True

        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                sock.bind((host, port))
            return True
        except PermissionError:
            # Some locked-down environments block socket probing.
            self._port_probe_supported = False
            self._append_log("Port pre-check not permitted by this environment. Continuing without pre-check.")
            return True
        except OSError:
            return False

    def _find_available_port(self, host: str, start_port: int, attempts: int = 150) -> int | None:
        max_port = min(65535, start_port + attempts)
        for port in range(start_port, max_port + 1):
            if self._is_port_available(host, port):
                return port
        return None

    def _project_path(self) -> Path:
        return Path(self.project_path_input.text().strip()).expanduser().resolve()

    def _sqlite_db_path(self) -> Path:
        return self._project_path() / "api" / "fronty.db"

    def _server_url(self) -> str:
        host = self.host_input.text().strip() or "127.0.0.1"
        port = self.port_input.value()
        return f"http://{host}:{port}"

    def _append_log(self, text: str) -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        for line in text.rstrip().splitlines() or [""]:
            self.logs.appendPlainText(f"[{timestamp}] {line}")
        self.logs.verticalScrollBar().setValue(self.logs.verticalScrollBar().maximum())

    def _append_sql_output(self, text: str) -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.sql_output.appendPlainText(f"[{timestamp}] {text}")

    def _quote_identifier(self, name: str) -> str:
        return '"' + name.replace('"', '""') + '"'

    def refresh_system_overview(self) -> None:
        os_text = f"{platform.system()} {platform.release()} ({platform.machine()})"
        manager = "Windows Services" if platform.system() == "Windows" else "systemd/service" if platform.system() == "Linux" else "Unknown"
        self.system_summary_label.setText(f"{os_text} | manager: {manager}")
        self.autostart_status_label.setText(autostart_status_text())

        services = discover_system_services()
        rows = [(item.kind, item.name, item.state, item.source, item.details) for item in services]
        self._populate_table(self.services_table, ["Kind", "Name", "State", "Source", "Details"], rows)

        important_count = sum(1 for item in services if item.kind != "System")
        self.service_summary_label.setText(f"{len(services)} detected, {important_count} related to Fronty/web/database stack.")
        self.statusBar().showMessage("System services refreshed", 2500)

    def enable_autostart(self) -> None:
        ok, message = install_autostart()
        self.autostart_status_label.setText(autostart_status_text())
        self._append_log(message)
        if ok:
            QMessageBox.information(self, "Autostart", message)
        else:
            QMessageBox.warning(self, "Autostart", message)

    def disable_autostart(self) -> None:
        ok, message = remove_autostart()
        self.autostart_status_label.setText(autostart_status_text())
        self._append_log(message)
        if ok:
            QMessageBox.information(self, "Autostart", message)
        else:
            QMessageBox.warning(self, "Autostart", message)

    def detect_php_runtime(self) -> None:
        php_exec = resolve_php_executable("php")
        if not php_exec:
            message = "PHP was not found in PATH or Laragon folders."
            self._append_log(message)
            QMessageBox.warning(self, "PHP missing", message)
            return

        self.php_path_input.setText(php_exec)
        self._append_log(f"Detected PHP: {php_exec}")
        self.statusBar().showMessage(f"Detected PHP: {php_exec}", 4000)

    def browse_project_dir(self) -> None:
        picked = QFileDialog.getExistingDirectory(self, "Select Fronty Project", str(self._project_path()))
        if picked:
            self.project_path_input.setText(picked)
            self.db_file_path_value.setText(str(self._sqlite_db_path()))
            self.refresh_db_tables()
            self.statusBar().showMessage(f"Project path set to: {picked}", 3000)

    def open_project_folder(self) -> None:
        path = self._project_path()
        if not path.exists():
            QMessageBox.warning(self, "Missing folder", f"Project folder does not exist:\n{path}")
            return
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(path)))

    def start_server(self) -> None:
        if self._is_server_running():
            self.statusBar().showMessage("Server already running", 2000)
            return
        self._stopping_server = False

        project_path = self._project_path()
        if not project_path.exists():
            QMessageBox.warning(self, "Project not found", f"Project path does not exist:\n{project_path}")
            return
        if not (project_path / "api" / "index.php").exists():
            QMessageBox.warning(
                self,
                "Invalid project",
                "Expected file was not found:\napi/index.php\n\nPlease choose the Fronty root folder.",
            )
            return

        php_entry = self.php_path_input.text().strip() or "php"
        php_exec = resolve_php_executable(php_entry)
        if not php_exec or not Path(php_exec).exists():
            QMessageBox.warning(
                self,
                "PHP missing",
                f"PHP executable not found:\n{php_entry}\n\nLaragon is supported automatically if it exists under C:\\laragon.",
            )
            return
        self.php_path_input.setText(php_exec)

        host = self.host_input.text().strip() or "127.0.0.1"
        requested_port = self.port_input.value()
        if not self._is_port_available(host, requested_port):
            alternative_port = self._find_available_port(host, requested_port + 1)
            if alternative_port is None:
                QMessageBox.critical(
                    self,
                    "Port unavailable",
                    f"Port {requested_port} is in use and no free port was found nearby.",
                )
                self._append_log(f"Port {requested_port} busy and no fallback port found.")
                return

            self.port_input.setValue(alternative_port)
            self._append_log(
                f"Port {requested_port} is in use. Switched to available port {alternative_port}."
            )
            QMessageBox.information(
                self,
                "Port changed",
                f"Port {requested_port} was busy.\nSwitched automatically to {alternative_port}.",
            )

        port = self.port_input.value()
        args = ["-S", f"{host}:{port}", "-t", str(project_path)]

        self.server_process.setWorkingDirectory(str(project_path))
        self._append_log(f"Starting: {php_exec} {' '.join(args)}")
        self.server_process.start(php_exec, args)

        if not self.server_process.waitForStarted(4000):
            self._append_log(f"Failed to start server: {self.server_process.errorString()}")
            QMessageBox.critical(self, "Start failed", self.server_process.errorString())
            self._set_controls_for_state()
            return

        self._set_controls_for_state()
        self.statusBar().showMessage(f"Server running at {self._server_url()}", 4000)

    def stop_server(self) -> None:
        if not self._is_server_running():
            self.statusBar().showMessage("Server is not running", 2000)
            return

        self._stopping_server = True
        self._append_log("Stopping server...")
        self.server_process.terminate()
        if not self.server_process.waitForFinished(3000):
            self._append_log("Terminate timed out. Killing process.")
            self.server_process.kill()
            self.server_process.waitForFinished(2000)

        self._set_controls_for_state()
        self.statusBar().showMessage("Server stopped", 3000)

    def restart_server(self) -> None:
        self.stop_server()
        self.start_server()

    def open_page(self, relative_path: str) -> None:
        if not self._is_server_running():
            self.start_server()
            if not self._is_server_running():
                return

        url = f"{self._server_url().rstrip('/')}/{relative_path.lstrip('/')}"
        QDesktopServices.openUrl(QUrl(url))
        self.statusBar().showMessage(f"Opened {url}", 3000)

    def refresh_stats(self) -> None:
        if not self._is_server_running():
            self.stats_status.setText("Server is stopped")
            return

        endpoint = f"{self._server_url().rstrip('/')}/api/index.php?action=products.stats"
        try:
            with urlopen(endpoint, timeout=1.5) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except URLError as err:
            self.stats_status.setText(f"Request failed: {err.reason}")
            return
        except Exception as err:  # noqa: BLE001
            self.stats_status.setText(f"Invalid response: {err}")
            return

        if not isinstance(payload, dict) or not payload.get("success"):
            self.stats_status.setText("API returned error")
            return

        data = payload.get("data", {})
        self.total_value.setText(str(data.get("total", "-")))
        self.pending_value.setText(str(data.get("pending", "-")))
        self.approved_value.setText(str(data.get("approved", "-")))
        self.rejected_value.setText(str(data.get("rejected", "-")))
        self.stats_status.setText("OK")

    def backup_database(self) -> None:
        project_path = self._project_path()
        db_file = project_path / "api" / "fronty.db"
        if not db_file.exists():
            QMessageBox.warning(self, "DB missing", f"Database not found:\n{db_file}")
            return

        backup_dir = project_path / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = backup_dir / f"fronty_{stamp}.db"

        shutil.copy2(db_file, backup_file)
        self._append_log(f"DB backup created: {backup_file}")
        self.statusBar().showMessage(f"Backup saved: {backup_file.name}", 4000)
        self.refresh_db_tables()

    def open_sqlite_file(self) -> None:
        db_file = self._sqlite_db_path()
        if not db_file.exists():
            QMessageBox.warning(self, "DB missing", f"Database not found:\n{db_file}")
            return
        
        sys_name = platform.system()
        if sys_name == "Windows":
            subprocess.Popen(["explorer", "/select,", str(db_file)])
        elif sys_name == "Darwin":
            subprocess.Popen(["open", "-R", str(db_file)])
        else:
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(db_file.parent)))

    def refresh_db_tables(self) -> None:
        db_file = self._sqlite_db_path()
        self.db_file_path_value.setText(str(db_file))
        self.db_table_combo.clear()
        self.db_table_view.clear()
        self.db_table_view.setRowCount(0)
        self.db_table_view.setColumnCount(0)

        if not db_file.exists():
            self.db_status_label.setText("Database not found.")
            return

        try:
            conn = sqlite3.connect(db_file)
            cur = conn.cursor()
            cur.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
            tables = [row[0] for row in cur.fetchall()]
            conn.close()
        except sqlite3.Error as err:
            self.db_status_label.setText(f"DB read error: {err}")
            return

        self.db_table_combo.addItems(tables)
        if tables:
            self.db_status_label.setText(f"{len(tables)} table(s) found.")
            self.load_selected_table()
        else:
            self.db_status_label.setText("No tables found.")

    def load_selected_table(self) -> None:
        table_name = self.db_table_combo.currentText().strip()
        if not table_name:
            self.db_status_label.setText("Select a table first.")
            return

        db_file = self._sqlite_db_path()
        if not db_file.exists():
            self.db_status_label.setText("Database not found.")
            return

        quoted_name = self._quote_identifier(table_name)
        limit_value = self.db_limit_spin.value()

        try:
            conn = sqlite3.connect(db_file)
            cur = conn.cursor()
            cur.execute(f"SELECT * FROM {quoted_name} LIMIT ?", (limit_value,))
            rows = cur.fetchall()
            headers = [col[0] for col in (cur.description or [])]
            cur.execute(f"SELECT COUNT(*) FROM {quoted_name}")
            total_rows = int(cur.fetchone()[0])
            conn.close()
        except sqlite3.Error as err:
            self.db_status_label.setText(f"Load failed: {err}")
            return

        self._populate_table(self.db_table_view, headers, rows)
        self.db_status_label.setText(
            f"Table '{table_name}': showing {len(rows)} row(s) from total {total_rows}."
        )

    def _on_sql_engine_changed(self, engine: str) -> None:
        use_mysql = engine == "MySQL"
        self.mysql_group.setVisible(use_mysql)
        if use_mysql:
            self._append_sql_output("MySQL mode enabled. Requires local 'mysql' client.")
        else:
            self._append_sql_output("SQLite mode enabled.")

    def execute_sql_command(self) -> None:
        query = self.sql_editor.toPlainText().strip()
        if not query:
            QMessageBox.information(self, "Empty SQL", "Write an SQL command first.")
            return

        engine = self.sql_engine_combo.currentText()
        self._append_sql_output(f"Running on {engine}: {query.splitlines()[0][:120]}")

        if engine == "SQLite":
            self._run_sqlite_sql(query)
        else:
            self._run_mysql_sql(query)

        self.refresh_db_tables()

    def _run_sqlite_sql(self, query: str) -> None:
        db_file = self._sqlite_db_path()
        if not db_file.exists():
            self._append_sql_output(f"SQLite DB not found: {db_file}")
            return

        try:
            conn = sqlite3.connect(db_file)
            cur = conn.cursor()

            statements = [part.strip() for part in query.split(";") if part.strip()]
            if len(statements) > 1:
                cur.executescript(query)
                conn.commit()
                self.sql_result_table.clear()
                self.sql_result_table.setRowCount(0)
                self.sql_result_table.setColumnCount(0)
                self._append_sql_output("SQLite script executed successfully.")
                conn.close()
                return

            cur.execute(query)
            if cur.description:
                headers = [col[0] for col in cur.description]
                rows = cur.fetchall()
                self._populate_table(self.sql_result_table, headers, rows)
                self._append_sql_output(f"SQLite returned {len(rows)} row(s).")
            else:
                conn.commit()
                affected = cur.rowcount if cur.rowcount >= 0 else 0
                self.sql_result_table.clear()
                self.sql_result_table.setRowCount(0)
                self.sql_result_table.setColumnCount(0)
                self._append_sql_output(f"SQLite command executed. Affected rows: {affected}")
            conn.close()
        except sqlite3.Error as err:
            self._append_sql_output(f"SQLite error: {err}")

    def _run_mysql_sql(self, query: str) -> None:
        mysql_bin = resolve_mysql_executable()
        if not mysql_bin:
            self._append_sql_output("MySQL client not found in PATH or Laragon folders.")
            return

        host = self.mysql_host_input.text().strip() or "127.0.0.1"
        port = self.mysql_port_input.value()
        user = self.mysql_user_input.text().strip()
        password = self.mysql_password_input.text()
        database = self.mysql_db_input.text().strip()

        if not user or not database:
            self._append_sql_output("MySQL mode requires username and database.")
            return

        cmd = [mysql_bin, "-h", host, "-P", str(port), "-u", user]
        if password:
            cmd.append(f"-p{password}")
        cmd.extend(["-D", database, "--batch", "--raw", "-e", query])

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=20, check=False)
        except subprocess.TimeoutExpired:
            self._append_sql_output("MySQL command timed out.")
            return
        except OSError as err:
            self._append_sql_output(f"MySQL run error: {err}")
            return

        if result.returncode != 0:
            error_text = result.stderr.strip() or "Unknown MySQL error."
            self._append_sql_output(f"MySQL error: {error_text}")
            return

        stdout = result.stdout.strip()
        stderr = result.stderr.strip()

        if stdout:
            lines = stdout.splitlines()
            headers = lines[0].split("\t")
            rows = [line.split("\t") for line in lines[1:]]
            self._populate_table(self.sql_result_table, headers, rows)
            self._append_sql_output(f"MySQL returned {len(rows)} row(s).")
        else:
            self.sql_result_table.clear()
            self.sql_result_table.setRowCount(0)
            self.sql_result_table.setColumnCount(0)
            self._append_sql_output("MySQL command executed.")

        if stderr:
            self._append_sql_output(stderr)

    def clear_sql_results(self) -> None:
        self.sql_result_table.clear()
        self.sql_result_table.setRowCount(0)
        self.sql_result_table.setColumnCount(0)
        self.sql_output.clear()

    def clear_logs(self) -> None:
        self.logs.clear()

    def _on_server_started(self) -> None:
        self._append_log("Server started.")
        self._set_controls_for_state()
        self.refresh_stats()

    def _on_server_finished(self, exit_code: int, exit_status: QProcess.ExitStatus) -> None:
        self._append_log(f"Server finished. exit_code={exit_code}, exit_status={exit_status.name}")
        self._set_controls_for_state()
        self.stats_status.setText("Server is stopped")
        if not self._stopping_server and exit_code != 0:
            QMessageBox.warning(
                self,
                "Server stopped with error",
                "The PHP server exited with an error.\nCheck the Logs tab for the exact message.",
            )
        self._stopping_server = False

    def _on_process_output(self) -> None:
        output = bytes(self.server_process.readAllStandardOutput()).decode("utf-8", errors="replace")
        if output:
            self._append_log(output)

    def _on_server_error(self, error: QProcess.ProcessError) -> None:
        self._append_log(f"Process error: {error.name}")
        self._set_controls_for_state()

    def closeEvent(self, event: QCloseEvent) -> None:  # noqa: N802
        if self._is_server_running():
            self.stop_server()
        event.accept()


def main() -> int:
    _set_windows_app_id()
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setApplicationDisplayName(APP_NAME)

    app_icon = _load_app_icon()
    if not app_icon.isNull():
        app.setWindowIcon(app_icon)

    window = FrontyController()
    if not app_icon.isNull():
        window.setWindowIcon(app_icon)
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())

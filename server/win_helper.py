import os
import sys
import ctypes
from ctypes import wintypes

sys.stdout.reconfigure(encoding='utf-8')

# Windows API definitions
shell32 = ctypes.windll.shell32
kernel32 = ctypes.windll.kernel32

ShellExecuteW = shell32.ShellExecuteW
ShellExecuteW.argtypes = [wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR, ctypes.c_int]
ShellExecuteW.restype = wintypes.HINSTANCE

GetShortPathNameW = kernel32.GetShortPathNameW
GetShortPathNameW.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, wintypes.DWORD]
GetShortPathNameW.restype = wintypes.DWORD

def get_short_path(path):
    """Returns 8.3 DOS short path which bypasses all Windows Explorer unicode parser bugs."""
    try:
        buf = ctypes.create_unicode_buffer(1024)
        res = GetShortPathNameW(path, buf, 1024)
        if res > 0 and os.path.exists(buf.value):
            return buf.value
    except Exception:
        pass
    return path

def show_in_folder(target_path):
    """Opens Windows Explorer with the target file selected and highlighted in foreground."""
    target_path = os.path.abspath(target_path)
    print(f"[win_helper] show_in_folder: {target_path}")

    if not os.path.exists(target_path):
        # If target file doesn't exist, open its parent directory
        parent = os.path.dirname(target_path)
        if os.path.exists(parent):
            print(f"[win_helper] Target not found, opening parent folder: {parent}")
            ret = ShellExecuteW(None, "open", parent, None, None, 1)
            print(f"[win_helper] ShellExecuteW parent returned: {ret}")
            return ret > 32
        return False

    if os.path.isdir(target_path):
        print(f"[win_helper] Target is directory, opening: {target_path}")
        ret = ShellExecuteW(None, "open", target_path, None, None, 1)
        return ret > 32

    # Target is a file. Use 8.3 short path or full path with /select,
    short_path = get_short_path(target_path)
    print(f"[win_helper] Target short path: {short_path}")

    # Method 1: Try /select,"<short_path>" via ShellExecuteW
    params = f'/select,"{short_path}"'
    ret = ShellExecuteW(None, "open", "explorer.exe", params, None, 1)
    print(f"[win_helper] ShellExecuteW /select short path returned: {ret}")

    if ret <= 32:
        # Method 2: Try /select,"<full_path>"
        params = f'/select,"{target_path}"'
        ret = ShellExecuteW(None, "open", "explorer.exe", params, None, 1)
        print(f"[win_helper] ShellExecuteW /select full path returned: {ret}")

    if ret <= 32:
        # Method 3: Fallback to opening containing directory
        parent = os.path.dirname(target_path)
        ret = ShellExecuteW(None, "open", parent, None, None, 1)
        print(f"[win_helper] Fallback open directory returned: {ret}")

    return ret > 32

def open_file(target_path):
    """Opens the file with its default registered Windows application."""
    target_path = os.path.abspath(target_path)
    print(f"[win_helper] open_file: {target_path}")

    if not os.path.exists(target_path):
        print(f"[win_helper] File does not exist: {target_path}")
        return False

    ret = ShellExecuteW(None, "open", target_path, None, None, 1)
    print(f"[win_helper] ShellExecuteW open_file returned: {ret}")
    return ret > 32

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python win_helper.py [--folder|--file] <path>")
        sys.exit(1)

    mode = sys.argv[1]
    path_arg = sys.argv[2]

    if mode == '--folder':
        success = show_in_folder(path_arg)
    elif mode == '--file':
        success = open_file(path_arg)
    else:
        print(f"Unknown mode: {mode}")
        sys.exit(1)

    sys.exit(0 if success else 1)

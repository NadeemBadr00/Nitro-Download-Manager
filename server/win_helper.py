import os
import sys
import subprocess
import ctypes
from ctypes import wintypes

sys.stdout.reconfigure(encoding='utf-8')

def show_in_folder(target_path):
    target_path = os.path.abspath(target_path)
    print(f"[win_helper] show_in_folder requested for: {target_path}")

    parent_dir = os.path.dirname(target_path) if os.path.isfile(target_path) else target_path
    if not os.path.exists(parent_dir):
        parent_dir = os.path.join(os.environ.get('USERPROFILE', 'C:\\Users\\DELL'), 'Downloads')

    # Step 1: Try explorer /select,"<target_path>"
    selected = False
    if os.path.isfile(target_path):
        try:
            print(f"[win_helper] Running: explorer.exe /select,\"{target_path}\"")
            subprocess.Popen(f'explorer.exe /select,"{target_path}"', shell=True)
            selected = True
        except Exception as e:
            print(f"[win_helper] /select failed: {e}")

    # Step 2: Ensure the folder is opened in foreground using os.startfile
    try:
        print(f"[win_helper] Opening folder in foreground: {parent_dir}")
        os.startfile(parent_dir)
    except Exception as e:
        print(f"[win_helper] os.startfile failed: {e}")
        try:
            subprocess.Popen(['explorer.exe', parent_dir])
        except Exception as e2:
            print(f"[win_helper] fallback explorer failed: {e2}")

    return True

def open_file(target_path):
    target_path = os.path.abspath(target_path)
    print(f"[win_helper] open_file requested for: {target_path}")

    if not os.path.exists(target_path):
        print(f"[win_helper] Error: File does not exist: {target_path}")
        return False

    try:
        print(f"[win_helper] Launching file via os.startfile: {target_path}")
        os.startfile(target_path)
        return True
    except Exception as e:
        print(f"[win_helper] os.startfile error: {e}")
        try:
            # Fallback to ShellExecuteW
            ret = ctypes.windll.shell32.ShellExecuteW(None, "open", target_path, None, None, 1)
            return ret > 32
        except Exception as e2:
            print(f"[win_helper] ShellExecuteW fallback error: {e2}")
            return False

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

import os
import sys
import ctypes

sys.stdout.reconfigure(encoding='utf-8')

def show_in_folder(target_path):
    target_path = os.path.abspath(target_path)
    print(f"[win_helper] show_in_folder: {target_path}")

    # Determine directory to open
    if os.path.isdir(target_path):
        target_dir = target_path
    else:
        target_dir = os.path.dirname(target_path)

    if not os.path.exists(target_dir):
        target_dir = os.path.join(os.environ.get('USERPROFILE', 'C:\\Users\\DELL'), 'Downloads')

    print(f"[win_helper] Opening folder via os.startfile: {target_dir}")
    try:
        os.startfile(target_dir)
        print("[win_helper] os.startfile succeeded")
        return True
    except Exception as e:
        print(f"[win_helper] os.startfile failed: {e}")
        try:
            ret = ctypes.windll.shell32.ShellExecuteW(None, "open", target_dir, None, None, 1)
            return ret > 32
        except Exception as e2:
            print(f"[win_helper] ShellExecuteW failed: {e2}")
            return False

def open_file(target_path):
    target_path = os.path.abspath(target_path)
    print(f"[win_helper] open_file: {target_path}")

    if not os.path.exists(target_path):
        print(f"[win_helper] File not found: {target_path}")
        return False

    print(f"[win_helper] Launching file via os.startfile: {target_path}")
    try:
        os.startfile(target_path)
        print("[win_helper] os.startfile succeeded")
        return True
    except Exception as e:
        print(f"[win_helper] os.startfile failed: {e}")
        try:
            ret = ctypes.windll.shell32.ShellExecuteW(None, "open", target_path, None, None, 1)
            return ret > 32
        except Exception as e2:
            print(f"[win_helper] ShellExecuteW failed: {e2}")
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

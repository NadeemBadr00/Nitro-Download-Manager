import subprocess
import os
import re

# Get all explorer PIDs
out = subprocess.check_output(['tasklist', '/FI', 'IMAGENAME eq explorer.exe', '/FO', 'CSV'], text=True)
lines = out.strip().split('\n')[1:]

pids = []
for line in lines:
    parts = [p.strip('"\r') for p in line.split('","')]
    if len(parts) >= 2 and parts[0].lower() == 'explorer.exe':
        try:
            pids.append(int(parts[1]))
        except ValueError:
            pass

print(f"Found {len(pids)} explorer.exe PIDs: {pids}")

# The oldest / first PID is usually the main shell
if len(pids) > 1:
    primary = pids[0]
    print(f"Keeping primary shell PID: {primary}")
    for pid in pids[1:]:
        print(f"Killing orphan PID: {pid}")
        subprocess.run(['taskkill', '/F', '/PID', str(pid)], capture_output=True)
    print("Cleanup complete.")
else:
    print("Only 1 explorer.exe running.")

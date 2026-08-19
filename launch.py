import subprocess

cmd = r'"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" http://localhost:3000'
res = subprocess.run(['wmic', 'process', 'call', 'create', cmd], capture_output=True, text=True)
print("WMIC Output:", res.stdout)

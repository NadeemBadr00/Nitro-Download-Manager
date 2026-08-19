Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Run node server/server.js completely hidden in background (0 = hide window)
WshShell.CurrentDirectory = strDir
WshShell.Run "node server/server.js", 0, False

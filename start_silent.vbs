Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)

Dim nodePath
nodePath = "node"

' Check specific Node.js paths on this machine
If fso.FileExists("C:\Program Files\Microsoft Visual Studio\18\Insiders\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe") Then
    nodePath = """C:\Program Files\Microsoft Visual Studio\18\Insiders\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe"""
ElseIf fso.FileExists("C:\Program Files\nodejs\node.exe") Then
    nodePath = """C:\Program Files\nodejs\node.exe"""
ElseIf fso.FileExists("C:\Program Files (x86)\nodejs\node.exe") Then
    nodePath = """C:\Program Files (x86)\nodejs\node.exe"""
End If

WshShell.CurrentDirectory = strDir
WshShell.Run nodePath & " server/server.js", 0, False

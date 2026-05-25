Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
command = "cmd.exe /s /c " & Chr(34) & Chr(34) & root & "\start-app.bat" & Chr(34) & " --background > " & Chr(34) & root & "\start-app.out.log" & Chr(34) & " 2> " & Chr(34) & root & "\start-app.err.log" & Chr(34) & Chr(34)

shell.Run command, 0, False

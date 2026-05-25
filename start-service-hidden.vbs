Set shell = CreateObject("WScript.Shell")
Set env = shell.Environment("PROCESS")

serviceDir = env("SERVICE_DIR")
serviceOut = env("SERVICE_OUT")
serviceErr = env("SERVICE_ERR")
serviceCommand = env("SERVICE_CMD")

shell.CurrentDirectory = serviceDir
command = "cmd.exe /c (" & serviceCommand & ") > " & Chr(34) & serviceOut & Chr(34) & " 2> " & Chr(34) & serviceErr & Chr(34)

shell.Run command, 0, False

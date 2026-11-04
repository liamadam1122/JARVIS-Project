' Double-click this file to open JARVIS.
Option Explicit
Dim sh, fso, here, appDir, nodeExe, serverJs, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
appDir = here & "\app"
If Not fso.FolderExists(appDir) Then
  appDir = here
End If
nodeExe = appDir & "\runtime\node.exe"
serverJs = appDir & "\server.mjs"
If Not fso.FileExists(nodeExe) Then
  MsgBox "JARVIS could not find its bundled Node runtime. Re-download the zip from the latest GitHub release.", 16, "JARVIS"
  WScript.Quit 1
End If
If Not fso.FileExists(serverJs) Then
  MsgBox "JARVIS files are incomplete. Re-download the zip from the latest GitHub release.", 16, "JARVIS"
  WScript.Quit 1
End If
If Not fso.FolderExists(appDir & "\node_modules") Then
  MsgBox "This download is missing its libraries. Re-download the zip from the latest GitHub release.", 16, "JARVIS"
  WScript.Quit 1
End If
sh.CurrentDirectory = appDir
sh.Run "cmd /c start """" ""http://127.0.0.1:4173""", 0, False
cmd = """" & nodeExe & """ """ & serverJs & """"
sh.Run cmd, 0, False

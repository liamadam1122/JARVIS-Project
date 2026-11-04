' Prefer JARVIS.cmd — it can unpack the zip automatically.
Option Explicit
Dim sh, fso, here, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = here & "\JARVIS.cmd"
If fso.FileExists(cmd) Then
  sh.Run """" & cmd & """", 1, False
Else
  MsgBox "JARVIS.cmd is missing. Re-download the zip and use Extract All first.", 16, "JARVIS"
End If

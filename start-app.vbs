Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
HostsPath = WshShell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\drivers\etc\hosts"

' 1. Ensure MRGR_ColorCenter is in Windows hosts file (requests Admin once if missing)
HasHost = False
If FSO.FileExists(HostsPath) Then
    Set HostsFile = FSO.OpenTextFile(HostsPath, 1, False)
    HostsContent = HostsFile.ReadAll
    HostsFile.Close
    If InStr(1, HostsContent, "MRGR_ColorCenter", vbTextCompare) > 0 Then
        HasHost = True
    End If
End If

If Not HasHost Then
    Set ShellApp = CreateObject("Shell.Application")
    ShellApp.ShellExecute "cmd.exe", "/c echo.>>""" & HostsPath & """ && echo 127.0.0.1 MRGR_ColorCenter>>""" & HostsPath & """ && ipconfig /flushdns", "", "runas", 0
    WScript.Sleep 1500
End If

' 2. Stop any prior php.exe built-in server and start on port 80
WshShell.Run "taskkill /F /IM php.exe", 0, True
WshShell.CurrentDirectory = ScriptDir
WshShell.Run "php -S 0.0.0.0:80", 0, False

' 3. Give PHP a moment to bind, then open http://MRGR_ColorCenter
WScript.Sleep 600
WshShell.Run "http://MRGR_ColorCenter"

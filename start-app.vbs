Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
HostsPath = WshShell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\drivers\etc\hosts"

Port = 80
HostName = "MRGR_ColorCenter"
AppUrl = "http://" & HostName & "/?login=1"

' 1. Ensure MRGR_ColorCenter is mapped in Windows hosts file (only prompts Admin once if missing)
HasHost = False
If FSO.FileExists(HostsPath) Then
    Set HostsFile = FSO.OpenTextFile(HostsPath, 1, False)
    HostsContent = HostsFile.ReadAll
    HostsFile.Close
    If InStr(1, HostsContent, HostName, vbTextCompare) > 0 Then
        HasHost = True
    End If
End If

If Not HasHost Then
    Set ShellApp = CreateObject("Shell.Application")
    ShellApp.ShellExecute "cmd.exe", "/c echo.>>""" & HostsPath & """ && echo 127.0.0.1 " & HostName & ">>""" & HostsPath & """ && ipconfig /flushdns", "", "runas", 0
    WScript.Sleep 2500
End If

' 2. Locate PHP executable
PhpExe = "php"
If FSO.FileExists("C:\php\php.exe") Then
    PhpExe = "C:\php\php.exe"
ElseIf FSO.FileExists("C:\xampp\php\php.exe") Then
    PhpExe = "C:\xampp\php\php.exe"
End If

' 3. Stop only a prior php.exe bound to port 80
WshShell.Run "powershell -NoProfile -Command ""$conns = Get-NetTCPConnection -LocalPort " & Port & " -State Listen -ErrorAction SilentlyContinue; foreach ($c in $conns) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'php') { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }""", 0, True

WshShell.CurrentDirectory = ScriptDir
WshShell.Run """" & PhpExe & """ -S 0.0.0.0:" & Port & " index.php", 0, False

' 4. Wait until port 80 accepts connections before opening browser (up to 7.5s)
WshShell.Run "powershell -NoProfile -Command ""for ($i=0; $i -lt 30; $i++) { try { $t = New-Object System.Net.Sockets.TcpClient('127.0.0.1', " & Port & "); $t.Close(); break } catch { Start-Sleep -Milliseconds 250 } }""", 0, True
WshShell.Run AppUrl

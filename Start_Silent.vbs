Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "node node_modules\electron\cli.js .", 0, False

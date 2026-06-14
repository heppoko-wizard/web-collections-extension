user: antigravity cliをインストールして

ai: antigravity cliをインストールするため、PowerShell用のインストールスクリプトを実行するコマンドを開始しました。

実行コマンドは以下です。

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```

コマンドの実行完了を待ちます。完了後に改めて報告します。

ai: antigravity cliのインストールが正常に完了しました。

Windowsの環境変数であるPATHに対して、インストール先である %LOCALAPPDATA%\agy\bin が正常に追加されました。
現在開いているターミナルセッションにはこの変更がまだ反映されていないため、agyコマンドを直接実行するにはターミナルの再起動が必要です。

インストールされた実行ファイルの動作確認を行うため、直接パスを指定してヘルプコマンドを実行しました。
実行結果は以下の通りです。

実行した確認コマンド：
```powershell
& "C:\Users\heppo\AppData\Local\agy\bin\agy.exe" --help
```

出力結果：
```
Usage of C:\Users\heppo\AppData\Local\agy\bin\agy.exe:
  --add-dir                       Add a directory to the workspace (repeatable) (default [])
  -c                              Short alias for --continue
  --continue                      Continue the most recent conversation
  --conversation                  Resume a previous conversation by ID
  --dangerously-skip-permissions  Auto-approve all tool permission requests without prompting
  -i                              Short alias for --prompt-interactive
  --log-file                      Override CLI log file path
  -p                              Short alias for --print
  --print                         Run a single prompt non-interactively and print the response
  --print-timeout                 Timeout for print mode wait (default 5m0s)
  --prompt                        Alias for --print
  --prompt-interactive            Run an initial prompt interactively and continue the session
  --sandbox                       Run in a sandbox with terminal restrictions enabled

Available subcommands:
  changelog       Show changelog and release notes
  help            Show help for subcommands
  install         Configure environment paths and shell settings
  plugin          Manage plugins (install, uninstall, list, enable, disable)
  plugins         Alias for plugin
  update          Update CLI
```

このように正常に動作していることが確認できました。
ターミナルを再起動することで、今後は agy というコマンド名のみで実行できるようになります。

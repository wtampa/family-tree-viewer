# Security

Family Tree listens on **127.0.0.1** only. It is a desktop app, not a website.

Do not change the bind address to `0.0.0.0` or `::`. Do not put a real family file in this repository or in a GitHub Release.

Routes such as file open, directory listing, media ingest, and share preview exist for the local window. They are safe only because they are not reachable from another machine.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/wtampa/family-tree-viewer/security/advisories/new) for anything that would leak a family file, bypass living-privacy redaction, or make the server reachable off localhost.

Please do not file a public issue that includes names, dates, or files from a real tree.

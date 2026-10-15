# Prüfstand

Stand: 15. Oktober 2026. Lokaler Entwicklungsbranch `codex/ubuntu-dashboard`.

| Anforderung | Geprüfte Evidenz |
| --- | --- |
| Dashboard ohne umbrelOS | Eigener HTML-Einstieg und Vite-Build; Backend importiert nur Node-Standardmodule. Oberfläche im Browser mit Ubuntu 24.04.4 unter WSL2 betrieben. |
| Vorhandenes Design übernehmen | Logo, Button-Komponente, globale Designvariablen/CSS, Schrift, App-Platzhalter und Hintergrundbilder aus dem vorhandenen UI-Paket. Ansichten sind für Ubuntu angepasst. |
| CPU, RAM, Speicher und Systeminfo | Reale Werte über HTTP auf Windows und Ubuntu geprüft; Linux-Kernel, RAM und Dateispeicher zusätzlich im Browser sichtbar. |
| Docker-Verwaltung | Echter temporärer Docker-28.5.1-Daemon auf Ubuntu/WSL mit eigenem Unix-Socket und Datenverzeichnis. Opt-in-Test erzeugt zwei isolierte Alpine-Container; Liste, Stop/Start/Restart und Sperre des nicht freigegebenen Containers bestanden; beide Testcontainer danach entfernt. |
| Dateiverwaltung | HTTP-Rundlauf mit Ordner, Upload, Download, Löschung; Überschreiben und nicht leere Ordner abgewiesen. Ordnererstellung und Navigation zusätzlich im Browser geprüft. Maximal 1 MB pro Datei. |
| Einstellungen | Hintergrundwahl im UI und lokale Speicherung im Code; Ubuntu-Systeminformationen und deaktivierte Stromsteuerung im Browser geprüft. |
| Systemsteuerung | Feste Allowlist für reboot/poweroff, Hostnamenbestätigung und standardmäßige Sperre durch HTTP-Tests belegt. Echte Strombefehle bewusst nur über injizierten Testadapter geprüft. |
| Absicherung | HTTP-Integrationstests für Anmeldung, Logout, Host/Origin, JSON-Validierung, Rate-Limit, Secure-Cookie, Container-Labels, Pfadtraversal, Symlinks, Dateigröße und Docker-Ausfall. Privater Dateibereich wird unter Linux auf Besitzer und Modus 700 geprüft. |
| Hosting | Produktionsbuild mit Typprüfung erfolgreich; gebautes HTML, CSS und JavaScript über das Ubuntu-Backend im Browser verwendet. systemd- und HTTPS-Proxy-Vorlagen sowie Installationsanleitung enthalten. |

## Wiederholbare Prüfungen

```sh
npm --prefix packages/ui ci --ignore-scripts
npm --prefix packages/ui run build:ubuntu
npm --prefix packages/ubuntu-server test
RUN_LIVE_DOCKER=true node packages/ubuntu-server/test/live-docker.mjs
```

Für einen abweichenden Testdaemon `DOCKER_HOST` (CLI) und `DASHBOARD_DOCKER_SOCKET` (Backend) konsistent konfigurieren. `DOCKER_CLI` erlaubt einen expliziten CLI-Pfad. Der Live-Test verändert ausschließlich die von ihm neu erzeugten Container. Die CI-Definition führt diese Prüfungen auf Ubuntu aus; ein erfolgreicher gehosteter CI-Lauf wird durch lokale Ergebnisse nicht behauptet.

Die API-Tests bestehen auf Windows/Node 24.15 sowie Ubuntu/Node 22.23.3. Der UI-Build und die separate Typprüfung bestehen. Die globale ursprüngliche UI-Typprüfung ist ohne installierte `umbreld`-Abhängigkeiten nicht grün; sie gehört nicht zum eigenständigen Ubuntu-Build.

## Abgrenzung zur Zielserver-Abnahme

Es wurde kein entferntes oder physisches Ubuntu-System des Benutzers installiert. Eine echte systemd-Installation, dessen Docker-Socket-Berechtigungen, Nginx/TLS, externe App-Adressen und ein wirklicher Neustart/Shutdown müssen auf dem vorgesehenen Zielserver geprüft werden. WSL und injizierte Strombefehle belegen diese Punkte nicht. Ebenso wurden keine echten Jellyfin-/AdGuard-Workloads installiert oder umkonfiguriert. Die Funktion ist die Verwaltung bereits vorhandener Docker-Anwendungen.

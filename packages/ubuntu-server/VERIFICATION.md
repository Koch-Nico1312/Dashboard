# Prüfstand

Stand: 16. Oktober 2026. Entwicklungsbranch `codex/ubuntu-desktop-final` im Repository `Koch-Nico1312/Dashboard`.

| Anforderung | Geprüfte Evidenz |
| --- | --- |
| Dashboard ohne umbrelOS | Eigener HTML-Einstieg und Vite-Build; Backend importiert nur Node-Standardmodule. Oberfläche im Browser mit Ubuntu 24.04.4 unter WSL2 betrieben. |
| Vorhandenes Design übernehmen | Originales Logo, Dock-Symbole, globale Designvariablen, Inter-Schrift und passender Hintergrund 18 aus dem UI-Paket; App-Symbole lokal aus der Umbrel-Galerie. Desktop und Einstellungsfenster mit den vom Benutzer gelieferten Bildern verglichen. |
| CPU, RAM, Speicher und Systeminfo | Reale Werte über HTTP auf Windows und Ubuntu geprüft; Linux-Kernel, RAM und Dateispeicher zusätzlich im Browser sichtbar. |
| Docker-Verwaltung | Echter temporärer Docker-28.5.1-Daemon auf Ubuntu/WSL mit eigenem Unix-Socket und Datenverzeichnis. Opt-in-Test erzeugt zwei isolierte Alpine-Container; Liste, Stop/Start/Restart, Freigabe ohne Label-Änderung und erneuter Entzug der Freigabe bestanden; beide Testcontainer danach entfernt. Dieser Live-Test fand am 15. Oktober statt, mit denselben Backend-Quelldateien vor Übernahme in den neuen Git-Worktree. |
| Dateiverwaltung | HTTP-Rundlauf mit Ordner, Upload, Download, Löschung; Überschreiben und nicht leere Ordner abgewiesen. Ordnererstellung und Navigation zusätzlich im Browser geprüft. Maximal 1 MB pro Datei. |
| Einstellungen | Profil, Hintergrund, Widgets, Verknüpfungen und Freigaben serverseitig gespeichert. Persistenz über erneutes Laden des Stores sowie parallele Änderungen automatisiert geprüft. Widgets-Schalter im Browser nach Seiten-Neuladen bestätigt. Einstellungsfenster auf Desktop und kleinem Bildschirm geprüft. |
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

Alle 13 API-/Zustandstests bestehen auf Windows/Node 24.15 sowie Ubuntu/Node 22.23.3. Nach Übernahme in den neuen Worktree am 16. Oktober wurden beide Plattformen erneut mit 13/13 erfolgreich geprüft. Der UI-Build und die separate Typprüfung bestehen. Die globale ursprüngliche UI-Typprüfung ist ohne installierte `umbreld`-Abhängigkeiten nicht grün; sie gehört nicht zum eigenständigen Ubuntu-Build.

## Abgrenzung zur Zielserver-Abnahme

Es wurde kein entferntes oder physisches Ubuntu-System des Benutzers installiert. Eine echte systemd-Installation, dessen Docker-Socket-Berechtigungen, Nginx/TLS, externe App-Adressen und ein wirklicher Neustart/Shutdown müssen auf dem vorgesehenen Zielserver geprüft werden. WSL und injizierte Strombefehle belegen diese Punkte nicht. Ebenso wurden keine echten Jellyfin-/AdGuard-Workloads installiert oder umkonfiguriert. Die Funktion ist die Verwaltung bereits vorhandener Docker-Anwendungen.

## Browser- und Designprüfung

Desktop mit 1280 × 799 CSS-Pixeln, Einstellungsfenster mit 1280 × 684 sowie mobile Ansicht mit 390 × 844 geprüft. Anmeldung, App-Suche, Verknüpfung anlegen, Container-Freigabe und simuliertes Stop/Start, Ordner anlegen sowie gespeicherte Profil-/Widget-Einstellungen wurden durch die sichtbare Oberfläche geprüft. Die lokale Vorschau ist mit „Vorschau · Beispiel-Apps“ markiert und simuliert die Container; echte Container-Aktionen sind separat durch den Live-Test belegt. Der zugehörige [Design-Prüfbericht](../../design-qa.md) enthält Vergleichsartefakte und die akzeptierten Unterschiede zur Vorlage.

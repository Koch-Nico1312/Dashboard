# Umbrel Dashboard auf Ubuntu Server

Diese unabhängige Anpassung betreibt eine eigene Webanwendung auf dem vorhandenen Ubuntu Server. Ubuntu, vorhandene Container, Netzwerk und Datenträger bleiben bestehen. Es wird kein umbrelOS installiert. Keine offiziell unterstützte Umbrel-Installation.

## Was enthalten ist

- Umbrel-Desktop mit App-Raster, Seitenwechsel, Suche, Dock und Widgets. Alle vorhandenen Docker-Container werden automatisch angezeigt und bekannte Anwendungen mit passenden Symbolen erkannt.
- App-Verwaltung: Name, Webadresse und Symbol bearbeiten; Steuerung direkt im Dashboard pro Container freigeben oder sperren, ohne Compose-Dateien zu ändern. Weitere Webanwendungen können als Verknüpfung hinzugefügt werden.
- CPU-Auslastung zwischen Messungen, RAM, verfügbarer Speicher auf dem Dateisystem des Dateibereichs, Kernel, Hostname und Laufzeit. Beim allerersten CPU-Abruf ist noch kein Messintervall vorhanden.
- Privater Dateibereich: Ordner erstellen, Dateien hochladen/herunterladen (jeweils maximal 1 MB), Dateien und leere Ordner löschen. Vorhandene Dateien werden nicht überschrieben. Bis 1000 Einträge pro Ordner werden angezeigt.
- Anmeldung mit einem zufälligen Server-Zugriffsschlüssel; Abmelden; acht Stunden gültige Sitzungen. Ein Backend-Neustart beendet alle Sitzungen.
- Einstellungsfenster mit Desktop-Vorschau, CPU/RAM/Speicher, Profil, Hintergrundwahl, Widgets und optionaler Systemsteuerung mit Hostnamenbestätigung. Name, Hintergrund, Verknüpfungen und Verwaltungsfreigaben werden serverseitig gespeichert und bleiben nach Neustarts erhalten.

Der Ubuntu-Einstieg verwendet das originale Logo, die Hintergründe, Schrift, Tailwind-Designvariablen und Button-Komponente direkt aus `packages/ui`. Die Ansichten und Datenanbindung sind auf die angebotenen Ubuntu-Funktionen angepasst. Der originale umbrelOS-Einstieg bleibt separat. Dessen App Store, Sharing, RAID-Assistenten, Backups, Terminal, Netzwerk- und OS-Updates sind keine Ubuntu-Funktionen und werden nicht als funktionsfähig dargestellt. Apps werden weiterhin über eigene Compose-Dateien installiert und aktualisiert.

## Architektur

```text
Browser → HTTPS-Reverse-Proxy → Node-Backend (127.0.0.1:8080)
                                   ├─ gebauter Ubuntu-Einstieg des Umbrel-Frontends
                                   ├─ /api/system → Betriebssystem und Dateisystem
                                   ├─ /api/containers → lokaler Docker-Socket
                                   ├─ /api/files → privater Service-Dateibereich
                                   └─ /api/power → optional zwei feste systemctl-Aufrufe
```

Das Backend benötigt ausschließlich Node-Standardmodule. Es importiert und startet kein `umbreld` und keine umbrelOS-Dienste. Der separate Frontend-Build enthält keine tRPC- oder `umbreld`-Anbindung.

## Installation auf Ubuntu

Voraussetzungen: Ubuntu Server mit laufender Docker Engine, Node **22.13 oder neuer aus der 22er-Reihe**, npm und Git. Die Installation von Docker oder Änderungen an bestehenden Workloads erfolgen nicht automatisch. Die folgenden Befehle werden auf dem Ubuntu-Zielserver ausgeführt. Ersetze den Beispielpfad zum Checkout durch deinen tatsächlichen Pfad.

### 1. Oberfläche bauen

Im Checkout dieses Branches:

```sh
cd /pfad/zum/umbrel
npm --prefix packages/ui ci --ignore-scripts
npm --prefix packages/ui run build:ubuntu
npm --prefix packages/ubuntu-server test
```

`--ignore-scripts` ist hier beabsichtigt: Der Ubuntu-Einstieg benötigt den Unix-Kopierschritt für generierte Tabler-Icons nicht. Für den normalen umbrelOS-Entwicklungsworkflow gelten weiterhin dessen Vorgaben.

### 2. Benutzer und Installationsverzeichnisse anlegen

Bei einer Erstinstallation:

```sh
sudo useradd --system --user-group --home-dir /var/lib/umbrel-ubuntu --shell /usr/sbin/nologin umbrel-dashboard
sudo install -d -o root -g root -m 755 /opt/umbrel-ubuntu/packages/ubuntu-server /opt/umbrel-ubuntu/packages/ui
sudo cp packages/ubuntu-server/server.mjs packages/ubuntu-server/app-catalog.mjs packages/ubuntu-server/desktop-state.mjs /opt/umbrel-ubuntu/packages/ubuntu-server/
sudo cp -a packages/ui/dist-ubuntu /opt/umbrel-ubuntu/packages/ui/
sudo install -d -o root -g umbrel-dashboard -m 750 /etc/umbrel-ubuntu
sudo install -d -o umbrel-dashboard -g umbrel-dashboard -m 700 /var/lib/umbrel-ubuntu /var/lib/umbrel-ubuntu/files
sudo install -o root -g umbrel-dashboard -m 640 packages/ubuntu-server/deploy/dashboard.env.example /etc/umbrel-ubuntu/dashboard.env
```

Zugriffsschlüssel direkt in eine geschützte Datei schreiben, ohne ihn in den Prozessargumenten abzulegen:

```sh
sudo sh -c 'umask 027; /usr/bin/node -e "process.stdout.write(require(\"node:crypto\").randomBytes(32).toString(\"hex\"))" > /etc/umbrel-ubuntu/access-key'
sudo chown root:umbrel-dashboard /etc/umbrel-ubuntu/access-key
sudo chmod 640 /etc/umbrel-ubuntu/access-key
sudo install -m 644 packages/ubuntu-server/deploy/umbrel-ubuntu.service /etc/systemd/system/umbrel-ubuntu.service
sudo systemctl daemon-reload
sudo systemctl enable --now umbrel-ubuntu
```

Prüfe vorher mit `command -v node`, dass der Servicepfad `/usr/bin/node` zur installierten Node-Version gehört. Bei abweichendem Installationsort `ExecStart` entsprechend ändern. Der Service benötigt die vorhandene Gruppe `docker` für seinen Socket-Zugriff. Ein angepasster Docker-Socket kann über `DASHBOARD_DOCKER_SOCKET` gewählt werden.

### 3. Zunächst über einen SSH-Tunnel öffnen

Auf deinem Arbeitsplatz:

```sh
ssh -L 8080:127.0.0.1:8080 dein-benutzer@dein-server
```

Dann `http://localhost:8080` öffnen. Zum Anzeigen des Zugriffsschlüssels auf dem Server:

```sh
sudo cat /etc/umbrel-ubuntu/access-key
```

Den Schlüssel in die Anmeldung einfügen. Er wird im Browser weder in localStorage noch in einer URL gespeichert. Die Sitzung liegt in einem HttpOnly-Cookie. `localhost` muss exakt zur konfigurierten Adresse passen; `127.0.0.1` ist ein anderer Host.

### 4. HTTPS-Zugriff im Netzwerk

`deploy/nginx.conf.example` zeigt einen Reverse-Proxy mit vorhandenen TLS-Zertifikaten. Ersetze Hostname und Zertifikatpfade durch deine Werte. Es wird keine Domain oder Zertifikatsbereitstellung vorausgesetzt oder automatisch vorgenommen.

In `/etc/umbrel-ubuntu/dashboard.env`:

```ini
DASHBOARD_ORIGIN=https://dein-server.example
```

Die Adresse muss genau der Browseradresse entsprechen: Protokoll, Host und gegebenenfalls Port, ohne abschließenden Schrägstrich. Nginx muss den ursprünglichen `Host` erhalten. Das Backend ignoriert `X-Forwarded-*`; API und Oberfläche bleiben auf derselben Origin. Bei HTTPS setzt das Backend das Cookie zusätzlich auf `Secure`.

```sh
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart umbrel-ubuntu
```

Der Backend-Port bleibt an Loopback gebunden. Für unverschlüsselten Zugriff außerhalb eines SSH-Tunnels ist die Beispielkonfiguration nicht vorgesehen.

## Jellyfin, AdGuard Home und andere Container

Alle Container werden automatisch angezeigt. Im Desktop öffnet das Zahnradsymbol (oder die App-Verwaltung im Dock) die Einstellungen einer App. Mit **Verwaltung erlauben** wird Start/Stop/Restart für genau diesen Container freigegeben. Das ändert keine Docker-Labels und erstellt keinen Container neu.

Anschließend kannst du Name, Webadresse und App-Symbol ändern. Für Anwendungen ohne veröffentlichte Ports trägst du ihre bestehende Webadresse ein. **Anwendung hinzufügen** legt eine Verknüpfung zu einer vorhandenen HTTP(S)-Anwendung an; dadurch wird keine Software installiert und kein fremder Prozess gestartet.

Die Einstellungen liegen in `/var/lib/umbrel-ubuntu/dashboard.json`, außerhalb des privaten Dateibereichs. Die Verwaltungsfreigabe ist an die Container-ID gebunden. Nach dem Neuerstellen eines Containers muss die Freigabe für dessen neue ID erneut gesetzt werden. Eine ausdrückliche Sperre im Dashboard hat Vorrang vor einem Freigabe-Label.

Alternativ ermöglicht das bisherige Compose-Label weiterhin die Steuerung:

```yaml
services:
  jellyfin:
    image: jellyfin/jellyfin
    labels:
      ubuntu-dashboard.manage: "true"
    ports:
      - "8096:8096"
    # Bestehende Volumes, Benutzer, Netzwerke und weitere Optionen beibehalten.
```

Das Beispiel zeigt den relevanten Ausschnitt, keine vollständige Jellyfin-Konfiguration. Labels lassen sich an existierenden Containern nicht nachträglich ändern; die jeweilige Compose-Anwendung muss nach Prüfung mit ihren bisherigen Einstellungen neu erstellt werden. Das Dashboard erledigt das nicht automatisch. Für die Freigabe direkt über die Oberfläche ist diese Neuerstellung nicht nötig. Dies gilt ebenso für AdGuard Home und weitere Dienste.

Port-Links öffnen die veröffentlichte Portnummer am Host der Browseradresse. Bei SSH-Tunnel, ausschließlich lokal gebundenen Ports, separaten App-Domains oder anderer TLS-Terminierung ist diese Adresse unter Umständen nicht erreichbar: Öffne die App dann über ihre bisherige Adresse. Es gibt keinen automatischen App-Reverse-Proxy.

## Sicherheitsgrenzen

Docker-Socket-Zugriff entspricht administrativen Rechten auf dem Docker-Host. Die Docker-Anbindung bietet ausschließlich Auflisten, Prüfen und drei feste Aktionen auf freigegebenen Containern an: keine Container-Erstellung, kein Exec, keine Shell und kein frei wählbarer Docker-Endpunkt. Ein kompromittierter Backend-Prozess mit Socket-Zugriff hätte trotzdem Host-Rechte. Stelle ihn nur vertrauenswürdigen Administratoren bereit.

Der Dateibereich ist ein eigenes Verzeichnis im Besitz des Service-Benutzers (Modus 700). **Nicht** auf `/`, Home-Verzeichnisse, freigegebene Ordner oder von anderen Prozessen/Containern beschreibbare Verzeichnisse umbiegen. Relative Pfade werden geprüft, Symlinks ausgeschlossen und Downloads mit `O_NOFOLLOW` geöffnet. Die Prüfungen ersetzen keine atomare Sandbox gegen einen Angreifer, der parallel Elternverzeichnisse austauschen kann. Auch Bind-Mounts in den privaten Dateibaum gehören nicht zum unterstützten Betrieb.

Schreibende API-Aufrufe verlangen den exakten Origin-Header und JSON. Host-Prüfung, SameSite-Cookies, CSP und zehn Anmeldeversuche pro Minute begrenzen Browserangriffe. Das globale Anmeldelimit ist für einen privaten Admin-Dienst ausgelegt. Ein vorgeschalteter Proxy kann zusätzliche Verbindungs-/Anfragelimits setzen. Schlüsselwechsel: Schlüsseldatei neu erzeugen und Backend neu starten. Bereits laufende Sitzungen werden dabei ungültig.

## Neustart und Herunterfahren optional aktivieren

Standardmäßig ist `DASHBOARD_POWER=false`; es gibt keine sudo-Berechtigung. Wer diese Funktion ausdrücklich benötigt, kann mit `sudo visudo -f /etc/sudoers.d/umbrel-ubuntu` genau diese Regel eintragen:

```sudoers
umbrel-dashboard ALL=(root) NOPASSWD: /usr/bin/systemctl reboot, /usr/bin/systemctl poweroff
```

Mit `sudo systemctl edit umbrel-ubuntu` ergänzen:

```ini
[Service]
NoNewPrivileges=false
```

Danach `DASHBOARD_POWER=true` in der Umgebungsdatei setzen und den Dienst neu starten. Das Aufheben von `NoNewPrivileges` ist für den gezielten sudo-Aufruf erforderlich. Andere Systembefehle sind nicht freigegeben. Im Dashboard muss zusätzlich der aktuelle Hostname eingegeben und die Aktion bestätigt werden. Ein angenommener Befehl beendet anschließend die Verbindung. Dieser Weg muss auf dem tatsächlichen Zielserver geprüft werden; automatisierte Tests rufen die echte Stromsteuerung nicht auf.

## Prüfen, Aktualisieren und Entfernen

```sh
sudo systemctl status umbrel-ubuntu
sudo journalctl -u umbrel-ubuntu -n 50 --no-pager
```

Abnahme auf dem Zielgerät: Anmeldung, echte Systemwerte, App-Links, freigegebener Testcontainer (Start/Stop/Restart), nicht freigegebener Container (nur Anzeige), Datei-Rundlauf, Abmelden und Server-Neustart. Andere Container bleiben dabei unverändert. Für echte Stromsteuerung ein Wartungsfenster verwenden.

Vor einem Update Service stoppen, `/opt/umbrel-ubuntu`, `/etc/umbrel-ubuntu` und `/var/lib/umbrel-ubuntu` sichern. Neuen Build und Backend kopieren, Service starten und Anmeldung prüfen. Kein automatischer Umbrel-Updater wird verwendet. Zum Deaktivieren:

```sh
sudo systemctl disable --now umbrel-ubuntu
```

Installationsdateien und privaten Dateibereich erst nach eigener Datensicherung entfernen. Vorhandene Docker-Container werden weder beim Stoppen noch beim Entfernen des Dashboards gelöscht.

## Entwicklerprüfung

```sh
npm --prefix packages/ubuntu-server test
npm --prefix packages/ui run build:ubuntu
```

Die API-Integrationstests starten einen echten HTTP-Server und prüfen Anmeldung, Origin/Host, Container-Freigaben, Docker-Ausfall, Dateizugriffe, Pfadausbruch, Symlinks, Größenlimits, Logout und optionale Stromsteuerung. Docker und Stromsteuerung sind dabei injizierte Adapter; die Tests allein belegen keine Zielserver-Installation. `test/live-docker.mjs` bietet zusätzlich einen expliziten Test gegen einen laufenden Docker-Daemon.

Die globale bestehende `typecheck`-Aufgabe benötigt außerdem die Abhängigkeiten des ursprünglichen `umbreld`. `typecheck:ubuntu` prüft nur den tatsächlich gebauten Ubuntu-Frontendgraphen. Die ursprüngliche [Repository-Lizenz](../../LICENSE.md) gilt weiterhin für übernommene Umbrel-Bestandteile.

## Lokale Design-Vorschau

Nach dem UI-Build startet `npm --prefix packages/ubuntu-server run preview` die lokale Vorschau auf `http://localhost:8090`. Zugriffsschlüssel: `preview-only-access-key-not-for-production`. Sie ist sichtbar mit **Vorschau · Beispiel-Apps** markiert. Docker-Container sind dort simuliert; der Prozess greift weder auf den Docker-Socket noch auf echte Systemsteuerung zu. Die angezeigten CPU/RAM/Speicherwerte stammen vom Vorschau-Rechner. Das normale `start`-Kommando verwendet weiterhin ausschließlich den echten Docker-Adapter. Die Beispielanwendungen werden nicht in Produktionsinstallationen übernommen.

# Ubuntu Server Dashboard

Umbrel-Desktop mit App-Raster, Widgets, Suche, Dock und Einstellungsfenster für einen bestehenden Ubuntu Server mit Docker. Es wird kein umbrelOS installiert.

- Vorhandene Docker-Container automatisch sehen und gezielt steuern.
- Namen, Webadressen und App-Symbole bearbeiten.
- Weitere Webanwendungen als Verknüpfungen hinzufügen.
- Echte CPU-, RAM- und Speicherwerte sowie private Dateiverwaltung.
- Name, Hintergrund, Widgets und Verwaltungsfreigaben dauerhaft speichern.

## Lokal ausprobieren

Node 22.13 oder neuer aus der 22er-Reihe und npm:

```sh
npm --prefix packages/ui ci --ignore-scripts
npm --prefix packages/ui run build:ubuntu
npm --prefix packages/ubuntu-server run preview
```

Dann `http://localhost:8090` öffnen. Vorschau-Schlüssel: `preview-only-access-key-not-for-production`.

Die Vorschau zeigt gekennzeichnete Beispiel-Apps und verwendet keinen echten Docker-Socket. Die normale Serverinstallation verwaltet die tatsächlich vorhandenen Container.

## Auf Ubuntu installieren

Die [Installations- und Sicherheitsanleitung](packages/ubuntu-server/README.md) enthält die Einrichtung als Dienst, HTTPS, Docker-Freigaben und optionale Systemsteuerung. [Prüfstand und Grenzen](packages/ubuntu-server/VERIFICATION.md) dokumentieren die durchgeführten Tests.

Unabhängige Anpassung der Umbrel-Oberfläche. Die [ursprüngliche Lizenz](LICENSE.md) für übernommene Umbrel-Bestandteile bleibt erhalten.

# Mitwirken

Beiträge sind willkommen! Bitte beachte die folgenden Richtlinien.

## Fehler melden

Nutze die [Bug-Report-Vorlage](.github/ISSUE_TEMPLATE/bug_report.md) und gib an:
- ioBroker- und Adapter-Version
- Node.js-Version (`node --version`)
- Gerätetyp (wddw2, RAC, K30, ...)
- Log-Ausgabe (Log-Level auf `debug` setzen)

## Pull Requests

1. Repository forken
2. Feature-Branch erstellen: `git checkout -b feature/mein-feature`
3. Änderungen in `src/` vornehmen
4. Bauen: `npm run build`
5. Auf einer echten ioBroker-Instanz testen
6. Commit und Push
7. Pull Request öffnen

## Unterstützung neuer Gerätetypen

Neue Geräte-Endpunkte können im Array `roots` in `src/lib/api.ts` ergänzt werden. Der Adapter erkennt alle Unterressourcen automatisch rekursiv.

Referenz für bekannte Endpunkte: [homecom_alt/const.py](https://github.com/serbanb11/homecom_alt/blob/main/homecom_alt/const.py)

## Bekannte Einschränkungen

- Direkter Login mit Benutzername/Passwort nicht möglich (Bosch CAPTCHA)
- Die API ist undokumentiert und kann sich ohne Vorankündigung ändern
- Pro Bosch-Account ist nur ein aktiver Refresh Token möglich

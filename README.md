![Logo](admin/bosch-homecom.png)

# ioBroker.bosch-homecom

[![NPM version](https://img.shields.io/npm/v/iobroker.bosch-homecom.svg)](https://www.npmjs.com/package/iobroker.bosch-homecom)
[![Downloads](https://img.shields.io/npm/dm/iobroker.bosch-homecom.svg)](https://www.npmjs.com/package/iobroker.bosch-homecom)
[![Build Status](https://github.com/GrayTheZebra/ioBroker.bosch-homecom/actions/workflows/build.yml/badge.svg)](https://github.com/GrayTheZebra/ioBroker.bosch-homecom/actions)
![GitHub license](https://img.shields.io/github/license/GrayTheZebra/ioBroker.bosch-homecom)

**ioBroker-Adapter für Bosch HomeCom Easy Geräte.**

Verbinde deine Bosch-, Buderus- oder Junkers-Geräte über die Bosch-Cloud-API mit ioBroker. Alle Datenpunkte werden automatisch erkannt und als ioBroker-Objekte angelegt.

> ⚠️ Dieser Adapter ist nicht mit Bosch verbunden. Er nutzt dieselbe undokumentierte API wie die offizielle HomeCom Easy App.

---

## Unterstützte Geräte

| Gerätetyp | Beispiele |
|---|---|
| **wddw2** | Tronic 6000T, Tronic 8000T (Durchlauferhitzer) |
| **RAC** | Climate Class 5000i, 6000i (Split-Klimaanlagen) |
| **K30 / K40** | Compress 7000i, Buderus Logatherm WLW 186i (Wärmepumpen) |
| **ICOM** | IVT Aero Series |
| **RRC2** | CT200, CT100 Thermostate |
| **Commodule** | Wallbox 7000i (Wallboxen) |

> ❌ Midea-basierte Klimageräte und Luftreiniger werden **nicht unterstützt**.

**Voraussetzung:** Das Gerät muss vor der Nutzung des Adapters in der offiziellen **Bosch HomeCom Easy** Smartphone-App eingerichtet und funktionstüchtig sein.

---

## Installation

### Über ioBroker Admin (empfohlen)

1. ioBroker Admin → Reiter **Adapter** öffnen
2. Auf das **GitHub-Symbol** klicken (von URL installieren)
3. URL eingeben: `https://github.com/GrayTheZebra/ioBroker.bosch-homecom`
4. **Installieren** klicken

### Manuelle Installation

```bash
cd /opt/iobroker/node_modules
git clone https://github.com/GrayTheZebra/ioBroker.bosch-homecom ioBroker.bosch-homecom
ln -s ioBroker.bosch-homecom iobroker.bosch-homecom
cd ioBroker.bosch-homecom
npm install
npm run build
cd /opt/iobroker
sudo -u iobroker node node_modules/iobroker.js-controller/iobroker.js add bosch-homecom
```

---

## Konfiguration & Anmeldung

Eine direkte Anmeldung mit Benutzername und Passwort ist nicht möglich, da Bosch auf der SingleKey-ID-Anmeldeseite einen CAPTCHA erzwingt. Die Authentifizierung erfordert einen einmaligen manuellen Autorisierungscode-Flow.

**Dieser Schritt ist nur einmalig notwendig.** Danach erneuert der Adapter den Token automatisch.

### Schritt für Schritt

1. Adapterkonfiguration in ioBroker Admin öffnen
2. Auf **„Login-URL öffnen"** klicken — die Bosch-Anmeldeseite öffnet sich in einem neuen Tab
3. URL in einem **privaten/Inkognito-Fenster** öffnen
4. Mit den **Bosch SingleKey ID** Zugangsdaten anmelden
5. Nach der Anmeldung erscheint ein Redirect-Fehler — das ist **erwartet und normal**
6. **Entwicklertools (F12)** öffnen → Reiter **Netzwerk**
7. Nach `pointt` filtern oder einen fehlgeschlagenen Request mit `code=` in der URL suchen
8. Den Wert des `code`-Parameters kopieren — er **endet auf `-1`**
9. Code in das Feld **„Authorization Code"** in der Adapterkonfiguration einfügen
10. Auf **„Verbinden"** klicken

Der Adapter tauscht den Code gegen Tokens und speichert diese lokal. Die Anmeldung ist abgeschlossen.

> ⏱️ Der Code verfällt innerhalb von Sekunden — die Adapterkonfiguration und das Eingabefeld sollten **vor** dem Browser-Login bereits geöffnet sein.

---

## Objektstruktur

Nach erfolgreicher Anmeldung werden alle Gerätedatenpunkte automatisch erkannt und angelegt:

```
bosch-homecom.0
├── info
│   └── connection                         ← Cloud-Verbindungsstatus (boolean)
└── <geräteId>                             ← Deine Gateway-/Geräte-ID
    ├── info
    │   ├── gatewayId                      ← Geräte-ID
    │   ├── deviceType                     ← Gerätetyp (wddw2, RAC, ...)
    │   ├── firmwareVersion                ← Aktuelle Firmware
    │   └── status                         ← Online-Status
    └── resources
        └── <api.pfad.struktur>            ← Alle erkannten Datenpunkte
```

### Beispiel (wddw2 Durchlauferhitzer)

```
resources
├── dhwCircuits.dhw1.operationMode         ← S/L: manual/handWash/shower/bath/dishWash
├── dhwCircuits.dhw1.inletTemperature      ← L:   Einlauftemperatur (°C)
├── dhwCircuits.dhw1.outletTemperature     ← L:   Auslauftemperatur (°C)
├── dhwCircuits.dhw1.temperatureLevels.*   ← Temperatursollwerte je Betriebsmodus
├── dhwCircuits.waterTotalConsumption      ← L:   Gesamtwasserverbrauch (l)
└── gateway.versionFirmware                ← L:   Firmware-Version
```

**L** = lesbar, **S/L** = schreib- und lesbar

---

## Einstellungen

| Einstellung | Standard | Beschreibung |
|---|---|---|
| **Abfrageintervall** | 300 s | Wie oft Gerätedaten aus der Bosch-Cloud abgerufen werden. Minimum: 60 s |

---

## Token-Verwaltung

- Tokens werden in `tokens.json` im Adapterverzeichnis gespeichert
- Der Access Token wird automatisch erneuert wenn er abläuft
- Alle 12 Stunden erfolgt eine vorausschauende Erneuerung
- Falls der Refresh Token abläuft (selten), muss der Login-Flow in der Adapterkonfiguration erneut durchgeführt werden

---

## Fehlerbehebung

### „No tokens available"
Der Adapter wurde noch nicht authentifiziert. Die Adapterkonfiguration öffnen und den Login-Flow durchführen.

### „Token refresh failed: invalid_grant"
Der Refresh Token ist abgelaufen oder wurde ungültig gemacht (z.B. durch Anmeldung in einer anderen App). Den Login-Flow erneut durchführen.

### „Connection failed" / Keine Objekte angelegt
- Prüfen ob das Gerät in der HomeCom Easy App online ist
- ioBroker-Log auf Details prüfen (Log-Level `debug` empfohlen)
- Sicherstellen dass die Adapterinstanz läuft (grüner Indikator im Admin)

### Autorisierungscode verfällt zu schnell
Der Code ist nur wenige Sekunden gültig. Die Adapterkonfiguration und das Eingabefeld sollten **bereits geöffnet und bereit** sein, bevor der Login im Browser gestartet wird.

---

## Entwicklung

```bash
# Repository klonen
git clone https://github.com/GrayTheZebra/ioBroker.bosch-homecom
cd ioBroker.bosch-homecom

# Abhängigkeiten installieren
npm install

# Einmalig bauen
npm run build

# Watch-Modus (automatisches Neu-Kompilieren bei Änderungen)
npm run watch
```

### Projektstruktur

```
src/
├── main.ts              # Adapter-Einstiegspunkt, Lifecycle, Polling
└── lib/
    ├── auth.ts          # OAuth2 + PKCE Token-Verwaltung
    ├── api.ts           # REST-Client für pointt-api
    ├── deviceManager.ts # ioBroker Objekt-/State-Verwaltung
    └── types.ts         # TypeScript-Interfaces
admin/
├── index.html           # Eigene Admin-UI (Login-Flow + Einstellungen)
└── i18n/                # Übersetzungen
```

---

---

## Entstehung

Dieser Adapter wurde mit Unterstützung von [Claude](https://claude.ai) (KI-Assistent von Anthropic) entwickelt. Die gesamte Entwicklung — von der Analyse der Bosch-API über die Implementierung des OAuth2-Flows bis hin zur ioBroker-Integration — entstand in einem iterativen Dialog zwischen Entwickler und KI.

Der Quellcode der [homecom_alt](https://github.com/serbanb11/homecom_alt)-Bibliothek von serbanb11 lieferte die entscheidenden Erkenntnisse über den Authentifizierungsablauf und die API-Endpunkte.


## Danksagungen

- Authentifizierungs-Flow basiert auf [homecom_alt](https://github.com/serbanb11/homecom_alt) von serbanb11
- Home Assistant Integration: [bosch-homecom-hass](https://github.com/serbanb11/bosch-homecom-hass)

---

## Lizenz

MIT © 2026 GrayTheZebra

---

## Changelog

### 0.1.0 (2026-05-09)
- Erstveröffentlichung
- Automatische Ressourcenerkennung für alle Gerätetypen
- OAuth2 + PKCE Authentifizierung über Admin-UI
- Unterstützung für schreibbare Datenpunkte
- Automatische Token-Erneuerung

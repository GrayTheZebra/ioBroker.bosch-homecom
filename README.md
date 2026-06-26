# ioBroker.bosch-homecom

[![NPM version](https://img.shields.io/npm/v/iobroker.bosch-homecom.svg)](https://www.npmjs.com/package/iobroker.bosch-homecom)
[![Downloads](https://img.shields.io/npm/dm/iobroker.bosch-homecom.svg)](https://www.npmjs.com/package/iobroker.bosch-homecom)
[![Test and Release](https://github.com/GrayTheZebra/ioBroker.bosch-homecom/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/GrayTheZebra/ioBroker.bosch-homecom/actions/workflows/test-and-release.yml)
![GitHub license](https://img.shields.io/github/license/GrayTheZebra/ioBroker.bosch-homecom)

ioBroker adapter for Bosch HomeCom Easy compatible devices.

This adapter connects Bosch, Buderus and Junkers devices to ioBroker by using the Bosch cloud API. Available resources are detected automatically and created as ioBroker objects and states.

> [!WARNING]
> This adapter is an early test version. It is not listed in the official ioBroker repository yet. Please use it only on test systems or with a recent backup of your ioBroker installation.

> [!WARNING]
> This adapter is not affiliated with Bosch, Buderus or Junkers. It uses the same undocumented API that is used by the official Bosch HomeCom Easy app.

---

## Supported devices

| Device type   | Examples                                                        |
| ------------- | --------------------------------------------------------------- |
| **wddw2**     | Tronic 6000T, Tronic 8000T water heaters                        |
| **RAC**       | Climate Class 5000i, Climate Class 6000i split air conditioners |
| **K30 / K40** | Compress 7000i, Buderus Logatherm WLW 186i heat pumps           |
| **ICOM**      | IVT Aero Series                                                 |
| **RRC2**      | CT200, CT100 thermostats                                        |
| **Commodule** | Wallbox 7000i wallboxes                                         |

> [!NOTE]
> Midea-based air conditioners and air purifiers are not supported.

The device must be set up and working in the official **Bosch HomeCom Easy** smartphone app before it can be used with this adapter.

---

## Installation

The adapter should be installed through the official ioBroker Admin interface once it is available in the ioBroker adapter repository.

> [!IMPORTANT]
> This adapter is currently intended for testing. Do not install it on a productive ioBroker system unless you know how to recover your installation.

After installation:

1. Create an adapter instance
2. Open the adapter configuration
3. Complete the login flow
4. Start the adapter instance

Manual installation inside `/opt/iobroker/node_modules` is not recommended.

---

## Configuration and login

Direct login with username and password is not possible because the Bosch SingleKey ID login page requires a CAPTCHA. Authentication therefore uses a one-time manual authorization code flow.

This step is only required once. After the initial login, the adapter refreshes the token automatically.

### Step-by-step login

1. Open the adapter configuration in ioBroker Admin
2. Click **Open login URL** — the Bosch login page opens in a new browser tab
3. Open the URL in a **private/incognito browser window**
4. Log in with your **Bosch SingleKey ID** credentials
5. After login, a redirect error may be shown — this is expected
6. Open the browser developer tools with **F12** and switch to the **Network** tab
7. Filter for `pointt` or search for a failed request that contains `code=` in the URL
8. Copy the value of the `code` parameter — it usually ends with `-1`
9. Paste the code into the **Authorization Code** field in the adapter configuration
10. Click **Connect**

The adapter exchanges the authorization code for tokens and stores them locally. The login is then complete.

> [!IMPORTANT]
> The authorization code expires within a few seconds. The adapter configuration and the input field should already be open before starting the browser login.

---

## Object structure

After a successful login, all detected device resources are created automatically:

```text
bosch-homecom.0
├── info
│   └── connection                         ← cloud connection status (boolean)
└── <deviceId>                             ← gateway or device ID
    ├── info
    │   ├── gatewayId                      ← device ID
    │   ├── deviceType                     ← device type (wddw2, RAC, ...)
    │   ├── firmwareVersion                ← current firmware version
    │   └── status                         ← online status
    └── resources
        └── <api.path.structure>           ← detected resources
```

### Example for a wddw2 water heater

```text
resources
├── dhwCircuits.dhw1.operationMode         ← R/W: manual/handWash/shower/bath/dishWash
├── dhwCircuits.dhw1.inletTemperature      ← R:   inlet temperature (°C)
├── dhwCircuits.dhw1.outletTemperature     ← R:   outlet temperature (°C)
├── dhwCircuits.dhw1.temperatureLevels.*   ← target temperatures per operation mode
├── dhwCircuits.waterTotalConsumption      ← R:   total water consumption (l)
└── gateway.versionFirmware                ← R:   firmware version
```

**R** = readable, **R/W** = readable and writable

---

## Settings

| Setting              | Default | Description                                                              |
| -------------------- | ------: | ------------------------------------------------------------------------ |
| **Polling interval** |   300 s | Interval for polling device data from the Bosch cloud API. Minimum: 60 s |

---

## Token handling

* Tokens are stored in `tokens.json` in the adapter directory
* The access token is refreshed automatically when it expires
* A proactive refresh is performed every 12 hours
* If the refresh token expires or becomes invalid, the login flow must be repeated in the adapter configuration

---

## Troubleshooting

### `No tokens available`

The adapter has not been authenticated yet. Open the adapter configuration and complete the login flow.

### `Token refresh failed: invalid_grant`

The refresh token has expired or has been invalidated, for example by another login. Repeat the login flow in the adapter configuration.

### `Connection failed` / no objects created

* Check whether the device is online in the HomeCom Easy app
* Check the ioBroker log for details
* Use log level `debug` for more detailed output
* Make sure that the adapter instance is running

### Authorization code expires too quickly

The authorization code is only valid for a few seconds. Open the adapter configuration and prepare the authorization code input field before starting the browser login.

---

## Development

Development should be done in a separate working directory outside of `/opt/iobroker`.

This repository contains a TypeScript-based ioBroker adapter. The source files are located in `src/`, the admin UI is located in `admin/`, and the compiled adapter output is generated into `build/`.

Development commands are intentionally not documented as end-user installation instructions. Contributors should use the standard ioBroker adapter development workflow for TypeScript adapters.

### Project structure

```text
src/
├── main.ts              # adapter entry point, lifecycle, polling
└── lib/
    ├── auth.ts          # OAuth2 and PKCE token handling
    ├── api.ts           # REST client for the pointt API
    ├── deviceManager.ts # ioBroker object and state handling
    └── types.ts         # TypeScript interfaces
admin/
├── index.html           # custom admin UI for login flow and settings
└── i18n/                # translations
```

---

## Background

This adapter was developed with support from [Claude](https://claude.ai), an AI assistant by Anthropic. The development process, including analysis of the Bosch API, implementation of the OAuth2 flow and ioBroker integration, was done iteratively by the developer with AI assistance.

The source code of the [homecom_alt](https://github.com/serbanb11/homecom_alt) library by serbanb11 provided the key information about the authentication flow and API endpoints.

---

## Acknowledgements

* Authentication flow based on [homecom_alt](https://github.com/serbanb11/homecom_alt) by serbanb11
* Home Assistant integration: [bosch-homecom-hass](https://github.com/serbanb11/bosch-homecom-hass)

---

## Changelog

### 0.1.0 (2026-05-09)

* Initial release
* Automatic resource detection for all detected device types
* OAuth2 and PKCE authentication through the admin UI
* Support for writable resources
* Automatic token refresh

---

## License

MIT License

Copyright (c) 2026 GrayTheZebra

# API Endpoints

The server exposes RESTful endpoints for interaction. All responses are JSON unless noted otherwise.

---

## `/api/deviceStatus`

### GET

- Retrieves the current status of the device.

#### Response

```json
{
  "left": {
    "currentTemperatureLevel": -43,
    "currentTemperatureF": 71,
    "targetTemperatureF": 64,
    "secondsRemaining": 0,
    "isOn": false,
    "isAlarmVibrating": false
  },
  "right": {
    "currentTemperatureLevel": -47,
    "currentTemperatureF": 70,
    "targetTemperatureF": 64,
    "secondsRemaining": 0,
    "isOn": false,
    "isAlarmVibrating": false
  },
  "coverVersion": "Pod 3",
  "hubVersion": "Pod 3",
  "freeSleep": {
    "version": "1.0.0",
    "branch": "main"
  },
  "waterLevel": "true",
  "isPriming": false,
  "settings": {
    "v": 1,
    "gainLeft": 400,
    "gainRight": 400,
    "ledBrightness": 0
  },
  "wifiStrength": 52
}
```

### POST

- Updates the device; send only the fields you want to change.

#### Request Body

```json
{
  "left": {
    "targetTemperatureF": 88,
    "isOn": true
  },
  "right": {
    "targetTemperatureF": 90,
    "isOn": false
  },
  "isPriming": true
}
```

---

## `/api/settings`

### GET

- Retrieves the current settings of the system.

#### Response

```json
{
  "id": "d07caf20-4f6a-4a9b-be8e-012989b0a65f",
  "timeZone": "America/Los_Angeles",
  "temperatureFormat": "fahrenheit",
  "rebootDaily": true,
  "left": {
    "name": "Left",
    "awayMode": false
  },
  "right": {
    "name": "Right",
    "awayMode": true
  },
  "primePodDaily": {
    "enabled": true,
    "time": "14:00"
  }
}
```

### POST

- Updates system settings; send only the fields you want to change.

#### Request Body

```json
{
  "timeZone": "America/Los_Angeles",
  "temperatureFormat": "fahrenheit",
  "rebootDaily": true,
  "left": {
    "name": "Left",
    "awayMode": false
  },
  "right": {
    "name": "Right",
    "awayMode": true
  },
  "primePodDaily": {
    "enabled": true,
    "time": "14:00"
  }
}
```

---

## `/api/schedules`

### GET

- Retrieves the current schedules for the system.

#### Response

```json
{
  "left": {
    "monday": {
      "temperatures": {
        "07:00": 72,
        "22:00": 68
      },
      "power": {
        "on": "20:00",
        "off": "08:00",
        "onTemperature": 82,
        "enabled": true
      },
      "alarm": {
        "time": "08:00",
        "vibrationIntensity": 100,
        "vibrationPattern": "rise",
        "duration": 10,
        "enabled": true,
        "alarmTemperature": 78
      },
      "alarms": [
        {
          "time": "06:30",
          "vibrationIntensity": 100,
          "vibrationPattern": "rise",
          "duration": 10,
          "enabled": true,
          "alarmTemperature": 78
        },
        {
          "time": "07:15",
          "vibrationIntensity": 100,
          "vibrationPattern": "rise",
          "duration": 10,
          "enabled": true,
          "alarmTemperature": 78
        }
      ]
    }
  }
}
```

### POST

- Updates the schedules for the system.

#### Request Body

```json
{
  "left": {
    "monday": {
      "power": {
        "on": "19:00",
        "off": "07:00",
        "enabled": true
      }
    }
  }
}
```

#### Response

```json
{
  "left": {
    "monday": {
      "temperatures": {},
      "power": {
        "on": "19:00",
        "off": "07:00",
        "onTemperature": 82,
        "enabled": true
      },
      "alarm": {
        "time": "08:00",
        "vibrationIntensity": 100,
        "vibrationPattern": "rise",
        "duration": 10,
        "enabled": false,
        "alarmTemperature": 78
      },
      "alarms": []
    }
  }
}
```

`alarm` is retained as the legacy primary alarm field. Use `alarms` to store multiple alarms for the same side/day; when `alarms` is provided, Free Sleep schedules every enabled item in the array and mirrors the first item into `alarm` for older clients.

---

## `/api/execute`

### POST

- Executes a specific command on the device.

#### Request Body

```json
{
  "command": "SET_TEMP",
  "arg": "90"
}
```

#### Response

```json
{
  "success": true,
  "message": "Command 'SET_TEMP' executed successfully."
}
```

---

## `/api/metrics/sleep`

### GET

- Retrieves sleep records based on optional query parameters.
- Query parameters:
  - `side` (optional): Filter by the side of the bed (e.g., "left" or "right").
  - `startTime` (optional): Filter by the start time of sleep records, in ISO 8601 format.
  - `endTime` (optional): Filter by the end time of sleep records, in ISO 8601 format.

#### Response

```json
[
  {
    "id": 1,
    "side": "left",
    "entered_bed_at": "2025-02-15T22:00:00Z",
    "left_bed_at": "2025-02-16T06:00:00Z",
    "sleep_period_seconds": 28800,
    "times_exited_bed": 2
  },
  {
    "id": 2,
    "side": "right",
    "entered_bed_at": "2025-02-15T23:00:00Z",
    "left_bed_at": "2025-02-16T07:00:00Z",
    "sleep_period_seconds": 28800,
    "times_exited_bed": 1
  }
]
```

---

## `/api/metrics/vitals`

### GET

- Retrieves vital records based on optional query parameters.
- Query parameters:
  - `side` (optional): Filter by the side of the bed (e.g., "left" or "right").
  - `startTime` (optional): Filter by the start time of vital records, in ISO 8601 format.
  - `endTime` (optional): Filter by the end time of vital records, in ISO 8601 format.

#### Response

```json
[
  {
    "id": 1,
    "side": "left",
    "timestamp": "2025-02-15T22:00:00Z",
    "heart_rate": 72,
    "breathing_rate": 16,
    "hrv": 42
  },
  {
    "id": 2,
    "side": "right",
    "timestamp": "2025-02-15T23:00:00Z",
    "heart_rate": 74,
    "breathing_rate": 15,
    "hrv": 45
  }
]
```

---

## `/api/metrics/vitals/summary`

### GET

- Retrieves summary statistics for vitals, including heart rate, breathing rate, and HRV (heart rate variability) within an optional time range.
- Query parameters:
  - `side` (optional): Filter by the side of the bed (e.g., "left" or "right").
  - `startTime` (optional): Filter by the start time of records, in ISO 8601 format.
  - `endTime` (optional): Filter by the end time of records, in ISO 8601 format.

#### Response

```json
{
  "avgHeartRate": 72,
  "minHeartRate": 65,
  "maxHeartRate": 80,
  "avgHRV": 52,
  "avgBreathingRate": 17
}
```

---

## Partial Updates for POST Requests

The POST endpoints (`/api/deviceStatus`, `/api/settings`, `/api/schedules`) support partial updates. You can send only the fields you wish to modify, and the system merges your input with the existing data.

### Example for `/api/deviceStatus`

#### Request Body

```json
{
  "left": {
    "targetTemperatureF": 88
  }
}
```

---

## MQTT

MQTT is enabled by default in the Pod firmware and connects to `mqtt://homeassistant.local:1883`. Configure it live from the web app under Settings > MQTT; saved settings are persisted in LowDB and the MQTT client reconnects immediately when they change. Disabling MQTT from the toggle disconnects the broker client immediately. The default topic prefix is unique per Pod: `free-sleep/<pod-id>`, where `<pod-id>` is a persisted generated three-word ID like `LullabyPillowBed`. The built-in word list has more than 4 million possible combinations. `/persistent/free-sleep-data/mqtt.env` remains supported as first-run/bootstrap configuration before the UI settings DB exists. Optional variables are `MQTT_ENABLED`, `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_CLIENT_ID`, `MQTT_DEVICE_ID`, `MQTT_TOPIC_PREFIX`, `MQTT_HOME_ASSISTANT_DISCOVERY` (default `true`), `MQTT_HOME_ASSISTANT_DISCOVERY_PREFIX` (default `homeassistant`), `MQTT_POLL_INTERVAL_MS` (default `30000`), and `MQTT_CONFIG_FILE` (default `${DATA_FOLDER}/mqtt.env`).

When enabled, the server publishes retained state under the topic prefix:

MQTT also republishes device status when the Franken monitor observes firmware-side changes, such as physical bed controls, instead of waiting for the full MQTT refresh interval. The monitor checks device status every second. `MQTT_POLL_INTERVAL_MS` remains the full state refresh interval for settings, schedules, services, server status, presence, and latest metrics.

| REST/API surface | MQTT state topic | MQTT command/request topic |
| --- | --- | --- |
| `/api/deviceStatus` | `<prefix>/deviceStatus/state` and per-side granular topics | `<prefix>/deviceStatus/set`, `<prefix>/<left|right>/temperature/set`, `<prefix>/<left|right>/power/set` |
| `/api/settings` | `<prefix>/settings/state` | `<prefix>/settings/set`, `<prefix>/<left|right>/awayMode/set` |
| `/api/schedules` | `<prefix>/schedules/state`, `<prefix>/schedules/summary/state`, per-side next-schedule timestamp topics | `<prefix>/schedules/set` |
| `/api/services` | `<prefix>/services/state` | `<prefix>/services/set` |
| `/api/serverStatus` | `<prefix>/serverStatus/state` | `<prefix>/request/serverStatus` |
| `/api/metrics/presence` | `<prefix>/presence/state`, `<prefix>/<left|right>/presence/state` | `<prefix>/presence/set` |
| `/api/metrics/vitals` | `<prefix>/metrics/vitals/latest/state` and per-side biometric topics | `<prefix>/request/metrics/vitals` |
| `/api/metrics/vitals/summary` | request/response only | `<prefix>/request/metrics/vitals/summary` |
| `/api/metrics/movement` | `<prefix>/metrics/movement/latest/state`, `<prefix>/<left|right>/movement/state` | `<prefix>/request/metrics/movement` |
| `/api/metrics/sleep` | `<prefix>/metrics/sleep/latest/state`, `<prefix>/<left|right>/lastSleep/state` | `<prefix>/request/metrics/sleep` |

Request topics accept an optional JSON envelope: `{"requestId":"abc","params":{"side":"left","startTime":"2025-02-15T00:00:00Z"}}`. Responses are published to `<prefix>/responses/<resource>/<requestId>` when a `requestId` is supplied, otherwise `<prefix>/responses/<resource>`.

Home Assistant MQTT discovery publishes controls and sensors for each side, including power, target temperature, current temperature, away mode, presence, alarm vibration, heart rate, HRV, breathing rate, movement, next power on/off, next alarm, next temperature adjustment, LED brightness, priming, WiFi strength, and water level.

Schedules are intentionally exposed as summary sensors plus full JSON instead of one Home Assistant entity per editable field. Free Sleep's weekly schedule shape is nested (`side -> day -> power/alarm/temperature entries`), so field-by-field MQTT discovery would create a large and brittle set of controls. For Home Assistant-owned scheduling, keep Free Sleep schedules disabled or empty and use HA automations to publish the existing control topics (`<prefix>/<left|right>/power/set`, `<prefix>/<left|right>/temperature/set`, `<prefix>/alarm/set`) or write the complete schedule JSON to `<prefix>/schedules/set`.

Web edits to Free Sleep settings, schedules, and services write the LowDB files first. The MQTT client watches those files and republishes the latest retained state to Home Assistant immediately after the write, rather than waiting for the next full refresh interval. Presence updates, Wi-Fi strength samples, and manual sleep-record edits also notify MQTT immediately. Latest vitals and movement metrics are sampled on the full refresh interval because this server only reads those records; it does not own a write event for them.

---

## `/api/mqttSettings`

### GET

- Returns the persisted MQTT configuration used by the broker client.

### POST

- Updates persisted MQTT configuration and immediately reloads the MQTT client.
- When `enabled` is `true`, `url`, `deviceId`, `topicPrefix`, `pollIntervalMs`, and `discoveryPrefix` when Home Assistant discovery is enabled are required.
- Setting `enabled` to `false` stops the MQTT client and publishes the offline status before disconnecting when connected.

---

## `/api/services`

### GET

- Enables or disables certain services and retrieves their health information.

#### Response

```json
{
  "sentryLogging": {
    "enabled": true,
  },
  "biometrics": {
    "enabled": true,
    "jobs": {
      "installation": {
        "name": "Biometrics installation",
        "message": "",
        "status": "healthy",
        "description": "Whether or not biometrics was installed successfully",
        "timestamp": ""
      },
      "stream": {
        "name": "Biometrics stream",
        "message": "",
        "status": "healthy",
        "description": "Consumes the sensor data as a stream and calculates biometrics",
        "timestamp": "2025-11-01T17:14:50.003582+00:00"
      },
      "analyzeSleepLeft": {
        "name": "Analyze sleep - left",
        "message": "IntegrityError('UNIQUE constraint failed: movement.side, movement.timestamp')",
        "status": "failed",
        "description": "Analyzes sleep period",
        "timestamp": "2025-11-01T17:01:27.317609+00:00"
      },
      "analyzeSleepRight": {
        "name": "Analyze sleep - right",
        "message": "",
        "status": "healthy",
        "description": "Analyzes sleep period",
        "timestamp": "2025-10-26T08:04:10.404431+00:00"
      },
      "calibrateLeft": {
        "name": "Calibration job - Left",
        "message": "",
        "status": "healthy",
        "description": "Calculates presence thresholds for cap sensor data",
        "timestamp": "2025-10-30T21:01:18.225128+00:00"
      },
      "calibrateRight": {
        "name": "Calibration job - Right",
        "message": "",
        "status": "healthy",
        "description": "Calculates presence thresholds for cap sensor data",
        "timestamp": "2025-10-30T21:30:44.018862+00:00"
      }
    }
  }
}

```

--- 

## /api/metrics/presence
### GET

- Tracks whether someone is present on the left and/or right side.
Stored in-memory (resets on server restart). 
Timestamps are server-generated.

#### Response

```json
{
  "left": {
    "present": false,
    "lastUpdatedAt": "2025-12-18T00:12:34-08:00"
  },
  "right": {
    "present": true,
    "lastUpdatedAt": "2025-12-18T00:12:34-08:00"
  }
}
```

---

## `/api/serverStatus`

### GET

- Retrieves the status of the services that make up free sleep.

#### Response

```json
  {
  "alarmSchedule": {
    "name": "Alarm schedule",
    "status": "healthy",
    "description": "",
    "message": ""
  },
  "database": {
    "name": "Database",
    "status": "healthy",
    "description": "Connection to SQLite DB",
    "message": ""
  },
  "express": {
    "name": "Express",
    "status": "healthy",
    "description": "The back-end server",
    "message": ""
  },
  "franken": {
    "name": "Franken sock",
    "status": "started",
    "description": "Socket service for controlling the hardware",
    "message": ""
  },
  "jobs": {
    "name": "Job scheduler",
    "status": "healthy",
    "description": "Scheduling service for temperature changes, alarms, and maintenance",
    "message": ""
  },
  "logger": {
    "name": "Logger",
    "status": "healthy",
    "description": "Logging service",
    "message": ""
  },
  "powerSchedule": {
    "name": "Power schedule",
    "status": "healthy",
    "description": "Power on/off schedule",
    "message": ""
  },
  "primeSchedule": {
    "name": "Prime schedule",
    "status": "healthy",
    "description": "Daily prime job",
    "message": ""
  },
  "rebootSchedule": {
    "name": "Reboot schedule",
    "status": "healthy",
    "description": "Daily system reboots",
    "message": ""
  },
  "systemDate": {
    "name": "System date",
    "status": "healthy",
    "description": "Whether or not the system date is correct. Scheduling jobs depend on this.",
    "message": ""
  },
  "temperatureSchedule": {
    "name": "Temperature schedule",
    "status": "healthy",
    "description": "Temperature adjustment schedule",
    "message": ""
  },
  "biometricsInstallation": {
    "name": "Biometrics installation",
    "message": "",
    "status": "healthy",
    "description": "Whether or not biometrics was installed successfully",
    "timestamp": ""
  },
  "analyzeSleepLeft": {
    "name": "Analyze sleep - left",
    "message": "IntegrityError('UNIQUE constraint failed: movement.side, movement.timestamp')",
    "status": "failed",
    "description": "Analyzes sleep period",
    "timestamp": "2025-11-01T17:01:27.317609+00:00"
  },
  "analyzeSleepRight": {
    "name": "Analyze sleep - right",
    "message": "",
    "status": "healthy",
    "description": "Analyzes sleep period",
    "timestamp": "2025-10-26T08:04:10.404431+00:00"
  },
  "biometricsCalibrationLeft": {
    "name": "Calibration job - Left",
    "message": "",
    "status": "healthy",
    "description": "Calculates presence thresholds for cap sensor data",
    "timestamp": "2025-10-30T21:01:18.225128+00:00"
  },
  "biometricsCalibrationRight": {
    "name": "Calibration job - Right",
    "message": "",
    "status": "healthy",
    "description": "Calculates presence thresholds for cap sensor data",
    "timestamp": "2025-10-30T21:30:44.018862+00:00"
  },
  "biometricsStream": {
    "name": "Biometrics stream",
    "message": "",
    "status": "healthy",
    "description": "Consumes the sensor data as a stream and calculates biometrics",
    "timestamp": "2025-11-01T17:11:50.430377+00:00"
  }
}
```

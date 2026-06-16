#!/bin/bash

set -u

LOG_FILE="/persistent/free-sleep-data/logs/repair-biometrics-sources.log"
mkdir -p "$(dirname "$LOG_FILE")"
exec >> "$LOG_FILE" 2>&1

echo "-----------------------------------------------------------------------------------------------------"
echo "Repair biometrics sources $(date -u '+%Y-%m-%d %H:%M:%S') UTC"

unit_exists() {
  local unit="$1"
  systemctl status "$unit" >/dev/null 2>&1 || systemctl list-unit-files "$unit" --no-pager --no-legend 2>/dev/null | grep -q "$unit"
}

restart_if_exists() {
  local unit="$1"
  if unit_exists "$unit"; then
    echo "Restarting $unit..."
    systemctl restart "$unit" || systemctl status "$unit" --no-pager || true
  else
    echo "Skipping $unit; unit not found."
  fi
}

echo "Matching units before repair:"
systemctl list-units --all --type=service --no-pager | grep -Ei 'nats|jetstream|capybara|free-sleep-stream' || true

restart_if_exists "nats.service"
restart_if_exists "nats-server.service"
restart_if_exists "jetstream.service"
restart_if_exists "jetstream-uploader.service"
restart_if_exists "capybara.service"
restart_if_exists "free-sleep-stream.service"

echo "Matching units after repair:"
systemctl list-units --all --type=service --no-pager | grep -Ei 'nats|jetstream|capybara|free-sleep-stream' || true
echo "Repair complete."

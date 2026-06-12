#!/bin/bash

echo "Stopping free sleep..."
for svc in free-sleep free-sleep-stream; do
  if systemctl list-unit-files | grep -q "^${svc}.service"; then
    systemctl stop "$svc"
  fi
done

sleep 3
echo "Starting free sleep"
for svc in free-sleep free-sleep-stream; do
  if systemctl list-unit-files | grep -q "^${svc}.service"; then
    systemctl enable "$svc"
    systemctl start "$svc"
  fi
done

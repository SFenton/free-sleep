#!/bin/bash

PROFILE_FILE_PATH="/home/root/.profile"

# Ensure .profile exists
if [ ! -f "$PROFILE_FILE_PATH" ]; then
  echo "# ~/.profile created by free-sleep installer" > "$PROFILE_FILE_PATH"
fi

SHORTCUTS=(
  "alias fs-debug='sh /home/dac/free-sleep/scripts/debug.sh'"
  "alias fs-restart='sh /home/dac/free-sleep/scripts/restart.sh'"
  "alias fs-reset='sh /home/dac/free-sleep/scripts/reset.sh'"
  "alias fs-reset-db='sh /home/dac/free-sleep/scripts/reset_db.sh'"
  "alias fs-update='sh /home/dac/free-sleep/scripts/update.sh'"
  "alias fs-dev-server='systemctl stop free-sleep && su - dac -c \"cd /home/dac/free-sleep/server && /home/dac/.volta/bin/npm run dev\"'"
)

echo "Adding shortcuts to $PROFILE_FILE_PATH..."

for shortcut in "${SHORTCUTS[@]}"; do
  name=$(echo "$shortcut" | cut -d'=' -f1 | awk '{print $2}')

  if grep -q "$name" "$PROFILE_FILE_PATH" 2>/dev/null; then
    echo "  - Skipping existing shortcut: $name"
  else
    echo "$shortcut" >> "$PROFILE_FILE_PATH"
    echo "  - Added shortcut: $name"
  fi
done

echo ""

#!/bin/bash

print_yellow() {
  echo -e "\033[0;33m$1\033[0m"
}


print_yellow "WARNING: This will permanently delete all Free Sleep data located at /persistent/free-sleep-data/"
print_yellow "This includes schedules, biometrics, and settings."
print_yellow "After deleting, this will attempt to reinstall free-sleep"
read -p "Are you sure you want to continue? (y/N): " confirm


if [[ "$confirm" =~ ^[Yy]$ ]]; then
    echo "Stopping free sleep"
    systemctl stop free-sleep
    echo "Deleting Free Sleep data..."
    rm -rf /persistent/free-sleep-data/
    echo "Deleted /persistent/free-sleep-data/"
    echo "Reinstalling free-sleep"
    sh /home/dac/free-sleep/scripts/update.sh
else
    echo "Cancelled"
fi

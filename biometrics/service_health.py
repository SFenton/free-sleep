import sys
import platform
import os
from datetime import datetime, timezone

sys.path.append(os.getcwd())
if platform.system().lower() == 'linux':
    sys.path.append('/home/dac/free-sleep/biometrics/')

# This must run before the other local import in order to set up the logger
from get_logger import get_logger

logger = get_logger()

import urllib.request
import json


def is_biometrics_enabled() -> bool:
    try:
        services_db_file_path = '/persistent/free-sleep-data/lowdb/servicesDB.json'
        if os.path.isfile(services_db_file_path):
            print('Loading servicesDB.json...')
            with open(services_db_file_path) as file:
                services_db = json.load(file)
                return services_db["biometrics"]["enabled"]
        else:
            logger.error(f'File not found! {services_db_file_path}')
            return False
    except Exception as error:
        logger.error('Error checking if biometrics is enabled, returning false')
        logger.error(error)
        return False



def update_health(job_key: str, status: str, message: str = ''):
    try:
        logger.debug(f'Updating health status for {job_key} - {status} - {message}')

        data = json.dumps({
            "biometrics": {
                "jobs": {
                    job_key: {
                        "status": status,
                        "message": message,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                }
            },
        }).encode("utf-8")

        req = urllib.request.Request(
            "http://127.0.0.1:3000/api/services",
            headers={"Content-Type": "application/json"},
            method="POST",
            data=data,
        )

        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                logger.debug("Updated status successfully")
            else:
                print(f"Unexpected status: {response.status}")

    except Exception as error:
        logger.error('Failed updating calibration status')
        logger.error(error)

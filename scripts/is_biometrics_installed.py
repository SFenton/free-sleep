#!/usr/bin/env python3
import sys
import urllib.request
import json

URL = "http://127.0.0.1:3000/api/services"

try:
    with urllib.request.urlopen(URL, timeout=5) as response:
        data = json.load(response)
        status = data["biometrics"]["jobs"]["installation"]["status"]
except Exception as e:
    print(f"Error: {e}")
    sys.exit(2)

if status == 'healthy':
    print('Biometrics installation is installed!')
    sys.exit(1)
else:
    print('Biometrics installation is not installed!')
    sys.exit(0)


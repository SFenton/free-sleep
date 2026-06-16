#!/bin/bash

set -u

LOG_FILE="/persistent/free-sleep-data/logs/repair-biometrics-sources.log"
mkdir -p "$(dirname "$LOG_FILE")"
exec >> "$LOG_FILE" 2>&1

echo "-----------------------------------------------------------------------------------------------------"
echo "Repair biometrics sources $(date -u '+%Y-%m-%d %H:%M:%S') UTC"

run_cmd() {
  echo ""
  echo "$ $*"
  "$@" || true
}

run_shell() {
  echo ""
  echo "$ $*"
  sh -c "$*" || true
}

check_nats_socket() {
  echo ""
  echo "NATS socket check:"
  run_shell "getent ahosts localhost || true"
  python3 - <<'PY' || true
import socket

targets = [
    ("127.0.0.1", 4222, socket.AF_INET),
    ("::1", 4222, socket.AF_INET6),
    ("localhost", 4222, 0),
]

for host, port, family in targets:
    try:
        if family:
            infos = [(family, socket.SOCK_STREAM, 0, "", (host, port))]
        else:
            infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        for af, socktype, proto, _, sockaddr in infos:
            sock = socket.socket(af, socktype, proto)
            sock.settimeout(2)
            try:
                sock.connect(sockaddr)
                sock.settimeout(2)
                try:
                    banner = sock.recv(256)
                except socket.timeout:
                    banner = b""
                print(f"  {host}:{port} connect=ok banner={banner!r}")
            except OSError as exc:
                print(f"  {host}:{port} connect=failed error={exc}")
            finally:
                sock.close()
    except OSError as exc:
        print(f"  {host}:{port} resolution=failed error={exc}")
PY
}

prefer_ipv4_localhost() {
  echo ""
  echo "Ensuring localhost resolves to IPv4 for local NATS clients..."
  if [ ! -f /etc/hosts ]; then
    echo "/etc/hosts missing; skipping localhost normalization."
    return
  fi

  echo "Current /etc/hosts localhost entries:"
  grep -En '(^|[[:space:]])localhost([[:space:]]|$)|^[[:space:]]*::1' /etc/hosts || true

  cp -n /etc/hosts /etc/hosts.free-sleep-biometrics.bak 2>/dev/null || true
  local tmp_file
  tmp_file="$(mktemp)"
  awk '
    BEGIN { has_ipv4_localhost = 0 }
    $1 == "127.0.0.1" {
      has_localhost = 0
      for (i = 2; i <= NF; i++) {
        if ($i == "localhost") {
          has_localhost = 1
        }
      }
      if (!has_localhost) {
        print $0 " localhost"
      } else {
        print
      }
      has_ipv4_localhost = 1
      next
    }
    $1 == "::1" {
      line = "::1"
      kept = 0
      for (i = 2; i <= NF; i++) {
        if ($i != "localhost" && $i != "localhost.localdomain") {
          line = line " " $i
          kept = 1
        }
      }
      if (!kept) {
        line = "::1 ip6-localhost ip6-loopback"
      }
      print line
      next
    }
    { print }
    END {
      if (!has_ipv4_localhost) {
        print "127.0.0.1 localhost"
      }
    }
  ' /etc/hosts > "$tmp_file" && cat "$tmp_file" > /etc/hosts
  rm -f "$tmp_file"

  echo "Updated /etc/hosts localhost entries:"
  grep -En '(^|[[:space:]])localhost([[:space:]]|$)|^[[:space:]]*::1' /etc/hosts || true
}

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

prefer_ipv4_localhost

echo "Matching units before repair:"
systemctl list-units --all --type=service --no-pager | grep -Ei 'nats|jetstream|capybara|frank|free-sleep-stream' || true
run_shell "ps -ef | grep -Ei '[n]ats|[c]apybara|[j]etstream|[f]rank|free-sleep-stream' || true"
run_shell "ss -ltnp 2>/dev/null | grep -E '(:4222|:8222)' || true"
check_nats_socket

restart_if_exists "nats.service"
restart_if_exists "nats-server.service"
sleep 2
check_nats_socket
restart_if_exists "frank.service"
restart_if_exists "jetstream.service"
restart_if_exists "jetstream-uploader.service"
restart_if_exists "capybara.service"
restart_if_exists "free-sleep-stream.service"

echo "Matching units after repair:"
systemctl list-units --all --type=service --no-pager | grep -Ei 'nats|jetstream|capybara|frank|free-sleep-stream' || true
run_shell "ps -ef | grep -Ei '[n]ats|[c]apybara|[j]etstream|[f]rank|free-sleep-stream' || true"
run_shell "ss -ltnp 2>/dev/null | grep -E '(:4222|:8222)' || true"
check_nats_socket
run_cmd systemctl status nats-server.service --no-pager -l
run_cmd systemctl cat nats-server.service --no-pager
run_cmd systemctl status capybara.service --no-pager -l
run_cmd systemctl cat capybara.service --no-pager
run_cmd systemctl status frank.service --no-pager -l
run_cmd systemctl cat frank.service --no-pager
run_cmd journalctl -u nats-server.service -n 120 --no-pager --output=cat
run_cmd journalctl -u capybara.service -n 80 --no-pager --output=cat
run_cmd journalctl -u frank.service -n 80 --no-pager --output=cat
run_cmd journalctl -u jetstream-uploader.service -n 80 --no-pager --output=cat
run_shell "ls -lah /persistent | grep -E '(RAW|cbor|jetstream)' || true"
echo "Repair complete."

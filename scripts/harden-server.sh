#!/usr/bin/env bash
# Server hardening for the evakuators.am VPS (security audit 2026-11-12).
#
# ONE AREA AT A TIME, and every area checks first:
#
#   sudo bash scripts/harden-server.sh check       # read-only report, changes nothing
#   sudo bash scripts/harden-server.sh redis       # Redis: localhost only + password
#   sudo bash scripts/harden-server.sh postgres    # PostgreSQL: localhost only
#   sudo bash scripts/harden-server.sh firewall    # ufw: only 22, 80, 443 open
#   sudo bash scripts/harden-server.sh ssh         # SSH: keys only, no passwords
#
# Rules this script follows so that it cannot lock you out:
#   - every config file it edits is copied to <file>.bak-<date> first;
#   - a config is validated (sshd -t, redis/postgres restart checked) and the
#     backup is restored automatically when validation fails;
#   - `firewall` allows SSH BEFORE it turns the firewall on;
#   - `ssh` refuses to run unless the account you are logged in as has an
#     SSH key in authorized_keys, and it never closes your current session.
#     Keep this terminal open and test a NEW login before closing it.
#
# Run from the repo root on the server (it reads backend/.env for `redis`).
set -euo pipefail

STAMP=$(date +%Y%m%d-%H%M%S)
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
BACKEND_ENV="$REPO_ROOT/backend/.env"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
title() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

need_root() {
  if [ "$(id -u)" -ne 0 ]; then red "Run with sudo (or as root)."; exit 1; fi
}

backup() { cp -p "$1" "$1.bak-$STAMP"; echo "  backup: $1.bak-$STAMP"; }

redis_conf() {
  for f in /etc/redis/redis.conf /etc/redis.conf /etc/redis/6379.conf; do [ -f "$f" ] && { echo "$f"; return; }; done
}
redis_service() {
  for s in redis-server redis; do systemctl cat "$s.service" >/dev/null 2>&1 && { echo "$s"; return; }; done
}
pg_conf() { ls /etc/postgresql/*/main/postgresql.conf 2>/dev/null | head -n 1; }
pg_hba() { ls /etc/postgresql/*/main/pg_hba.conf 2>/dev/null | head -n 1; }

# ─── check ──────────────────────────────────────────────────────────────────
cmd_check() {
  title "Listening ports (anything on 0.0.0.0 / [::] is reachable from outside unless the firewall blocks it)"
  ss -tlnp | awk 'NR==1 || /LISTEN/'

  title "Firewall (ufw)"
  if command -v ufw >/dev/null; then ufw status verbose || true; else yellow "ufw is not installed (apt install ufw)"; fi

  title "Redis"
  local rc; rc=$(redis_conf || true)
  if [ -n "$rc" ]; then
    echo "  config: $rc"
    grep -E '^\s*(bind|protected-mode|requirepass|port)\b' "$rc" | sed 's/^\(\s*requirepass\s\+\).*/\1<set>/' | sed 's/^/  /' || true
    grep -qE '^\s*requirepass\s+\S' "$rc" && green "  password: set" || red "  password: NOT set"
  else
    yellow "  Redis config not found (not installed?)"
  fi

  title "PostgreSQL"
  local pc; pc=$(pg_conf || true)
  if [ -n "$pc" ]; then
    echo "  config: $pc"
    grep -E "^\s*listen_addresses" "$pc" | sed 's/^/  /' || echo "  listen_addresses not set (default: localhost)"
    echo "  remote rules in pg_hba.conf (should be none):"
    grep -vE '^\s*(#|$)' "$(pg_hba)" | grep -E '^\s*host' | grep -vE '127\.0\.0\.1/32|::1/128' | sed 's/^/    /' || echo "    none"
  else
    yellow "  PostgreSQL config not found under /etc/postgresql"
  fi

  title "SSH"
  sshd -T 2>/dev/null | grep -E '^(port|permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication) ' | sed 's/^/  /'
  local user="${SUDO_USER:-root}" home
  home=$(getent passwd "$user" | cut -d: -f6)
  if [ -s "$home/.ssh/authorized_keys" ]; then green "  $user has $(grep -cE '^(ssh-|ecdsa-|sk-)' "$home/.ssh/authorized_keys") SSH key(s)"; else red "  $user has NO SSH key in $home/.ssh/authorized_keys — do not run 'ssh' yet"; fi
}

# ─── redis ──────────────────────────────────────────────────────────────────
cmd_redis() {
  need_root
  local rc svc pass
  rc=$(redis_conf || true); [ -n "$rc" ] || { red "Redis config not found."; exit 1; }
  svc=$(redis_service || true); [ -n "$svc" ] || { red "Redis service not found."; exit 1; }
  [ -f "$BACKEND_ENV" ] || { red "$BACKEND_ENV not found — run from the repo root."; exit 1; }

  if grep -qE '^\s*requirepass\s+\S' "$rc"; then
    yellow "Redis already has a password; keeping it. Checking bind/protected-mode only."
    pass=$(grep -E '^\s*requirepass\s+' "$rc" | tail -n 1 | awk '{print $2}')
  else
    pass=$(openssl rand -hex 24)
  fi

  backup "$rc"; backup "$BACKEND_ENV"
  sed -i -E 's/^\s*bind\s+.*/bind 127.0.0.1/' "$rc"
  grep -qE '^\s*bind\s' "$rc" || echo 'bind 127.0.0.1' >> "$rc"
  sed -i -E 's/^\s*protected-mode\s+.*/protected-mode yes/' "$rc"
  grep -qE '^\s*protected-mode\s' "$rc" || echo 'protected-mode yes' >> "$rc"
  if ! grep -qE '^\s*requirepass\s+\S' "$rc"; then echo "requirepass $pass" >> "$rc"; fi

  if ! systemctl restart "$svc" || ! redis-cli -a "$pass" --no-auth-warning ping | grep -q PONG; then
    red "Redis did not come back — restoring the old config."
    cp -p "$rc.bak-$STAMP" "$rc"; systemctl restart "$svc" || true
    exit 1
  fi

  # The app must know the password: REDIS_URL="redis://:<pass>@127.0.0.1:6379"
  if grep -qE '^REDIS_URL=' "$BACKEND_ENV"; then
    sed -i -E "s#^REDIS_URL=.*#REDIS_URL=\"redis://:$pass@127.0.0.1:6379\"#" "$BACKEND_ENV"
  else
    echo "REDIS_URL=\"redis://:$pass@127.0.0.1:6379\"" >> "$BACKEND_ENV"
  fi
  green "Redis: localhost only, password set, backend/.env REDIS_URL updated."
  yellow "Now restart the app so it uses the password:  pm2 restart ecosystem.config.js --update-env"
}

# ─── postgres ───────────────────────────────────────────────────────────────
cmd_postgres() {
  need_root
  local pc hba
  pc=$(pg_conf || true); hba=$(pg_hba || true)
  [ -n "$pc" ] && [ -n "$hba" ] || { red "PostgreSQL config not found under /etc/postgresql."; exit 1; }
  if grep -qE "^\s*listen_addresses\s*=\s*'localhost'" "$pc" && ! grep -vE '^\s*(#|$)' "$hba" | grep -E '^\s*host' | grep -qvE '127\.0\.0\.1/32|::1/128'; then
    green "PostgreSQL already listens on localhost only with no remote rules. Nothing to do."; return
  fi
  backup "$pc"; backup "$hba"
  if grep -qE '^\s*listen_addresses' "$pc"; then
    sed -i -E "s/^\s*listen_addresses\s*=.*/listen_addresses = 'localhost'/" "$pc"
  else
    echo "listen_addresses = 'localhost'" >> "$pc"
  fi
  # Comment out (never delete) host rules for addresses other than localhost
  sed -i -E '/^\s*host(ssl|nossl)?\s/{ /127\.0\.0\.1\/32|::1\/128/! s/^/# disabled by harden-server.sh '"$STAMP"': /; }' "$hba"
  if ! systemctl restart postgresql || ! sudo -u postgres psql -tAc 'select 1' | grep -q 1; then
    red "PostgreSQL did not come back — restoring the old config."
    cp -p "$pc.bak-$STAMP" "$pc"; cp -p "$hba.bak-$STAMP" "$hba"; systemctl restart postgresql || true
    exit 1
  fi
  green "PostgreSQL: localhost only. (The app connects via 127.0.0.1/localhost — unaffected.)"
  yellow "Check the site works:  curl -s https://evakuators.am/api/v1/health"
}

# ─── firewall ───────────────────────────────────────────────────────────────
cmd_firewall() {
  need_root
  command -v ufw >/dev/null || { yellow "Installing ufw"; apt-get install -y ufw; }
  local sshport; sshport=$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}'); sshport=${sshport:-22}
  # SSH FIRST — before the firewall is turned on
  ufw allow "$sshport/tcp" comment 'ssh'
  ufw allow 80/tcp comment 'http'
  ufw allow 443/tcp comment 'https'
  ufw default deny incoming
  ufw default allow outgoing
  ufw --force enable
  ufw status verbose
  green "Firewall on: only SSH ($sshport), 80 and 443 are open from outside."
}

# ─── ssh ────────────────────────────────────────────────────────────────────
cmd_ssh() {
  need_root
  local user="${SUDO_USER:-root}" home conf=/etc/ssh/sshd_config.d/99-hardening.conf
  home=$(getent passwd "$user" | cut -d: -f6)
  if [ ! -s "$home/.ssh/authorized_keys" ]; then
    red "$user has no SSH key in $home/.ssh/authorized_keys."
    red "Add your Mac's key first (on the Mac: ssh-copy-id $user@<server>), log in with it, then run this again."
    exit 1
  fi
  grep -qE '^\s*Include\s+/etc/ssh/sshd_config.d/\*\.conf' /etc/ssh/sshd_config || {
    red "/etc/ssh/sshd_config does not include sshd_config.d — edit it by hand instead."; exit 1; }
  [ -f "$conf" ] && backup "$conf"
  cat > "$conf" <<CONF
# harden-server.sh $STAMP — keys only
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
MaxAuthTries 4
CONF
  if ! sshd -t; then
    red "sshd rejected the config — removing it, nothing changed."
    rm -f "$conf"; [ -f "$conf.bak-$STAMP" ] && cp -p "$conf.bak-$STAMP" "$conf"
    exit 1
  fi
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
  green "SSH: keys only. Your current session stays open."
  yellow "DO NOT close this terminal. From the Mac open a NEW terminal and run:  ssh $user@<server>"
  yellow "If that fails, undo here:  rm $conf && systemctl reload ssh"
}

case "${1:-check}" in
  check) cmd_check ;;
  redis) cmd_redis ;;
  postgres) cmd_postgres ;;
  firewall) cmd_firewall ;;
  ssh) cmd_ssh ;;
  *) echo "Usage: sudo bash scripts/harden-server.sh [check|redis|postgres|firewall|ssh]"; exit 1 ;;
esac

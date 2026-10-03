#!/bin/sh
set -eu

code_file=""
configuration_id=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --code-file) code_file="$2"; shift 2 ;;
    --configuration-id) configuration_id="$2"; shift 2 ;;
    *) exit 2 ;;
  esac
done

case "$configuration_id" in
  *[!A-Za-z0-9-]*|'') exit 2 ;;
esac
[ -f "$code_file" ] || exit 2
installation_code="$(tr -d '\r\n' < "$code_file")"
case "$installation_code" in
  [0-9][0-9][0-9]-[0-9][0-9][0-9]-[0-9][0-9][0-9]) ;;
  *) exit 2 ;;
esac

state_dir="/Library/Application Support/i-JANEK"
state_path="$state_dir/dwservice-status.json"
log_path="$state_dir/dwservice-install.log"
work_dir="$(mktemp -d /private/tmp/i-janek-dwservice.XXXXXX)"
mount_dir="$work_dir/mount"
mounted=0

write_state() {
  status="$1"
  applied_hash="${2:-}"
  error_message="${3:-}"
  now="$(date +%s)000"
  tmp="$state_path.tmp"
  mkdir -p "$state_dir"
  chmod 755 "$state_dir"
  printf '{"status":"%s","configurationId":"%s","appliedCodeHash":"%s","updatedAt":%s,"error":"%s"}\n' \
    "$status" "$configuration_id" "$applied_hash" "$now" "$error_message" > "$tmp"
  chmod 644 "$tmp"
  mv -f "$tmp" "$state_path"
}

cleanup() {
  if [ "$mounted" -eq 1 ]; then
    /usr/bin/hdiutil detach "$mount_dir" -quiet || true
  fi
  rm -rf "$work_dir"
  rm -f "$code_file"
}

fail() {
  write_state "error" "" "Konfiguracja DWService nie powiodła się."
  exit 1
}

trap cleanup EXIT
trap fail HUP INT TERM
write_state "installing"

agent_app="/Applications/DWAgent.app"
if [ ! -x "$agent_app/Contents/MacOS/Install" ]; then
  dmg_path="$work_dir/dwagent.dmg"
  mkdir -p "$mount_dir"
  /usr/bin/curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    'https://www.dwservice.net/download/dwagent.dmg' -o "$dmg_path" || fail
  /usr/bin/hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$mount_dir" -quiet || fail
  mounted=1
  [ -d "$mount_dir/DWAgent.app" ] || fail
  /usr/bin/codesign --verify --deep --strict "$mount_dir/DWAgent.app" || fail
  /usr/sbin/spctl --assess --type execute "$mount_dir/DWAgent.app" || fail
  /usr/bin/ditto "$mount_dir/DWAgent.app" "$agent_app" || fail
  "$agent_app/Contents/MacOS/extract" || fail
  chmod -R 755 "$agent_app" || fail
fi

"$agent_app/Contents/MacOS/Install" "$agent_app/" Y -silent \
  "key=$installation_code" "logpath=$log_path" || fail

[ -e '/Library/LaunchDaemons/net.dwservice.agsvc.plist' ] || [ -d '/Library/DWAgent' ] || fail
applied_hash="$(printf '%s' "$installation_code" | /usr/bin/shasum -a 256 | /usr/bin/awk '{print $1}')"
write_state "ready" "$applied_hash"

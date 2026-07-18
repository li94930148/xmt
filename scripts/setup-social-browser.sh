#!/usr/bin/env bash
set -euo pipefail
apt-get update
apt-get install -y xvfb chromium
install -d -m 700 /data/social-review/browser
if ! pgrep -f 'Xvfb :99' >/dev/null; then Xvfb :99 -screen 0 1365x900x24 >/var/log/social-review-xvfb.log 2>&1 & fi
echo 'Set DISPLAY=:99 and SOCIAL_REVIEW_BROWSER_ROOT=/data/social-review/browser.'

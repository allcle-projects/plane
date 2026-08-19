#!/bin/bash
# Zero-downtime canary swap for the `api` service (django backend).
# Extracts live container config (env/volume) via docker inspect so secrets
# are never hardcoded in this script or printed anywhere. One replica at a
# time: launch new-image canary, wait for it to answer HTTP, THEN retire old.
set -euo pipefail

NEW_IMAGE="${1:?usage: canary-swap-api.sh <new-image:tag>}"
NETWORK="plane_default"
SERVICE="api"
INTERNAL_PORT=8000
PROBE_PATH="/api/instances/"
VOLUME="plane_logs_api"
VOLUME_DST="/code/plane/logs"

mapfile -t REPLICAS < <(docker ps \
  --filter "label=com.docker.compose.service=${SERVICE}" \
  --filter "label=com.docker.compose.project=plane" \
  --format "{{.Names}}" | sort)

if [ "${#REPLICAS[@]}" -eq 0 ]; then
  echo "no running ${SERVICE} replicas found"; exit 1
fi
echo "replicas to swap: ${REPLICAS[*]}"

for OLD_NAME in "${REPLICAS[@]}"; do
  CURRENT_IMAGE="$(docker inspect "$OLD_NAME" -f '{{.Config.Image}}' 2>/dev/null || true)"
  if [ "$CURRENT_IMAGE" = "$NEW_IMAGE" ]; then
    echo "=== $OLD_NAME already on ${NEW_IMAGE} - skipping ==="
    continue
  fi

  CANARY_NAME="${OLD_NAME}-canary"
  echo "=== $OLD_NAME -> canary on ${NEW_IMAGE} ==="

  docker rm -f "$CANARY_NAME" >/dev/null 2>&1 || true

  # dump the OLD container's live env to a temp file (never echoed) so the
  # canary gets the exact same secrets/config, then run, then shred the file.
  ENV_FILE="$(mktemp)"
  chmod 600 "$ENV_FILE"
  docker inspect "$OLD_NAME" -f '{{range .Config.Env}}{{println .}}{{end}}' > "$ENV_FILE"

  docker run -d --name "$CANARY_NAME" \
    --network "$NETWORK" --network-alias api \
    --env-file "$ENV_FILE" \
    --mount "type=volume,src=${VOLUME},dst=${VOLUME_DST}" \
    --restart unless-stopped \
    "$NEW_IMAGE" ./bin/docker-entrypoint-api.sh >/dev/null

  shred -u "$ENV_FILE" 2>/dev/null || rm -f "$ENV_FILE"

  echo "waiting for canary to answer HTTP..."
  ready=""
  for _ in $(seq 1 60); do
    CANARY_IP="$(docker inspect "$CANARY_NAME" -f "{{.NetworkSettings.Networks.${NETWORK}.IPAddress}}" 2>/dev/null || true)"
    if [ -n "$CANARY_IP" ]; then
      code="$(curl -sS -o /dev/null -w '%{http_code}' -m 3 "http://${CANARY_IP}:${INTERNAL_PORT}${PROBE_PATH}" 2>/dev/null)" || code="000"
      [ -z "$code" ] && code="000"
      if [ "$code" != "000" ]; then
        ready="yes"
        break
      fi
    fi
    sleep 2
  done

  if [ -z "$ready" ]; then
    echo "!! canary never responded — aborting, removing canary, leaving $OLD_NAME untouched"
    docker logs "$CANARY_NAME" 2>&1 | tail -30
    docker rm -f "$CANARY_NAME" >/dev/null
    exit 1
  fi
  echo "canary responding (http_code=$code)."

  docker rm -f "$OLD_NAME" >/dev/null
  docker rename "$CANARY_NAME" "$OLD_NAME"
  echo "$OLD_NAME now running ${NEW_IMAGE}"
done

echo "=== canary swap complete: all ${SERVICE} replicas on ${NEW_IMAGE} ==="

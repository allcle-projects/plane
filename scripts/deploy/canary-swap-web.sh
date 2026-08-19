#!/bin/bash
# Zero-downtime canary swap for the `web` service (plane-frontend, nginx-static).
# One replica at a time: launch new-image canary on the same network alias,
# wait healthy, THEN retire the old container. At every instant >=1 replica serves.
set -euo pipefail

NEW_IMAGE="${1:?usage: canary-swap-web.sh <new-image:tag>}"
NETWORK="plane_default"
SERVICE="web"
INTERNAL_PORT=3000
HEALTH_CMD="curl -fsS http://127.0.0.1:${INTERNAL_PORT}/ >/dev/null || exit 1"

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

  docker run -d --name "$CANARY_NAME" \
    --network "$NETWORK" --network-alias web \
    --health-cmd "$HEALTH_CMD" \
    --health-interval=5s --health-timeout=5s --health-retries=3 --health-start-period=10s \
    --restart unless-stopped \
    "$NEW_IMAGE" nginx -g "daemon off;" >/dev/null

  echo "waiting for canary healthy..."
  status="starting"
  for _ in $(seq 1 30); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$CANARY_NAME" 2>/dev/null || echo starting)"
    [ "$status" = "healthy" ] && break
    sleep 2
  done

  if [ "$status" != "healthy" ]; then
    echo "!! canary never became healthy (status=$status) — aborting, removing canary, leaving $OLD_NAME untouched"
    docker logs "$CANARY_NAME" 2>&1 | tail -20
    docker rm -f "$CANARY_NAME" >/dev/null
    exit 1
  fi
  echo "canary healthy."

  docker rm -f "$OLD_NAME" >/dev/null
  docker rename "$CANARY_NAME" "$OLD_NAME"
  echo "$OLD_NAME now running ${NEW_IMAGE}"
done

echo "=== canary swap complete: all ${SERVICE} replicas on ${NEW_IMAGE} ==="

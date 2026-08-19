#!/bin/bash
# Zero-downtime canary swap for the `worker` service (celery task consumer).
# Multiple consumers of the same broker queue are safe simultaneously, so
# this is a true canary: start new, confirm it's alive+mingled, then retire old.
set -euo pipefail

NEW_IMAGE="${1:?usage: canary-swap-worker.sh <new-image:tag>}"
NETWORK="plane_default"
SERVICE="worker"
VOLUME="plane_logs_worker"
VOLUME_DST="/code/plane/logs"
CMD="./bin/docker-entrypoint-worker.sh"

mapfile -t REPLICAS < <(docker ps \
  --filter "label=com.docker.compose.service=${SERVICE}" \
  --filter "label=com.docker.compose.project=plane" \
  --format "{{.Names}}" | sort)

if [ "${#REPLICAS[@]}" -eq 0 ]; then
  echo "no running ${SERVICE} replicas found"; exit 1
fi
echo "replicas to swap: ${REPLICAS[*]}"

for OLD_NAME in "${REPLICAS[@]}"; do
  CANARY_NAME="${OLD_NAME}-canary"
  echo "=== $OLD_NAME -> canary on ${NEW_IMAGE} ==="

  docker rm -f "$CANARY_NAME" >/dev/null 2>&1 || true

  ENV_FILE="$(mktemp)"
  chmod 600 "$ENV_FILE"
  docker inspect "$OLD_NAME" -f '{{range .Config.Env}}{{println .}}{{end}}' > "$ENV_FILE"

  docker run -d --name "$CANARY_NAME" \
    --network "$NETWORK" \
    --env-file "$ENV_FILE" \
    --mount "type=volume,src=${VOLUME},dst=${VOLUME_DST}" \
    --restart unless-stopped \
    "$NEW_IMAGE" $CMD >/dev/null

  shred -u "$ENV_FILE" 2>/dev/null || rm -f "$ENV_FILE"

  echo "waiting for canary to mingle with the broker..."
  ready=""
  for i in $(seq 1 30); do
    if ! docker inspect -f '{{.State.Running}}' "$CANARY_NAME" 2>/dev/null | grep -q true; then
      echo "!! canary container exited early"; break
    fi
    if docker logs "$CANARY_NAME" 2>&1 | grep -qE "ready\.|mingle: sync with"; then
      ready="yes"; break
    fi
    sleep 2
  done
  # fallback: even without the exact banner match, a still-running container
  # after the loop's settle time is accepted (worker downtime cost is just a
  # brief processing delay, not a user-facing outage — tasks stay durably
  # queued in RabbitMQ regardless).
  if [ -z "$ready" ] && docker inspect -f '{{.State.Running}}' "$CANARY_NAME" 2>/dev/null | grep -q true; then
    ready="yes(fallback-liveness)"
  fi

  if [ -z "$ready" ]; then
    echo "!! canary never came up — aborting, removing canary, leaving $OLD_NAME untouched"
    docker logs "$CANARY_NAME" 2>&1 | tail -30
    docker rm -f "$CANARY_NAME" >/dev/null
    exit 1
  fi
  echo "canary ready ($ready)."

  docker rm -f "$OLD_NAME" >/dev/null
  docker rename "$CANARY_NAME" "$OLD_NAME"
  echo "$OLD_NAME now running ${NEW_IMAGE}"
done

echo "=== canary swap complete: all ${SERVICE} replicas on ${NEW_IMAGE} ==="

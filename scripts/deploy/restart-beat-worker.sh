#!/bin/bash
# Sequential (non-overlapping) restart for `beat-worker` — the Celery beat
# scheduler. Unlike web/api/worker, this must NEVER run 2 instances at once
# (DatabaseScheduler has no distributed lock -> duplicate periodic task firing).
# So: stop old FIRST, then start new. Brief gap (schedule not evaluated for a
# few seconds) is harmless since beat ticks are minute-plus intervals.
set -euo pipefail

NEW_IMAGE="${1:?usage: restart-beat-worker.sh <new-image:tag>}"
NETWORK="plane_default"
SERVICE="beat-worker"
VOLUME="plane_logs_beat-worker"
VOLUME_DST="/code/plane/logs"
CMD="./bin/docker-entrypoint-beat.sh"

mapfile -t REPLICAS < <(docker ps \
  --filter "label=com.docker.compose.service=${SERVICE}" \
  --filter "label=com.docker.compose.project=plane" \
  --format "{{.Names}}" | sort)

if [ "${#REPLICAS[@]}" -eq 0 ]; then
  echo "no running ${SERVICE} replicas found"; exit 1
fi
if [ "${#REPLICAS[@]}" -gt 1 ]; then
  echo "!! REFUSING: ${#REPLICAS[@]} beat-worker replicas already running (${REPLICAS[*]})."
  echo "   Running >1 beat-worker causes duplicate periodic task firing. Fix that first."
  exit 1
fi

OLD_NAME="${REPLICAS[0]}"
CURRENT_IMAGE="$(docker inspect "$OLD_NAME" -f '{{.Config.Image}}' 2>/dev/null || true)"
if [ "$CURRENT_IMAGE" = "$NEW_IMAGE" ]; then
  echo "=== $OLD_NAME already on ${NEW_IMAGE} - nothing to do ==="
  exit 0
fi
echo "=== sequential restart: $OLD_NAME -> ${NEW_IMAGE} (no overlap) ==="

ENV_FILE="$(mktemp)"
chmod 600 "$ENV_FILE"
docker inspect "$OLD_NAME" -f '{{range .Config.Env}}{{println .}}{{end}}' > "$ENV_FILE"

echo "stopping $OLD_NAME..."
docker rm -f "$OLD_NAME" >/dev/null

echo "starting new ${SERVICE} on ${NEW_IMAGE}..."
docker run -d --name "$OLD_NAME" \
  --network "$NETWORK" \
  --env-file "$ENV_FILE" \
  --mount "type=volume,src=${VOLUME},dst=${VOLUME_DST}" \
  --restart unless-stopped \
  "$NEW_IMAGE" $CMD >/dev/null

shred -u "$ENV_FILE" 2>/dev/null || rm -f "$ENV_FILE"

echo "waiting for scheduler to come up..."
ready=""
for i in $(seq 1 30); do
  if ! docker inspect -f '{{.State.Running}}' "$OLD_NAME" 2>/dev/null | grep -q true; then
    echo "!! container exited early"; break
  fi
  if docker logs "$OLD_NAME" 2>&1 | grep -qE "beat.*is starting|DatabaseScheduler"; then
    ready="yes"; break
  fi
  sleep 2
done
if [ -z "$ready" ]; then
  echo "!! scheduler never confirmed running — check logs manually:"
  docker logs "$OLD_NAME" 2>&1 | tail -30
  exit 1
fi

echo "=== $OLD_NAME running ${NEW_IMAGE}, scheduler confirmed up ==="

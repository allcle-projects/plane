#!/bin/bash
# Safe wrapper around `docker compose up -d` for the plane-server3 stack.
#
# api/web/worker/beat-worker are managed via canary-swap-*.sh / 
# restart-beat-worker.sh (scripts/deploy/ in the plane-fork repo), which
# create containers via `docker run` — they never get compose's own
# tracking labels. A plain `docker compose up -d` therefore does NOT see
# them as up-to-date and will try to recreate ALL of them, which:
#   - reintroduces the non-swarm "may tear down all replicas at once"
#     downtime bug canary was built to avoid, and
#   - for beat-worker specifically, risks a brief window where compose's
#     own recreate logic doesn't know about the "never run 2 beat-workers"
#     constraint.
#
# This wrapper runs `docker compose up -d` scoped to every OTHER service
# only, so routine compose usage (migrator runs, image bumps for
# admin/live/space/proxy/db/redis/mq/minio) can't accidentally clobber the
# canary-managed services. To deploy web/api/worker/beat-worker, use the
# canary-swap-*.sh / restart-beat-worker.sh scripts instead.
set -euo pipefail
cd "$(dirname "$0")"

EXCLUDED="api web worker beat-worker"
ALL_SERVICES="$(docker compose --env-file plane.env -p plane config --services)"
TARGET_SERVICES=""
for s in $ALL_SERVICES; do
  skip=""
  for e in $EXCLUDED; do
    [ "$s" = "$e" ] && skip=1
  done
  [ -z "$skip" ] && TARGET_SERVICES="$TARGET_SERVICES $s"
done

echo "excluded (canary-managed, untouched): $EXCLUDED"
echo "target services: $TARGET_SERVICES"
docker compose --env-file plane.env -p plane up -d --no-deps $TARGET_SERVICES "$@"

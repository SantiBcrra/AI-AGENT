#!/bin/bash
# ============================================================
# Runner unificado de cron jobs
# Uso: ./scripts/cron.sh <job>
# Ejemplo: ./scripts/cron.sh 01-collect-gsc
#
# Logs se guardan en /logs/cron-<job>-YYYY-MM-DD.log
# ============================================================

set -e

JOB=$1
if [ -z "$JOB" ]; then
  echo "Usage: $0 <job-name>"
  echo "Available jobs:"
  ls scripts/cron/*.ts | xargs -n1 basename | sed 's/.ts//'
  exit 1
fi

SCRIPT="scripts/cron/${JOB}.ts"
if [ ! -f "$SCRIPT" ]; then
  echo "Error: script not found: $SCRIPT"
  exit 1
fi

# Crear directorio de logs
mkdir -p logs
LOG_DATE=$(date +%Y-%m-%d)
LOG_FILE="logs/cron-${JOB}-${LOG_DATE}.log"

echo "[$( date '+%Y-%m-%d %H:%M:%S')] Starting $JOB" | tee -a "$LOG_FILE"

# Cargar variables de entorno y ejecutar con tsx
npx tsx --env-file=.env "$SCRIPT" 2>&1 | tee -a "$LOG_FILE"

EXIT_CODE=$?
echo "[$( date '+%Y-%m-%d %H:%M:%S')] Finished $JOB (exit: $EXIT_CODE)" | tee -a "$LOG_FILE"

# Rotar logs: eliminar logs de más de 30 días
find logs/ -name "cron-*.log" -mtime +30 -delete 2>/dev/null || true

exit $EXIT_CODE

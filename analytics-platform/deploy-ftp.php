<?php
/**
 * Despliegue vía HTTP (cuando solo tienes FTP, sin SSH)
 *
 * Sube este archivo al servidor (idealmente FUERA del document root).
 * Si lo subes a public_html, cualquiera con la URL puede intentar atacarlo:
 *   → usa DEPLOY_SECRET largo y BORRA el archivo tras desplegar.
 *
 * Edita DEPLOY_SECRET abajo.
 * Coloca este archivo en la MISMA carpeta que package.json (raíz del proyecto).
 * La ruta en disco se toma automáticamente con __DIR__ (no hace falta adivinar /www/...).
 *
 * Diagnóstico (misma key): deploy-ftp.php?key=SECRETO&diag=1
 *
 * Apache mod_fcgid suele cortar la petición a los 360s. Por eso el despliegue
 * va por PASOS (abre cada URL y espera a que termine antes del siguiente):
 *
 *   DESPLIEGUE npm (ci / build / start): desactivado en código (bloque comentado abajo).
 *   REVERTIR despliegue local: ?key=SECRETO&step=revert → borra node_modules, .next y logs.
 *   ?key=SECRETO&step=status → últimas líneas de los logs (solo lectura)
 *
 * (Antes: ci, build, start en segundo plano; sync=1 bloqueante — ver bloque comentado.)
 *
 * Sin &step= → muestra esta ayuda (no ejecuta npm).
 */
declare(strict_types=1);

// ─── CONFIGURACIÓN ──────────────────────────────────────────────────
// Opcional: si el PHP está en otra carpeta que el proyecto, define la ruta absoluta aquí.
// Déjalo vacío ('') para usar automáticamente la carpeta donde está deploy-ftp.php (__DIR__).
const DEPLOY_PATH_OVERRIDE = '';

// No uses contraseñas cortas en producción; borra este script tras desplegar.
const DEPLOY_SECRET = '1234';

/** Si en el servidor `npm` no está en el PATH del usuario de PHP, pon la ruta absoluta, ej. /usr/local/bin/npm */
const NPM_COMMAND = 'npm';

// ─── Seguridad ────────────────────────────────────────────────────
if (!isset($_GET['key']) || !hash_equals(DEPLOY_SECRET, (string) $_GET['key'])) {
    header('HTTP/1.1 403 Forbidden');
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Forbidden';
    exit(1);
}

header('Content-Type: text/plain; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
set_time_limit(0);
ignore_user_abort(true);

$deployPath = DEPLOY_PATH_OVERRIDE !== ''
    ? realpath(DEPLOY_PATH_OVERRIDE)
    : realpath(__DIR__);

if ($deployPath === false) {
    echo "ERROR: No se pudo resolver la carpeta del proyecto.\n";
    echo "  __DIR__ (donde está este PHP): " . __DIR__ . "\n";
    if (DEPLOY_PATH_OVERRIDE !== '') {
        echo "  DEPLOY_PATH_OVERRIDE intentado: " . DEPLOY_PATH_OVERRIDE . "\n";
    }
    echo "  En el panel el \"/\" es tu raíz de cuenta; en Linux la ruta real suele ser /home/USER/... distinta al subdominio.\n";
    echo "  Sube deploy-ftp.php junto a package.json o rellena DEPLOY_PATH_OVERRIDE con la ruta absoluta real.\n";
    exit(1);
}

if (!is_file($deployPath . '/package.json')) {
    echo "ERROR: No hay package.json en: {$deployPath}\n";
    echo "  __FILE__: " . __FILE__ . "\n";
    echo "  Coloca deploy-ftp.php en la misma carpeta que package.json.\n";
    exit(1);
}

if (isset($_GET['step']) && strtolower((string) $_GET['step']) === 'status') {
    echo "=== deploy-ftp.php — STATUS (últimas líneas de logs) ===\n\n";
    foreach (['deploy-ci.log', 'deploy-build.log', 'next-start.log'] as $name) {
        $p = $deployPath . '/' . $name;
        echo "----- {$name} -----\n";
        echo tailLogFile($p, 100);
        echo "\n";
    }
    echo "(npm desactivado en este script; estos logs son histórico si existían.)\n";
    exit(0);
}

if (isset($_GET['diag']) && (string) $_GET['diag'] === '1') {
    echo "=== DIAGNÓSTICO (sin ejecutar npm) ===\n";
    echo "__DIR__          : " . __DIR__ . "\n";
    echo "__FILE__         : " . __FILE__ . "\n";
    echo "Ruta usada       : {$deployPath}\n";
    echo "package.json     : " . (is_file($deployPath . '/package.json') ? 'sí' : 'no') . "\n";
    echo "getcwd()         : " . (getcwd() ?: '(null)') . "\n";
    $phpUser = 'n/d';
    if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
        $pw = posix_getpwuid(posix_geteuid());
        if (is_array($pw) && isset($pw['name'])) {
            $phpUser = $pw['name'];
        }
    }
    echo "PHP user         : {$phpUser}\n";
    exit(0);
}

/**
 * Ejecuta un comando con cwd = proyecto. Volcado en tiempo real a la salida.
 *
 * @return int código de salida del proceso
 */
function runInProject(string $deployPath, string $label, string $shellCommand): int
{
    echo str_repeat('=', 60) . "\n";
    echo $label . "\n";
    echo str_repeat('=', 60) . "\n";

    $env = $_ENV;
    $env['PATH'] = getenv('PATH') ?: '/usr/local/bin:/usr/bin:/bin';
    $env['HOME'] = getenv('HOME') ?: '/tmp';
    $env['CI'] = 'true';

    $descriptorspec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = proc_open(
        $shellCommand,
        $descriptorspec,
        $pipes,
        $deployPath,
        $env,
        null
    );

    if (!is_resource($process)) {
        echo "ERROR: proc_open() falló. ¿PHP tiene deshabilitado proc_open en disable_functions?\n";
        return 127;
    }

    fclose($pipes[0]);

    $read = [$pipes[1], $pipes[2]];
    $write = null;
    $except = null;

    while (stream_select($read, $write, $except, 200000) > 0) {
        foreach ($read as $pipe) {
            $chunk = fread($pipe, 8192);
            if ($chunk !== false && $chunk !== '') {
                echo $chunk;
                flush();
            }
        }
        if (feof($pipes[1]) && feof($pipes[2])) {
            break;
        }
    }

    fclose($pipes[1]);
    fclose($pipes[2]);

    $code = proc_close($process);
    echo "\n--- Código de salida: {$code} ---\n\n";

    return $code;
}

/**
 * Lanza npm en segundo plano; la petición HTTP termina al instante (no hay timeout de 360s en PHP).
 * El trabajo sigue en el servidor. Revisa el log con ?step=status o por FTP.
 *
 * @return string PID reportado por bash (puede estar vacío)
 */
function runNpmBackground(string $deployPath, string $npm, string $logBasename, string $npmArgs): string
{
    $logFile = $deployPath . '/' . $logBasename;
    $marker  = $deployPath . '/' . str_replace('.log', '.started.txt', $logBasename);
    @file_put_contents($marker, gmdate('c') . " UTC — lanzado\n", FILE_APPEND);

    $logEsc = escapeshellarg($logFile);
    $dirEsc = escapeshellarg($deployPath);
    // Un solo subshell en background: npm y al final escribe el código de salida al mismo log.
    $inner = 'cd ' . $dirEsc . ' && { ' . $npm . ' ' . $npmArgs . ' >> ' . $logEsc . ' 2>&1; echo "___EXIT_CODE___" $? >> ' . $logEsc . '; }';
    $bash  = $inner . ' & echo $!';
    if (!function_exists('shell_exec')) {
        echo "ERROR: shell_exec está deshabilitado; no se puede lanzar npm en segundo plano.\n";
        return '';
    }
    $pid = trim((string) shell_exec('/bin/bash -c ' . escapeshellarg($bash) . ' 2>&1'));

    return $pid;
}

/**
 * Últimas líneas de un archivo (sin usar tail del sistema).
 */
function tailLogFile(string $path, int $maxLines = 80): string
{
    if (!is_readable($path)) {
        return "(archivo no existe o no legible: {$path})\n";
    }
    $raw = @file_get_contents($path);
    if ($raw === false) {
        return "(no se pudo leer: {$path})\n";
    }
    $lines = preg_split('/\r\n|\r|\n/', $raw) ?: [];
    if (count($lines) <= $maxLines) {
        return implode("\n", $lines) . "\n";
    }

    return implode("\n", array_slice($lines, -$maxLines)) . "\n";
}

// Comando shell: usar bash para pipelines y nohup
$npm = escapeshellcmd(NPM_COMMAND);

$step = isset($_GET['step']) ? strtolower(trim((string) $_GET['step'])) : '';

if ($step === '' || $step === 'help') {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'tudominio.com';
    $script = $_SERVER['SCRIPT_NAME'] ?? '/deploy-ftp.php';
    $base   = $scheme . '://' . $host . $script;
    $k = rawurlencode(DEPLOY_SECRET);

    echo "=== deploy-ftp.php — AYUDA (modo revertir; npm desactivado) ===\n\n";
    echo "Los pasos npm (ci / build / start) están comentados en este archivo.\n";
    echo "Para deshacer lo que generó el despliegue en ESTA carpeta (node_modules, build .next, logs):\n\n";
    echo "0) Diagnóstico:\n   {$base}?key={$k}&diag=1\n\n";
    echo "1) Revertir artefactos (rm -rf node_modules .next + borrar logs):\n   {$base}?key={$k}&step=revert\n\n";
    echo "2) Ver logs si siguen existiendo:\n   {$base}?key={$k}&step=status\n\n";
    echo "Si necesitas otra vez ci/build/start, descomenta el bloque al final del PHP.\n";
    echo "Detener el proceso Node (next start) no lo hace este script; hazlo en el panel o con soporte.\n";
    echo "Borra deploy-ftp.php del servidor cuando no lo uses.\n";
    exit(0);
}

echo "Directorio de trabajo: {$deployPath}\n";
echo "Paso solicitado: {$step}\n";
echo "Fecha: " . gmdate('Y-m-d H:i:s') . " UTC\n\n";

$exitCode = 0;
$useSync = isset($_GET['sync']) && (string) $_GET['sync'] === '1';

if ($step === 'all') {
    echo "step=all sigue deshabilitado. npm desactivado: usa step=revert o descomenta el bloque de despliegue.\n";
    exit(0);
}

if ($step === 'revert') {
    $logFiles = [
        'deploy-ci.log',
        'deploy-build.log',
        'next-start.log',
        'deploy-ci.started.txt',
        'deploy-build.started.txt',
    ];
    foreach ($logFiles as $name) {
        $p = $deployPath . '/' . $name;
        if (is_file($p)) {
            @unlink($p);
            echo "Eliminado: {$name}\n";
        }
    }
    echo "\n";
    $exitCode = runInProject(
        $deployPath,
        'Revertir despliegue: rm -rf node_modules .next (solo esta carpeta)',
        '/bin/bash -c ' . escapeshellarg('rm -rf node_modules .next')
    );
    echo $exitCode === 0
        ? "OK. Artefactos de npm/build eliminados en {$deployPath}\n"
        : "ERROR al borrar directorios (permisos o rm no disponible).\n";
    echo "Este script no mata procesos Node en marcha; hazlo aparte si hace falta.\n";
    exit($exitCode);
}

if ($step === 'ci' || $step === 'build' || $step === 'start') {
    header('HTTP/1.1 503 Service Unavailable');
    echo "Los pasos npm (ci, build, start) están DESACTIVADOS (código comentado al final del archivo).\n";
    echo "Para deshacer un despliegue previo en esta carpeta: ?key=...&step=revert\n";
    exit(1);
}

/*
 * ─── Despliegue npm (desactivado): descomenta desde aquí hasta el cierre ───
 *     para volver a usar ci / build / start en segundo plano o con &sync=1
 *
if ($step === 'all') {
    echo "step=all está deshabilitado (siempre supera el timeout). Usa step=ci → status → build → status → start.\n";
    exit(0);
}

if ($step === 'ci') {
    if ($useSync) {
        $exitCode = runInProject($deployPath, 'npm ci (bloqueante)', '/bin/bash -c ' . escapeshellarg($npm . ' ci'));
        echo $exitCode === 0 ? "OK. Siguiente: &step=build (o &sync=1)\n" : "ERROR en npm ci.\n";
        exit($exitCode);
    }
    @unlink($deployPath . '/deploy-ci.log');
    $pid = runNpmBackground($deployPath, $npm, 'deploy-ci.log', 'ci');
    echo "npm ci lanzado en SEGUNDO PLANO (evita timeout de mod_fcgid).\n";
    echo "PID reportado: " . ($pid !== '' ? $pid : '(no disponible)') . "\n";
    echo "Log: {$deployPath}/deploy-ci.log\n\n";
    echo "Espera varios minutos y abre varias veces:\n";
    echo "  ?key=...&step=status\n";
    echo "Busca al final del log la línea ___EXIT_CODE___ 0 antes de ejecutar step=build.\n";
    exit(0);
}

if ($step === 'build') {
    if ($useSync) {
        $exitCode = runInProject($deployPath, 'npm run build (bloqueante)', '/bin/bash -c ' . escapeshellarg($npm . ' run build'));
        echo $exitCode === 0 ? "OK. Siguiente: &step=start\n" : "ERROR en npm run build.\n";
        exit($exitCode);
    }
    @unlink($deployPath . '/deploy-build.log');
    $pid = runNpmBackground($deployPath, $npm, 'deploy-build.log', 'run build');
    echo "npm run build lanzado en SEGUNDO PLANO.\n";
    echo "PID reportado: " . ($pid !== '' ? $pid : '(no disponible)') . "\n";
    echo "Log: {$deployPath}/deploy-build.log\n\n";
    echo "Refresca ?key=...&step=status hasta ver ___EXIT_CODE___ 0 en deploy-build.log, luego step=start.\n";
    exit(0);
}

if ($step === 'start') {
    $logFile = $deployPath . '/next-start.log';
    $bgCmd = sprintf(
        'cd %s && nohup %s run start >> %s 2>&1 &',
        escapeshellarg($deployPath),
        $npm,
        escapeshellarg($logFile)
    );
    $exitCode = runInProject(
        $deployPath,
        'npm run start (segundo plano → ' . $logFile . ')',
        '/bin/bash -c ' . escapeshellarg($bgCmd)
    );
    echo "Log Node: {$logFile}\n";
    echo "Puerto típico: 3000 (proxy en el panel del hosting).\n";
    echo "IMPORTANTE: elimina deploy-ftp.php cuando termines.\n";
    exit($exitCode);
}
 *
 * ─── Fin bloque despliegue npm (desactivado) ───
 */

header('HTTP/1.1 400 Bad Request');
echo "Parámetro step inválido. Usa: help | revert | status | diag=1 (npm: descomenta bloque al final)\n";
exit(1);

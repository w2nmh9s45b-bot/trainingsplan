#!/bin/bash
# Zyklus – App-Version aus dem Dateiinhalt stempeln.
#
# Das Handy lädt eine neue App-Fassung nur, wenn sich sw.js ändert. Dieses Skript
# bildet eine Prüfsumme über alle App-Dateien (Liste ASSETS in sw.js, dazu sw.js
# selbst) und schreibt sie als Version an zwei Stellen:
#   sw.js   var VERSION = "…"        – Name des Offline-Speichers
#   app.js  var APP_VERSION = "…"    – woran die laufende Seite ihre eigene Fassung erkennt
# Die beiden Versionszeilen selbst zählen nicht zur Prüfsumme.
# Gleicher Inhalt → Version bleibt, jede Änderung → neue Version.
#
#   bash Werkzeuge/stempeln.sh                  Version setzen (nur wenn nötig)
#   bash Werkzeuge/stempeln.sh --pruefen        nur prüfen: Exit 1, wenn die Version nicht zum Inhalt passt
#   bash Werkzeuge/stempeln.sh --liste          App-Dateien ausgeben (für den pre-commit-Hook)
#   bash Werkzeuge/stempeln.sh --hook-einrichten  pre-commit-Hook in diesem Klon aktivieren
set -euo pipefail
cd "$(dirname "$0")/.."

SW_ZEILE='^var VERSION = "'
APP_ZEILE='^  var APP_VERSION = "'

if [ "${1:-}" = "--hook-einrichten" ]; then
  # Kleiner Starter in .git/hooks (liegt nie auf GitHub, behält sein Ausführungsrecht);
  # die eigentliche Logik bleibt versioniert in .githooks/pre-commit.
  # Bewusst fest .git/hooks – `git rev-parse --git-path hooks` folgte einem gesetzten
  # core.hooksPath und zeigte dann auf .githooks, also auf die Hook-Logik selbst.
  git config --unset core.hooksPath 2>/dev/null || true
  hook="$(git rev-parse --git-dir)/hooks/pre-commit"
  case "$hook" in
    *.githooks/*) echo "stempeln: Zielpfad $hook wäre die Hook-Logik selbst – abgebrochen." >&2; exit 2 ;;
  esac
  if [ -e "$hook" ] && ! grep -q "exec bash .*githooks/pre-commit" "$hook"; then
    echo "stempeln: $hook existiert schon und ist nicht der Zyklus-Starter – nichts überschrieben." >&2
    exit 2
  fi
  mkdir -p "$(dirname "$hook")"
  printf '%s\n' '#!/bin/sh' \
    '# Zyklus: App-Version vor jedem Commit stempeln – Logik in .githooks/pre-commit' \
    'exec bash "$(git rev-parse --show-toplevel)/.githooks/pre-commit"' > "$hook"
  chmod +x "$hook"
  echo "pre-commit-Hook eingerichtet: $hook"
  exit 0
fi

liste=$(sed -n '/^var ASSETS = \[/,/^\];/p' sw.js | grep -oE '"\./[^"]+"' | tr -d '"' | sed 's#^\./##' | LC_ALL=C sort -u || true)
if [ -z "$liste" ]; then
  echo "stempeln: ASSETS-Liste in sw.js nicht gefunden" >&2
  exit 2
fi

if [ "${1:-}" = "--liste" ]; then
  printf '%s\n' $liste sw.js
  exit 0
fi

for d in $liste; do
  if [ ! -f "$d" ]; then
    echo "stempeln: $d steht in ASSETS, die Datei fehlt" >&2
    exit 2
  fi
done

alt_sw=$(sed -n 's/^var VERSION = "\([^"]*\)".*/\1/p' sw.js)
alt_app=$(sed -n 's/^  var APP_VERSION = "\([^"]*\)".*/\1/p' app.js)
if [ -z "$alt_sw" ] || [ -z "$alt_app" ]; then
  echo "stempeln: Versionszeile fehlt (sw.js: var VERSION = \"…\" / app.js: var APP_VERSION = \"…\")" >&2
  exit 2
fi

summe=$(
  {
    for d in $liste; do
      printf '%s ' "$d"
      if [ "$d" = "app.js" ]; then
        grep -v "$APP_ZEILE" app.js | shasum -a 256
      else
        shasum -a 256 < "$d"
      fi
    done
    grep -v "$SW_ZEILE" sw.js
  } | shasum -a 256 | cut -c1-10
)

if [ "${alt_sw##*.}" = "$summe" ] && [ "$alt_app" = "$alt_sw" ]; then
  echo "Version ist aktuell ($alt_sw)"
  exit 0
fi

if [ "${1:-}" = "--pruefen" ]; then
  echo "Version VERALTET: sw.js $alt_sw / app.js $alt_app passt nicht zum Inhalt ($summe)." >&2
  echo "→ bash Werkzeuge/stempeln.sh ausführen und sw.js + app.js mit hochladen/committen" >&2
  exit 1
fi

# Datum nur bei echter Inhaltsänderung erneuern, sonst bleibt die Version stabil.
if [ "${alt_sw##*.}" = "$summe" ]; then
  neu="$alt_sw"
else
  neu="$(date +%Y-%m-%d).$summe"
fi

ersetzen() {   # $1 Datei, $2 sed-Ausdruck – Inhalt ersetzen, Datei selbst bleibt
  local tmp
  tmp=$(mktemp)
  sed "$2" "$1" > "$tmp"
  cat "$tmp" > "$1"
  rm -f "$tmp"
}
ersetzen sw.js "s/^var VERSION = \"[^\"]*\"/var VERSION = \"$neu\"/"
ersetzen app.js "s/^  var APP_VERSION = \"[^\"]*\"/  var APP_VERSION = \"$neu\"/"
echo "Version: $alt_sw → $neu"

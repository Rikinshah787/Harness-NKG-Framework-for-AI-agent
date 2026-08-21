#!/usr/bin/env bash
# NKG Framework installer (macOS / Linux)
# Installs all bundled presets (cordis-lite, sec-agent) + NKG plugin into your DSH user preset root.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

if [ ! -d "$DSH_HOME" ]; then
  echo "DSH home not found at $DSH_HOME - is DeepSeek Harness installed?"
  echo "Install DSH first, run it once, then re-run this script."
  exit 1
fi

echo
echo "Installed presets (each with the NKG plugin):"
for preset in "$SCRIPT_DIR"/presets/*/; do
  name="$(basename "$preset")"
  DEST="$DSH_HOME/.agent-presets/$name"
  mkdir -p "$DEST/plugins/nkg"
  cp -R "$preset." "$DEST/"
  cp "$SCRIPT_DIR/plugins/nkg/index.js" "$DEST/plugins/nkg/index.js"
  echo "  $DEST"
done

echo
echo "Next steps:"
echo "  1. Start (or restart) dsh"
echo '  2. Pick "Cordis Lite" or "Sec Agent" in the session picker, or make one the default'
echo "     by adding to $DSH_HOME/settings.yaml:"
echo
echo "       agent-presets:"
echo "         default: cordis-lite"
echo
echo "The knowledge graph auto-creates in .git/nkg.json on the first tool event."
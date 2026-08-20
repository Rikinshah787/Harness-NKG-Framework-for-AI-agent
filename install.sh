#!/usr/bin/env bash
# NKG Framework installer (macOS / Linux)
# Installs the cordis-lite preset + NKG plugin into your DSH user preset root.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"

if [ ! -d "$DSH_HOME" ]; then
  echo "DSH home not found at $DSH_HOME — is DeepSeek Harness installed?"
  echo "Install DSH first, run it once, then re-run this script."
  exit 1
fi

DEST="$DSH_HOME/.agent-presets/cordis-lite"
mkdir -p "$DEST/plugins/nkg"

cp -R "$SCRIPT_DIR/presets/cordis-lite/." "$DEST/"
cp "$SCRIPT_DIR/plugins/nkg/index.js" "$DEST/plugins/nkg/index.js"

echo
echo "Installed cordis-lite + NKG to:"
echo "  $DEST"
echo
echo "Next steps:"
echo "  1. Start (or restart) dsh"
echo '  2. Pick the "Cordis Lite" preset in the session picker, or make it the default'
echo "     by adding to $DSH_HOME/settings.yaml:"
echo
echo "       agent-presets:"
echo "         default: cordis-lite"
echo
echo "The knowledge graph auto-creates in .git/nkg.json on the first tool event."

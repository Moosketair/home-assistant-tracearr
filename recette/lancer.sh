#!/usr/bin/env bash
# Disposable, pinned environments. Run from any directory; extra args go to pytest.
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
target=${1:-}
case "$target" in
  base) interpreter=(--python /usr/bin/python3) ;;
  min) interpreter=(--managed-python --python 3.13.18) ;;
  current) interpreter=(--managed-python --python 3.14.10) ;;
  *) echo "Usage: bash recette/lancer.sh {base|min|current} [arguments pytest]" >&2; exit 2 ;;
esac
shift
root=$(mktemp -d "${TMPDIR:-/tmp}/tracearr-recette.XXXXXXXX")
trap 'rm -rf -- "$root"' EXIT
export TMPDIR="$root" UV_CACHE_DIR="$root/cache" UV_PYTHON_INSTALL_DIR="$root/python"
export UV_PYTHON_BIN_DIR="$root/bin" PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1
unset PYTHONPATH PYTHONHOME
uv venv "${interpreter[@]}" "$root/venv"
uv pip sync --python "$root/venv/bin/python" "recette/requirements-$target.txt"
if [[ "$target" == base ]]; then
  "$root/venv/bin/python" -m pytest -p no:cacheprovider -q tests "$@"
  node --check custom_components/tracearr_ha/frontend/tracearr-card.js
  node --test tests/test_carousel.cjs
else
  "$root/venv/bin/python" -m pytest -p no:cacheprovider -c recette/pytest.ini -q -rx recette "$@"
fi

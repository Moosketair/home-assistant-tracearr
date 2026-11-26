"""Regression checks for the HA LovelaceData mode rename, without HA installed."""
import ast
import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

FRONTEND = Path(__file__).resolve().parents[1] / 'custom_components/tracearr_ha/frontend.py'
VERSION = json.loads(FRONTEND.with_name('manifest.json').read_text())['version']
MODULE = '/tracearr_ha/tracearr-card.js'
RESOURCE = {'res_type': 'module', 'url': f'{MODULE}?v={VERSION}'}


def load_register_function():
    # Extract actual function without importing HA, so these tests run in CI.
    tree = ast.parse(FRONTEND.read_text())
    node = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'async_register_frontend')
    module = ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[]))
    namespace = {
        '__file__': str(FRONTEND),
        'Path': Path,
        'StaticPathConfig': lambda url, path, cache: (url, path, cache),
        'FRONTEND_URL': '/tracearr_ha/tracearr-card.js',
        'TracearrArtworkView': lambda: object(),
    }
    exec(compile(module, str(FRONTEND), 'exec'), namespace)
    return namespace['async_register_frontend']


class Resources:
    def __init__(self, entries=None):
        self.loaded = False
        self.items = list(entries or [])
        self.created = []
        self.updated = []

    async def async_load(self):
        self.loaded = True

    def async_items(self):
        assert self.loaded, 'Resources must be loaded before reading'
        return self.items

    async def async_create_item(self, item):
        self.created.append(item)
        self.items.append({'id': 'created', **item})

    async def async_update_item(self, id, item):
        self.updated.append((id, item))


class Http:
    def __init__(self):
        self.paths = []
        self.views = []

    async def async_register_static_paths(self, paths):
        self.paths.extend(paths)

    def register_view(self, view):
        self.views.append(view)


def test_storage_mode_2026_has_no_mode_attr():
    resources = Resources()
    hass = SimpleNamespace(data={'lovelace': SimpleNamespace(resource_mode='storage', resources=resources)}, http=Http())
    asyncio.run(load_register_function()(hass))
    assert resources.created == [RESOURCE]
    assert len(hass.http.paths) == 1
    assert len(hass.http.views) == 1


def test_legacy_mode_and_existing_resource_updated():
    resources = Resources([{'id': 'old', 'res_type': 'module', 'url': f'{MODULE}?v=0.1.16'}])
    hass = SimpleNamespace(data={'lovelace': SimpleNamespace(mode='storage', resources=resources)}, http=Http())
    asyncio.run(load_register_function()(hass))
    assert resources.created == []
    assert resources.updated == [('old', RESOURCE)]


def test_current_resource_unchanged():
    resources = Resources([{'id': 'current', **RESOURCE}])
    hass = SimpleNamespace(data={'lovelace': SimpleNamespace(resource_mode='storage', resources=resources)}, http=Http())
    asyncio.run(load_register_function()(hass))
    assert not resources.created and not resources.updated


def test_manifest_version_matches_distributed_js():
    banner = (FRONTEND.parent / 'frontend' / 'tracearr-card.js').read_text().splitlines()[0]
    assert banner.startswith(f'/* Tracearr HA Lovelace cards {VERSION} - ')


def test_yaml_mode_does_not_edit_resources():
    resources = Resources()
    hass = SimpleNamespace(data={'lovelace': SimpleNamespace(resource_mode='yaml', resources=resources)}, http=Http())
    asyncio.run(load_register_function()(hass))
    assert not resources.created and not resources.updated and not resources.loaded


def test_absent_lovelace_does_not_crash():
    hass = SimpleNamespace(data={}, http=Http())
    asyncio.run(load_register_function()(hass))
    assert len(hass.http.paths) == 1

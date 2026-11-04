"""Bulk GUI options retain stored values and change only selected records.

The OptionsFlow is checked without importing Home Assistant or Voluptuous.
"""
from __future__ import annotations

import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace

SOURCE = Path(__file__).resolve().parents[1] / 'custom_components/tracearr_ha/config_flow.py'


class FakeVol:
    class Key:
        def __init__(self, label, default=''):
            self.label = label
            self.default = default

    @staticmethod
    def Optional(label, default=''):
        return FakeVol.Key(label, default)

    @staticmethod
    def In(choices):
        return choices

    @staticmethod
    def Schema(data):
        return data


def get_methods():
    module = ast.parse(SOURCE.read_text())
    cls = next(node for node in module.body if isinstance(node, ast.ClassDef) and node.name == 'TracearrOptionsFlow')
    nodes = []
    for node in cls.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in {
            '_unique_fields', 'async_step_devices_table', 'async_step_aliases_table',
        }:
            node.decorator_list = []
            nodes.append(node)
    scope = {'vol': FakeVol, 'CONF_ALIASES': 'aliases', 'CONF_NETWORK_LOCATIONS': 'network_locations'}
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])), str(SOURCE), 'exec'), scope)
    return scope


class Flow:
    def __init__(self, options, device_records=None, user_records=None):
        self.config_entry = SimpleNamespace(options=options)
        self.device_records = device_records or {}
        self.user_records = user_records or {}
        self._unique_fields = get_methods()['_unique_fields']
        self._unique_fields = lambda labels: get_methods()['_unique_fields'](labels)

    async def _load_devices(self):
        return self.device_records

    async def _load_accounts(self):
        return self.user_records

    def async_show_form(self, step_id, data_schema):
        return {'step': step_id, 'fields': {k.label: k.default for k in data_schema}}

    def async_create_entry(self, title, data):
        return {'saved': data}

    def async_abort(self, reason):
        return {'abort': reason}

    async def async_step_network_manual(self):
        return {'fallback': 'manual'}


def test_device_table_prefills_saved_local_and_remote_and_saves_multiple():
    funcs = get_methods()
    flow = Flow(
        {'network_locations': {'srv:device:Shield': 'local'}, 'aliases': {'a': 'Alice'}},
        device_records={'srv:device:Shield': 'PLEX · Shield (appareil)',
                        'srv:device:TV': 'JELLYFIN · TV (appareil)'},
    )
    rendered = asyncio.run(funcs['async_step_devices_table'](flow))
    assert rendered['fields']['PLEX · Shield (appareil)'] == 'local'
    assert rendered['fields']['JELLYFIN · TV (appareil)'] == 'unknown'
    user_input = {'PLEX · Shield (appareil)': 'remote', 'JELLYFIN · TV (appareil)': 'local'}
    saved = asyncio.run(funcs['async_step_devices_table'](flow, user_input))['saved']
    assert saved['network_locations'] == {'srv:device:Shield': 'remote', 'srv:device:TV': 'local'}
    assert saved['aliases'] == {'a': 'Alice'}
    flow.config_entry.options = saved
    reopened = asyncio.run(funcs['async_step_devices_table'](flow))
    assert reopened['fields']['PLEX · Shield (appareil)'] == 'remote'
    assert reopened['fields']['JELLYFIN · TV (appareil)'] == 'local'


def test_aliases_table_edits_multiple_and_preserves_avatars():
    funcs = get_methods()
    flow = Flow(
        {'aliases': {'id1:alice': 'Alice maison'}, 'avatars': {'id1:alice': 'https://example.org/a.png'}},
        user_records={'id1:alice':'PLEX · alice', 'id2:bob': 'JELLYFIN · bob'},
    )
    form = asyncio.run(funcs['async_step_aliases_table'](flow))
    assert form['fields'] == {'JELLYFIN · bob':'', 'PLEX · alice': 'Alice maison'}
    saved = asyncio.run(funcs['async_step_aliases_table'](flow, {
        'PLEX · alice': 'Alice', 'JELLYFIN · bob': 'Bob maison',
    }))['saved']
    assert saved['aliases'] == {'id1:alice':'Alice','id2:bob':'Bob maison'}
    assert saved['avatars'] == {'id1:alice':'https://example.org/a.png'}
    flow.config_entry.options=saved
    reopened=asyncio.run(funcs['async_step_aliases_table'](flow))
    assert reopened['fields']['JELLYFIN · bob']=='Bob maison'


def test_bulk_unknown_removes_only_target_and_keeps_old_inactive():
    funcs=get_methods()
    flow=Flow({'network_locations':{'srv:device:Shield':'remote','device:Old Box':'local'}},
        device_records={'srv:device:Shield':'PLEX · Shield'})
    result=asyncio.run(funcs['async_step_devices_table'](flow,{'PLEX · Shield':'unknown'}))['saved']
    assert result['network_locations']=={'device:Old Box':'local'}

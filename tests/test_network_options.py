"""Regression tests for the integration's global client network classifications.

These tests load only selected methods (without requiring Home Assistant in the test environment).
"""
from __future__ import annotations

import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace

SOURCE = Path(__file__).resolve().parents[1] / 'custom_components/tracearr_ha/config_flow.py'


def methods():
    module = ast.parse(SOURCE.read_text(encoding='utf-8'))
    cls = next(node for node in module.body if isinstance(node, ast.ClassDef) and node.name == 'TracearrOptionsFlow')
    selected = [node for node in cls.body if isinstance(node, ast.AsyncFunctionDef) and node.name in {
        '_load_devices', 'async_step_network_location',
    }]
    scope = {'DOMAIN':'tracearr_ha','CONF_NETWORK_LOCATIONS':'network_locations','CONF_URL':'url'}
    exec(compile(ast.fix_missing_locations(ast.Module(body=selected,type_ignores=[])), str(SOURCE),'exec'),scope)
    return scope


class DummyFlow:
    _chosen_device = None
    def __init__(self, options=None, streams=None):
        self.config_entry = SimpleNamespace(entry_id='entry-1',options=options or {})
        self.hass = SimpleNamespace(data={'tracearr_ha':{'entry-1':SimpleNamespace(streams=streams or {})}})
    def async_create_entry(self, title, data):
        return data


def test_detects_multiple_clients_and_retains_inactive_saved_devices():
    functions = methods()
    streams = {'x':{'server_id':'server-a','server_name':'Plex','device':'Shield','player':'Plex Android'}}
    flow = DummyFlow({'network_locations':{'device:Old TV':'local'}},streams)
    devices = asyncio.run(functions['_load_devices'](flow))
    assert 'server-a:device:Shield' in devices
    assert 'server-a:player:Plex Android' in devices
    assert 'device:Old TV' in devices


def test_location_update_preserves_existing_aliases_and_avatars():
    functions = methods()
    options = {'aliases':{'plex:alice':'Alice'},'avatars':{'plex:alice':'https://example.com/a.png'},'network_locations':{'device:Old TV':'local'}}
    flow = DummyFlow(options)
    flow._chosen_device='server-a:device:Shield'
    result=asyncio.run(functions['async_step_network_location'](flow,{'location':'remote'}))
    assert result['aliases']==options['aliases']
    assert result['avatars']==options['avatars']
    assert result['network_locations']=={'device:Old TV':'local','server-a:device:Shield':'remote'}
    assert 'server-a:device:Shield' not in options['network_locations']


def test_location_unknown_removes_only_selected_device():
    functions = methods()
    flow=DummyFlow({'network_locations':{'device:Apple TV':'local','device:Shield':'remote'},'aliases':{'a':'A'}})
    flow._chosen_device='device:Shield'
    result=asyncio.run(functions['async_step_network_location'](flow,{'location':'unknown'}))
    assert result['network_locations']=={'device:Apple TV':'local'}
    assert result['aliases']=={'a':'A'}

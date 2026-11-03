"""Configure Tracearr HA via Settings > Devices & services."""
from __future__ import annotations

import json
from urllib.parse import urlparse

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import TracearrAuthError, TracearrClient, TracearrError
from .const import CONF_ALIASES, CONF_AVATARS, CONF_NETWORK_LOCATIONS, CONF_TOKEN, CONF_URL, DOMAIN


def clean_url(value: str) -> str:
    """Require explicit HTTP(S) endpoint; HTTPS is recommended for remote hosts."""
    value = value.strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Invalid Tracearr URL")
    return value


class TracearrConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Create unique entries by base Tracearr URL."""
    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}
        if user_input is not None:
            try:
                url = clean_url(user_input[CONF_URL])
                client = TracearrClient(async_get_clientsession(self.hass), url, user_input[CONF_TOKEN].strip())
                await client.servers()
            except (ValueError, TracearrError) as exc:
                errors["base"] = "invalid_auth" if isinstance(exc, TracearrAuthError) else "cannot_connect"
            else:
                await self.async_set_unique_id(url.lower())
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=f"Tracearr ({urlparse(url).hostname})", data={CONF_URL: url, CONF_TOKEN: user_input[CONF_TOKEN].strip()})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({
            vol.Required(CONF_URL, default="http://localhost:3000"): str,
            vol.Required(CONF_TOKEN): str,
        }), errors=errors)

    @staticmethod
    def async_get_options_flow(config_entry):
        return TracearrOptionsFlow()


class TracearrOptionsFlow(config_entries.OptionsFlow):
    """Edit aliases individually; advanced JSON is available for bulk changes."""

    def __init__(self):
        self._accounts = None
        self._chosen_account = None
        self._chosen_device = None

    async def async_step_init(self, user_input=None):
        return self.async_show_menu(step_id="init", menu_options=["user_alias", "network_device", "network_manual", "network_json", "raw_maps"])

    async def _load_accounts(self) -> dict[str, str]:
        if self._accounts is not None:
            return self._accounts
        client = TracearrClient(async_get_clientsession(self.hass), self.config_entry.data[CONF_URL], self.config_entry.data[CONF_TOKEN])
        self._accounts = {}
        try:
            identities = await client.users()
            for identity in identities:
                for account in identity.get("accounts", []):
                    key = f"{account.get('server_id')}:{account.get('username')}"
                    if account.get("username") and account.get("server_id"):
                        self._accounts[key] = f"{account.get('server_type', 'media').upper()} · {account['username']} ({identity.get('username','')})"
        except TracearrError:
            # Active usernames remain configurable even when /users is unavailable.
            self._accounts = {}
        coordinator = self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id)
        if coordinator:
            for stream in coordinator.streams.values():
                key = f"{stream.get('server_id')}:{stream.get('username')}"
                self._accounts.setdefault(key, f"{stream.get('server_name')} · {stream.get('username')}")
        return self._accounts

    async def async_step_user_alias(self, user_input=None):
        accounts = await self._load_accounts()
        if not accounts:
            return self.async_abort(reason="no_users")
        if user_input is not None:
            self._chosen_account = user_input["account"]
            return await self.async_step_edit_alias()
        return self.async_show_form(step_id="user_alias", data_schema=vol.Schema({
            vol.Required("account"): vol.In(accounts),
        }))

    async def async_step_edit_alias(self, user_input=None):
        key = self._chosen_account
        if key is None:
            return await self.async_step_user_alias()
        aliases = dict(self.config_entry.options.get(CONF_ALIASES, {}))
        avatars = dict(self.config_entry.options.get(CONF_AVATARS, {}))
        if user_input is not None:
            if user_input.get("alias", "").strip():
                aliases[key] = user_input["alias"].strip()
            else:
                aliases.pop(key, None)
            if user_input.get("avatar", "").strip():
                avatars[key] = user_input["avatar"].strip()
            else:
                avatars.pop(key, None)
            return self.async_create_entry(title="", data={**self.config_entry.options, CONF_ALIASES: aliases, CONF_AVATARS: avatars})
        return self.async_show_form(step_id="edit_alias", data_schema=vol.Schema({
            vol.Optional("alias", default=aliases.get(key, "")): str,
            vol.Optional("avatar", default=avatars.get(key, "")): str,
        }), description_placeholders={"account": key})

    async def _load_devices(self) -> dict[str, str]:
        """Use the observed active devices and previously saved classifications."""
        devices = {}
        coordinator = self.hass.data.get(DOMAIN, {}).get(self.config_entry.entry_id)
        if coordinator:
            for stream in coordinator.streams.values():
                server = stream.get("server_name") or stream.get("server_type") or "Serveur"
                server_id = stream.get("server_id")
                device = str(stream.get("device") or "").strip()
                player = str(stream.get("player") or "").strip()
                if device:
                    key = f"{server_id}:device:{device}" if server_id else f"device:{device}"
                    devices[key] = f"{server} · {device} (appareil)"
                if player:
                    key = f"{server_id}:player:{player}" if server_id else f"player:{player}"
                    devices[key] = f"{server} · {player} (lecteur)"
        for key in self.config_entry.options.get(CONF_NETWORK_LOCATIONS, {}):
            devices.setdefault(key, f"{key} (enregistré)")
        return dict(sorted(devices.items(), key=lambda item:item[1].casefold()))

    async def async_step_network_device(self, user_input=None):
        """Select a known client using a menu similar to the alias picker."""
        devices = await self._load_devices()
        if not devices:
            return await self.async_step_network_manual()
        if user_input is not None:
            self._chosen_device = user_input["device"]
            return await self.async_step_network_location()
        return self.async_show_form(step_id="network_device", data_schema=vol.Schema({
            vol.Required("device"): vol.In(devices),
        }))

    async def async_step_network_manual(self, user_input=None):
        """Allow classification even when the media client is not playing."""
        errors = {}
        if user_input is not None:
            name = str(user_input["name"]).strip()
            if not name or len(name) > 120:
                errors["base"] = "invalid_device"
            else:
                self._chosen_device = f"{user_input['match_type']}:{name}"
                return await self.async_step_network_location()
        return self.async_show_form(step_id="network_manual", data_schema=vol.Schema({
            vol.Required("match_type", default="device"): vol.In({
                "device": "Nom de l’appareil (device)", "player": "Nom du lecteur (player)",
            }),
            vol.Required("name"): str,
        }), errors=errors)

    async def async_step_network_location(self, user_input=None):
        """Set the selected player as LAN, WAN, or unknown (remove override)."""
        key = self._chosen_device
        if not key:
            return await self.async_step_network_device()
        mapping = dict(self.config_entry.options.get(CONF_NETWORK_LOCATIONS, {}))
        if user_input is not None:
            location = user_input["location"]
            if location == "unknown":
                mapping.pop(key, None)
            else:
                mapping[key] = location
            return self.async_create_entry(title="", data={
                **self.config_entry.options, CONF_NETWORK_LOCATIONS:mapping,
            })
        return self.async_show_form(step_id="network_location", data_schema=vol.Schema({
            vol.Required("location", default=mapping.get(key, "unknown")): vol.In({
                "unknown": "Non classé / supprimer la règle",
                "local": "Local (LAN)", "remote": "Distant (WAN)",
            }),
        }), description_placeholders={"device":key})

    async def async_step_network_json(self, user_input=None):
        """Expert bulk editor for inactive devices; refuse unexpected values."""
        errors = {}
        if user_input is not None:
            try:
                data = json.loads(user_input[CONF_NETWORK_LOCATIONS])
                if not isinstance(data,dict) or any(
                    not isinstance(key,str) or not isinstance(value,str) or
                    value not in ("local", "remote") or not key.strip()
                    for key,value in data.items()
                ):
                    raise ValueError("Invalid network mapping")
            except (ValueError, TypeError):
                errors["base"] = "invalid_json"
            else:
                return self.async_create_entry(title="", data={
                    **self.config_entry.options, CONF_NETWORK_LOCATIONS:data,
                })
        return self.async_show_form(step_id="network_json", data_schema=vol.Schema({
            vol.Required(CONF_NETWORK_LOCATIONS, default=json.dumps(
                self.config_entry.options.get(CONF_NETWORK_LOCATIONS, {}), ensure_ascii=False,
            )): str,
        }), errors=errors)

    async def async_step_raw_maps(self, user_input=None):
        errors = {}
        if user_input is not None:
            try:
                aliases = json.loads(user_input[CONF_ALIASES])
                avatars = json.loads(user_input[CONF_AVATARS])
                if not isinstance(aliases, dict) or not isinstance(avatars, dict):
                    raise ValueError("Object expected")
                aliases = {str(k): str(v) for k, v in aliases.items() if v}
                avatars = {str(k): str(v) for k, v in avatars.items() if v}
            except (ValueError, TypeError):
                errors["base"] = "invalid_json"
            else:
                return self.async_create_entry(title="", data={**self.config_entry.options, CONF_ALIASES: aliases, CONF_AVATARS: avatars})
        return self.async_show_form(step_id="raw_maps", data_schema=vol.Schema({
            vol.Required(CONF_ALIASES, default=json.dumps(self.config_entry.options.get(CONF_ALIASES, {}), ensure_ascii=False)): str,
            vol.Required(CONF_AVATARS, default=json.dumps(self.config_entry.options.get(CONF_AVATARS, {}), ensure_ascii=False)): str,
        }), errors=errors)

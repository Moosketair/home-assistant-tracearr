"""Configure Tracearr HA via Settings > Devices & services."""
from __future__ import annotations

import json
from urllib.parse import urlparse

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import TracearrAuthError, TracearrClient, TracearrError
from .const import CONF_ALIASES, CONF_AVATARS, CONF_TOKEN, CONF_URL, DOMAIN


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

    async def async_step_init(self, user_input=None):
        return self.async_show_menu(step_id="init", menu_options=["user_alias", "raw_maps"])

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
            return self.async_create_entry(title="", data={CONF_ALIASES: aliases, CONF_AVATARS: avatars})
        return self.async_show_form(step_id="edit_alias", data_schema=vol.Schema({
            vol.Optional("alias", default=aliases.get(key, "")): str,
            vol.Optional("avatar", default=avatars.get(key, "")): str,
        }), description_placeholders={"account": key})

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
                return self.async_create_entry(title="", data={CONF_ALIASES: aliases, CONF_AVATARS: avatars})
        return self.async_show_form(step_id="raw_maps", data_schema=vol.Schema({
            vol.Required(CONF_ALIASES, default=json.dumps(self.config_entry.options.get(CONF_ALIASES, {}), ensure_ascii=False)): str,
            vol.Required(CONF_AVATARS, default=json.dumps(self.config_entry.options.get(CONF_AVATARS, {}), ensure_ascii=False)): str,
        }), errors=errors)

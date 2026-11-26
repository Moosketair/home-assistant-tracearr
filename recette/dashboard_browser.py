"""Chromium smoke test against actual HA, keeping the same profile across upgrade."""
import hashlib
import json
from pathlib import Path
import sys

import requests
from playwright.sync_api import expect, sync_playwright

from dashboard_seed import BASE, PASSWORD, USER


def scenario(name):
    requests.post(f"http://127.0.0.1:18425/scenario/{name}", timeout=5).raise_for_status()


def playback(page, group, single, proofs):
    timer = single.locator(".time-current")
    before = timer.text_content()
    expect(timer).not_to_have_text(before)
    badge = group.nth(0).locator('[data-badge=streams]')
    badge.evaluate("(e) => { window.fixtureBadge = e; window.fixtureAnimation = e.getAnimations()[0]; }")
    scenario("progress")
    scenario("pause")
    expect(single.locator(".time-paused")).to_have_text("En pause")
    assert badge.evaluate("(e) => e === window.fixtureBadge && !!window.fixtureAnimation && "
                          "e.getAnimations()[0] === window.fixtureAnimation && "
                          "window.fixtureAnimation.currentTime > 0")
    layout = []
    for width in (1400, 430):
        page.set_viewport_size({"width": width, "height": 1000})
        expect(badge).to_be_visible()
        page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
        geometry = badge.evaluate("""e => {
          const measure = el => el.getBoundingClientRect();
          const badge = measure(e), header = measure(e.closest('.head-metrics'));
          const others = [...e.closest('.head-metrics').querySelectorAll('.metric')]
            .filter(el => el !== e).map(measure);
          const overlap = others.some(r => r.left < badge.right && r.right > badge.left
            && r.top < badge.bottom && r.bottom > badge.top);
          return {width: header.width, inside: badge.left >= header.left - 1
            && badge.right <= header.right + 1, overlap,
            offset: (badge.left + badge.right - header.left - header.right) / 2};
        }""")
        assert geometry["inside"] and not geometry["overlap"], geometry
        layout.append(geometry)
    page.set_viewport_size({"width": 1400, "height": 1000})
    paused = timer.text_content()
    page.wait_for_timeout(1200)
    expect(timer).to_have_text(paused)
    scenario("play")
    expect(single.locator(".time-paused")).to_have_count(0)
    scenario("down")
    for card in (group.nth(0), group.nth(1), single):
        expect(card.locator(".availability-status")).to_contain_text("données non actualisées",
                                                                    timeout=80000)
    frozen = timer.text_content()
    page.wait_for_timeout(1200)
    expect(timer).to_have_text(frozen)
    page.screenshot(path=proofs / "panne.png", animations="disabled")
    scenario("recover")
    expect(single.locator(".availability-status")).to_have_text("", timeout=80000)
    expect(timer).to_have_text("0:12", timeout=5000)
    expect(timer).not_to_have_text("0:12")
    return layout


def editor(page, proofs):
    def config():
        return page.evaluate("""() => {
          const hass = document.querySelector('home-assistant').hass;
          const url_path = location.pathname.split('/')[1];
          return hass.callWS({type: 'lovelace/config', url_path});
        }""")["views"][0]["sections"]

    baseline = config()
    page.get_by_role("button", name="Modifier le tableau de bord").click()
    for index, key in ((0, "mode"), (2, "selected_account")):
        button = page.get_by_role("button", name="Edit card").nth(index)
        button.press("Enter")
        form = page.locator("tracearr-card-editor")
        field = form.locator(f"select[data-field={key}]")
        original = field.input_value()
        compact = form.get_by_role("checkbox", name="Mode compact")
        previous = compact.is_checked()
        compact.set_checked(not previous)
        page.get_by_role("button", name="Enregistrer", exact=True).click()
        expect(form).to_have_count(0)
        button.press("Enter")
        expect(field).to_have_value(original)
        assert compact.is_checked() is not previous
        if index == 2:
            page.screenshot(path=proofs / "editeur.png", animations="disabled")
        compact.set_checked(previous)
        page.get_by_role("button", name="Enregistrer", exact=True).click()
        expect(form).to_have_count(0)
    page.get_by_role("button", name="Terminer").click()
    for old_section, new_section in zip(baseline, config(), strict=True):
        for old, new in zip(old_section["cards"], new_section["cards"], strict=True):
            for key in ("type", "entry_id", "bitrate_scope", "selection", "selected_account",
                        "grid_options", "header_badge_custom_color"):
                if key in old:
                    assert new[key] == old[key], key
            for key in ("align", "blink_positive", "blink_seconds"):
                assert new["header_metric_settings"]["streams"][key] == (
                    old["header_metric_settings"]["streams"][key]
                ), key


def reauth(page):
    from dashboard_sim import NEXT_KEY

    def ws(kind, **fields):
        return page.evaluate("""msg => document.querySelector('home-assistant').hass.callWS(msg)""",
                             {"type": kind, **fields})

    original = ws("tracearr_ha/get")["entries"][0]["id"]
    expected = {
        "fr": "Remplacer la clé API Tracearr",
        "en": "Replace the Tracearr API key",
    }
    for language, title in expected.items():
        values = ws("frontend/get_translations", language=language, category="config",
                    integration="tracearr_ha")["resources"]
        assert values["component.tracearr_ha.config.step.reauth_confirm.title"] == title
        assert values["component.tracearr_ha.config.error.invalid_auth"]
        assert values["component.tracearr_ha.config.abort.reauth_successful"]

    scenario("revoke")
    flow = page.evaluate("""async () => {
      const end = Date.now() + 80000;
      while (Date.now() < end) {
        const all = await document.querySelector('home-assistant').hass.callWS(
          {type: 'config_entries/flow/progress'});
        const pending = all.find(flow => flow.handler === 'tracearr_ha'
          && flow.context.source === 'reauth');
        if (pending) return pending.flow_id;
        await new Promise(resolve => setTimeout(resolve, 750));
      }
      throw Error('Flux de réauthentification absent');
    }""")
    result = page.evaluate("""async ([flow, token]) => {
      const hass = document.querySelector('home-assistant').hass;
      const path = 'config/config_entries/flow/' + flow;
      const form = await hass.callApi('GET', path);
      const rejected = await hass.callApi('POST', path, {token: 'fixture_invalid'});
      const accepted = await hass.callApi('POST', path, {token});
      return [form.step_id, rejected.errors?.base, accepted.reason];
    }""", [flow, NEXT_KEY])
    assert result == ["reauth_confirm", "invalid_auth", "reauth_successful"], result
    assert page.evaluate("""async entry => {
      const end = Date.now() + 20000;
      while (Date.now() < end) {
        const data = await document.querySelector('home-assistant').hass.callWS({type: 'tracearr_ha/get'});
        if (data.entries.some(row => row.id === entry && row.connected && row.sse_connected))
          return true;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return false;
    }""", original)
    return {"flow": result, "titles": expected, "same_entry": True}


def check(root, version, view="lovelace/recette", suite="smoke"):
    errors, modules = [], []
    proofs = root / "preuves"
    proofs.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            root / "chromium", executable_path="/usr/bin/chromium",
            viewport={"width": 1400, "height": 1000},
        )
        page = context.pages[0]
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda msg: errors.append({"text": msg.text, "location": msg.location})
                if msg.type == "error" else None)
        page.on("response", lambda response: modules.append(response)
                if "/tracearr_ha/tracearr-card.js?" in response.url else None)
        page.goto(f"{BASE}/{view}", wait_until="domcontentloaded")
        username = page.locator("input[name=username]")
        sections = page.locator("hui-sections-view")
        expect(username.or_(sections).first).to_be_visible(timeout=20000)
        if username.is_visible():
            username.fill(USER)
            page.locator("input[name=password]").fill(PASSWORD)
            page.get_by_role("button", name="Se connecter", exact=True).or_(
                page.get_by_role("button", name="Log in", exact=True)
            ).first.click()
        expect(sections).to_be_visible(timeout=20000)
        prompt = page.get_by_role("button", name="Confirmer", exact=True)
        if prompt.is_visible():
            prompt.click()
        group = page.locator("tracearr-streams-card")
        single = page.locator("tracearr-stream-card")
        expect(group).to_have_count(2)
        expect(single).to_contain_text("Orbite de recette")
        expect(group.nth(0)).to_contain_text("8.0 Mb/s")
        expect(group.nth(1)).to_contain_text("2.5 Mb/s")
        expect(group.nth(0).locator('.stream').filter(has_text="Voyage fictif")).not_to_contain_text("Mb/s")
        expect(group.nth(1).locator('.stream').filter(has_text="Orbite de recette")).not_to_contain_text("Mb/s")
        expect(group.nth(1).locator('.stream').filter(has_text="Voyage fictif")).to_contain_text("2.5 Mb/s")
        expect(group.nth(1).locator(".streams.carousel .stream")).to_have_count(2)
        carousel = group.nth(1)
        track = carousel.locator(".streams.carousel")
        carousel.get_by_role("button", name="Suivant").click()
        track.evaluate("""el => new Promise((resolve, reject) => {
            const deadline = performance.now() + 3000;
            function check() {
                if (el.scrollLeft > 10) resolve();
                else if (performance.now() > deadline) reject(new Error('carrousel immobile'));
                else requestAnimationFrame(check);
            }
            check();
        })""")
        carousel.get_by_role("button", name="Précédent").click()
        assert len(modules) == 1, [r.url for r in modules]
        response = modules[0]
        assert response.url.endswith(f"?v={version}") and response.ok
        body = response.body()
        assert body.splitlines()[0].startswith(f"/* Tracearr HA Lovelace cards {version} - ".encode())
        module = hashlib.sha256(body).hexdigest()
        rendered = single.locator(".stream").inner_text()
        page.wait_for_function("document.querySelector('home-assistant')?.hass?.connected")
        result = {"url": response.url, "status": response.status, "sha256": module,
                  "individual": rendered, "console_errors": errors}
        label = f"{version}-{view.split('/')[0]}"
        page.screenshot(path=proofs / f"{label}.png", animations="disabled")
        if suite in {"full", "playback"}:
            result["badge_layout"] = playback(page, group, single, proofs)
            result["playback"] = "pause, progression, animation continue, centrage, panne, reprise"
        if suite in {"full", "editor"}:
            editor(page, proofs)
            result["editors"] = "saved, reopened, restored"
        if suite in {"full", "reauth"}:
            result["reauth"] = reauth(page)
        context.close()
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    check(Path(sys.argv[1]), *sys.argv[2:])

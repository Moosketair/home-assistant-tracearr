"""Targeted 6D.1 browser checks on the cloned 4.2 dashboard (Core 2026.11.3)."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import re
import sys

from playwright.sync_api import expect, sync_playwright

from dashboard_browser import scenario
from dashboard_seed import BASE, PASSWORD, USER


STABLE = "0.1.17"
CANDIDATE = "0.1.18-beta.1"
VIEW = "lovelace/recette"
YAML_VIEW = "tracearr-yaml/recette"


def open_view(page, view):
    page.goto(f"{BASE}/{view}", wait_until="domcontentloaded")
    login = page.locator("input[name=username]")
    sections = page.locator("hui-sections-view")
    expect(login.or_(sections).first).to_be_visible(timeout=20000)
    if login.is_visible():
        login.fill(USER)
        page.locator("input[name=password]").fill(PASSWORD)
        page.get_by_role("button", name=re.compile("^(Se connecter|Log in)$")).click()
    expect(sections).to_be_visible(timeout=20000)
    prompt = page.get_by_role("button", name="Confirmer", exact=True)
    if prompt.is_visible():
        prompt.click()


def appearance(page):
    cards = page.locator("tracearr-streams-card, tracearr-stream-card")
    expect(cards).to_have_count(3)
    expect(cards.last.locator(".stream")).to_contain_text("Orbite de recette")
    for index, count in enumerate((2, 2, 1)):
        expect(cards.nth(index).locator(".stream")).to_have_count(count)
    page.evaluate("""async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }""")
    return cards.evaluate_all("""cards => cards.map(card => {
      const root = card.shadowRoot;
      const surface = root.querySelector('ha-card').getBoundingClientRect();
      return [...root.querySelectorAll('ha-card,.head,.metric,.title,.meta,.meta > *, .times')].map(el => {
        const box = el.getBoundingClientRect(), css = getComputedStyle(el);
        return {tag:el.localName, classes:el.className,
          text:el.matches('.metric,.title,.meta > *') ? el.textContent.trim() : null,
          box:[box.x-surface.x,box.y-surface.y,box.width,box.height].map(n=>Math.round(n*64)/64),
          css:[css.color,css.backgroundColor,css.borderRadius,css.fontFamily,css.fontSize]};
      });
    })""")


def saved_cards(page):
    return page.evaluate("""async () => (await document.querySelector('home-assistant').hass.callWS(
      {type:'lovelace/config',url_path:'lovelace'})).views[0].sections.flatMap(s=>s.cards)""")


def set_color(field, color):
    # Playwright cannot fill input[type=color]; send the native input/change
    # events used when the Chromium color picker commits a value.
    field.evaluate("""(input,color) => {
      input.value=color;
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }""", color)


def open_details(form, field):
    for details in field.evaluate(
        """el => {const result=[]; for(let node=el.parentElement;node;node=node.parentElement)
          if(node.matches('details')) result.unshift(node.hasAttribute('data-section') ?
            ['section',node.dataset.section] : ['subdetail',node.dataset.subdetail]);
          return result;}"""
    ):
        key, value = details
        panel = form.locator(f'details[data-{key}="{value}"]')
        if panel.get_attribute("open") is None:
            panel.locator(":scope > summary").click()


def technical_signature(block):
    return block.evaluate("""el => ({
      style:el.className, layout:el.dataset.layout,
      badges:[...el.querySelectorAll('[data-tech]')].map(b=>[b.dataset.tech,
        !!b.querySelector('.tech-swatch'),b.dataset.tech==='video_codec' ? b.innerText : null])
    })""")


def badge_style(badge):
    return badge.evaluate("""el => {
      const css = getComputedStyle(el);
      return [css.getPropertyValue('--tech-color').trim(),css.borderRadius,css.fontSize,css.fontWeight];
    }""")


def edit(page, proofs):
    scenario("grid-one")
    group = page.locator("tracearr-streams-card").first
    single = page.locator("tracearr-stream-card")
    expect(group.locator(".stream")).to_have_count(1)
    other_badge = group.locator('[data-badge="bandwidth"]')
    other_background = other_badge.evaluate("el => getComputedStyle(el).backgroundColor")
    baseline = saved_cards(page)
    page.get_by_role("button", name="Modifier le tableau de bord").click()
    button = page.get_by_role("button", name="Edit card")
    form = page.locator("tracearr-card-editor")
    style = form.locator('[data-field="technical_badge_style"]')
    layout = form.locator('[data-field="technical_badge_layout"]')
    mode = form.locator('[data-field="technical_transcode_mode"]')
    preview = form.locator(".tech-preview")
    hdr = form.locator('[data-tech-visible="hdr"]')
    color = form.locator('[data-tech-color="hevc"]')
    normal = '[data-metric-key="streams"][data-metric-setting="normal_custom_color"]'
    save = page.get_by_role("button", name="Enregistrer", exact=True)

    button.nth(0).press("Enter")
    open_details(form, style)
    for value in ("premium", "cinema", "minimal", "technical", "classic"):
        style.select_option(value)
        if value == "classic":
            expect(preview.locator(".technical")).to_have_count(0)
        else:
            expect(preview.locator(f".tech-{value}")).to_be_visible()
    style.select_option("technical")
    video = form.locator('[data-tech-visible="video_codec"]')
    open_details(form, video)
    video.check()
    mode.select_option("destination")
    expect(preview.locator('[data-tech="video_codec"]')).to_contain_text("H.264")
    expect(preview.locator('[data-tech="video_codec"]')).not_to_contain_text("HEVC")
    mode.select_option("source_to_destination")
    expect(preview.locator('[data-tech="video_codec"]')).to_contain_text("HEVC")
    expect(preview.locator('[data-tech="hdr"]')).to_have_attribute("title", re.compile("destination inconnue"))
    expect(preview.locator('[data-tech="hdr"]')).not_to_contain_text(re.compile("source", re.I))
    open_details(form, hdr)
    hdr.uncheck()
    row = form.locator('.order-row:has([data-tech-visible="video_codec"])')
    up = row.locator('button[data-direction="-1"]')
    up.click()
    up.click()
    expect(preview.locator("[data-tech]").first).to_have_attribute("data-tech", "video_codec")
    layout.select_option("separate")
    expect(preview.locator(".tech-row")).not_to_have_count(1)
    open_details(form, color)
    original = color.input_value()
    set_color(color, "#336699")
    form.locator('[data-tech-reset="hevc"]').click()
    expect(color).to_have_value(original)
    set_color(color, "#336699")
    form.locator('[data-tech-reset="all"]').click()
    expect(color).to_have_value(original)
    set_color(color, "#336699")
    for key in ("audio_format", "audio_codec", "channels", "container"):
        field = form.locator(f'[data-tech-visible="{key}"]')
        field.uncheck()
    form.locator('[data-subdetail="technical-order"] [data-field="show_bitrate"]').uncheck()
    signature = technical_signature(preview.locator(".technical"))
    source_style = badge_style(preview.locator('[data-tech="video_codec"] .tech-swatch').first)
    assert source_style[0] == "#336699"
    open_details(form, form.locator("select" + normal))
    form.locator("select" + normal).select_option("custom")
    set_color(form.locator("input" + normal), "#224466")
    zero = '[data-metric-key="streams"][data-metric-setting="zero_'
    form.locator(f'select{zero}color_mode"]').select_option("custom")
    set_color(form.locator(f'input{zero}custom_color"]'), "#663322")
    save.click()
    expect(form).to_have_count(0)

    button.nth(2).press("Enter")
    open_details(form, style)
    style.select_option("cinema")
    layout.select_option("compact")
    mode.select_option("destination")
    open_details(form, video)
    video.check()
    end = form.locator('[data-field="show_end_time"]')
    open_details(form, end)
    end.check()
    save.click()
    expect(form).to_have_count(0)
    page.get_by_role("button", name="Terminer").click()

    page.reload(wait_until="domcontentloaded")
    expect(group.locator(".tech-technical")).to_be_visible()
    assert technical_signature(group.locator(".technical")) == signature
    swatches = group.locator('[data-tech="video_codec"] .tech-swatch')
    # The editor preview uses the editor's font baseline, not the card's
    # configurable font size. Compare color, shape and weight across surfaces.
    actual_style = badge_style(swatches.first)
    assert actual_style[0] == source_style[0] and actual_style[3] == source_style[3]
    radius_ratio = lambda style: float(style[1][:-2]) / float(style[2][:-2])
    assert abs(radius_ratio(actual_style) - radius_ratio(source_style)) < .001
    assert badge_style(swatches.first)[1:] == badge_style(swatches.last)[1:]
    expect(single.locator(".tech-cinema")).to_have_attribute("data-layout", "compact")
    expect(single.locator('[data-tech="resolution"]')).to_have_text("1080p")
    expect(single.locator('[data-tech="hdr"]')).to_have_text("HDR10+")
    saved = saved_cards(page)
    for before, after in zip(baseline, saved, strict=True):
        for key in ("type", "entry_id", "grid_options", "selected_account", "bitrate_scope", "mode"):
            if key in before:
                assert before[key] == after[key], key
    assert saved[0]["technical_badge_custom_colors"] == {"hevc": "#336699"}
    assert saved[0]["technical_badge_visibility"]["hdr"] is False
    assert saved[0]["technical_badge_order"].startswith("video_codec,resolution,hdr,")
    badge = group.locator('[data-badge="streams"]')
    expect(badge).to_have_css("background-color", "rgb(34, 68, 102)")
    expect(other_badge).to_have_css("background-color", other_background)
    badge.evaluate("el => {window.fixturePulse = el.getAnimations()[0]}")
    scenario("progress")
    page.wait_for_function("""() => window.fixturePulse && window.fixturePulse.currentTime > 150""")
    pulse_time = badge.evaluate("""el => {
      const pulse = el.getAnimations()[0];
      return pulse === window.fixturePulse ? pulse.currentTime : null;
    }""")
    assert pulse_time is not None
    page.clock.set_fixed_time(datetime(2026,11,27,12,0,tzinfo=timezone.utc))
    expect(single.locator(".time-end")).to_have_text("Fin à 12:01")
    scenario("pause")
    status = single.locator(".time-paused")
    expect(status).to_have_text("En pause")
    remaining = single.locator(".time-remaining")
    frozen = remaining.text_content()
    assert status.bounding_box()["x"] > remaining.bounding_box()["x"]
    expect(single.locator(".time-end")).to_have_count(0)
    page.clock.set_fixed_time(datetime(2026,11,27,12,3,tzinfo=timezone.utc))
    page.wait_for_timeout(1200)
    expect(remaining).to_have_text(frozen)
    assert badge.evaluate("""(el,previous) => {
      const pulse = el.getAnimations()[0];
      return pulse === window.fixturePulse && pulse.currentTime > previous;
    }""", pulse_time)
    page.screenshot(path=proofs / "pause.png", animations="disabled")
    scenario("play")
    expect(single.locator(".time-end")).to_have_text("Fin à 12:04")
    scenario("grid-empty")
    expect(group.locator(".stream")).to_have_count(0)
    expect(badge).to_have_css("background-color", "rgb(102, 51, 34)")
    scenario("grid-one")
    expect(badge).to_have_css("background-color", "rgb(34, 68, 102)")

    page.get_by_role("button", name="Modifier le tableau de bord").click()
    for index, expected in ((2, ("cinema", "compact", "destination")),
                            (0, ("technical", "separate", "source_to_destination"))):
        button.nth(index).press("Enter")
        open_details(form, style)
        for field, value in zip((style, layout, mode), expected, strict=True):
            expect(field).to_have_value(value)
        if index == 0:
            expect(hdr).not_to_be_checked()
            expect(color).to_have_value("#336699")
            assert technical_signature(preview.locator(".technical")) == signature
            expect(form.locator("input" + normal)).to_have_value("#224466")
            expect(form.locator(f'input{zero}custom_color"]')).to_have_value("#663322")
            page.screenshot(path=proofs / "editeur.png", animations="disabled")
            open_details(form, form.locator("select" + normal))
            form.locator("select" + normal).select_option("inherit")
            save.click()
        else:
            page.get_by_role("button", name="Annuler", exact=True).click()
        expect(form).to_have_count(0)
    page.get_by_role("button", name="Terminer").click()
    expect(badge).not_to_have_css("background-color", "rgb(34, 68, 102)")
    default_background = badge.evaluate("el => getComputedStyle(el).backgroundColor")
    assert not saved_cards(page)[0]["header_metric_settings"]["streams"].get("normal_custom_color")
    scenario("grid-empty")
    expect(badge).to_have_css("background-color", "rgb(102, 51, 34)")
    return {"persisted": True, "preview": signature, "pause_remaining": frozen,
            "resumed_end": "12:04", "default_background": default_background}


def run(root, suite, module):
    version = STABLE if suite == "stable" else CANDIDATE
    proofs = root / "preuves"
    proofs.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            root / "chromium", executable_path="/usr/bin/chromium",
            viewport={"width":1400,"height":1000}, timezone_id="UTC",
            args=["--disable-background-networking"],
        )
        page = context.pages[0]
        page.set_default_timeout(8000)
        errors, responses = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("response", lambda response: responses.append(response)
                if "/tracearr_ha/tracearr-card.js?" in response.url else None)
        scenario("grid-one" if suite == "yaml" else "reset")
        open_view(page, YAML_VIEW if suite == "yaml" else VIEW)
        assert len(responses) == 1, [r.url for r in responses]
        response, = responses
        assert response.url.endswith(f"?v={version}") and response.ok
        digest = hashlib.sha256(response.body()).hexdigest()
        assert digest == hashlib.sha256(module.read_bytes()).hexdigest()
        result = {"url":response.url, "status":response.status, "sha256":digest}
        if suite == "yaml":
            card = page.locator("tracearr-stream-card")
            expect(card.locator(".tech-technical")).to_have_attribute("data-layout","separate")
            expect(card.locator('[data-tech="container"]')).to_have_count(0)
            codec = card.locator('[data-tech="video_codec"]')
            expect(codec).to_contain_text("HEVC")
            expect(codec).to_contain_text("H.264")
            assert codec.locator(".tech-swatch").first.evaluate(
                "el => el.style.getPropertyValue('--tech-color')") == "#399e92"
            result["yaml"] = technical_signature(card.locator(".technical"))
        else:
            result["appearance"] = appearance(page)
            if suite == "candidate":
                baseline = json.loads((proofs / "stable.json").read_text())
                if result["appearance"] != baseline["appearance"]:
                    (proofs / "appearance-candidate.json").write_text(
                        json.dumps(result["appearance"], ensure_ascii=False, indent=2) + "\n"
                    )
                    raise AssertionError("historical appearance differs")
                result["editor_playback"] = edit(page, proofs)
        assert not errors, errors
        (proofs / f"{suite}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        context.close()


if __name__ == "__main__":
    root, suite, module = sys.argv[1:]
    run(Path(root), suite, Path(module))

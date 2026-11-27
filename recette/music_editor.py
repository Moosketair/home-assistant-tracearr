"""Exercise the 6C.5 real editor and cards in isolated Chromium."""
import argparse
from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import expect, sync_playwright
import yaml

from music_showcase import ROOT, fixtures, open_view

OUTPUT = ROOT / "recette/preuves/6c.5"
HISTORICAL = """type: custom:tracearr-streams-card
show_year: false
show_counter: true
show_end_time: true
technical_badge_style: premium
technical_transcode_mode: source_to_destination
"""


def shot(locator, folder, name):
    image = Image.open(BytesIO(locator.screenshot(animations="disabled"))).convert("RGB")
    image.save(folder / f"{name}.webp", format="WEBP", quality=93, method=6)


def expand(page, group, sub):
    summary = page.locator(f'details[data-section="{group}"] > summary')
    if not summary.evaluate("el => el.parentElement.open"):
        summary.click()
    details = page.locator(f'details[data-subdetail="{sub}"]')
    if not details.evaluate("el => el.open"):
        details.locator(":scope > summary").click()
    return details


def edit(browser, images, output, individual=False):
    page, errors, _ = open_view(browser, "edition", images)
    historical = yaml.safe_load(HISTORICAL)
    if individual:
        historical.update(type="custom:tracearr-stream-card", selection="account", selected_account="jellyfin:Quinn")
    page.evaluate("(cfg) => musicEditorBench.open(cfg)", historical)
    page.evaluate("(cfg) => musicEditorBench.mountCard(cfg)", historical)
    card = page.locator("tracearr-stream-card" if individual else "tracearr-streams-card")
    expect(card.locator(".stream")).to_have_count(1 if individual else 4)
    if not individual:
        assert not card.locator('[data-session=film] .subtitle').count()
        expect(card.locator('[data-session=direct] .music-album')).to_have_text("Atlas nocturne · 2024")
        expect(card.locator('[data-session=direct] img.poster')).to_be_visible()
        shot(card, output, "mixte")
    filters = expand(page, "source", "media-filter")
    expect(filters.locator("input:checked")).to_have_count(4)
    if not individual:
        shot(filters, output, "filtres")
    for value in ("movie", "episode", "other"):
        filters.locator(f'input[data-media-type="{value}"]').uncheck()
    saved = page.evaluate("musicEditorBench.lastConfig()")
    assert saved["filter_media_types"] == ["track"]
    page.evaluate("(cfg) => musicEditorBench.apply(cfg)", saved)
    expect(card.locator(".stream")).to_have_count(1 if individual else 2)
    expect(card.locator(".music-cover")).to_have_count(1 if individual else 2)
    if not individual:
        shot(card, output, "musique-seule")
    fields = expand(page, "media", "music-fields")
    fields.locator('[data-music-field="track_number"]').check()
    fields.locator('[data-music-field="disc_number"]').check()
    fields.locator('[data-music-field="year"]').uncheck()
    fields.locator('[data-order="music_field_order"][data-index="1"][data-direction="-1"]').click()
    expect(fields.locator('[data-preview="music-fields"] .title')).to_have_text("Studio Sillage")
    if not individual:
        shot(fields, output, "metadonnees")
    badges = expand(page, "technical", "music-badges")
    expect(badges.locator('[data-music-badge="container"]')).not_to_be_checked()
    badges.locator('[data-music-badge="container"]').check()
    badges.locator('[data-music-badge="audio_bitrate"]').check()
    badges.locator('[data-music-badge="sample_rate"]').uncheck()
    badges.locator('[data-order="music_badge_order"][data-index="5"][data-direction="-1"]').click()
    expect(badges.locator('[data-preview="music"] [data-tech="audio_bitrate"]')).to_have_count(1)
    if not individual:
        shot(badges, output, "badges")
    saved = page.evaluate("musicEditorBench.lastConfig()")
    assert saved["music_field_order"].startswith("artist,title")
    assert saved["music_badge_order"].endswith("container,audio_bitrate")
    assert saved["music_field_visibility"] == {"track_number": True, "disc_number": True, "year": False}
    assert saved["music_badge_visibility"] == {"container": True, "audio_bitrate": True, "sample_rate": False}
    # HA storage/YAML are not mocked as implementations: serialize the actual
    # emitted config, parse it with a YAML parser and open a fresh editor/card.
    stored = yaml.safe_load(yaml.safe_dump(saved, allow_unicode=True))
    page.evaluate("(cfg) => {musicEditorBench.open(cfg,'en'); musicEditorBench.apply(cfg);}", stored)
    filters = expand(page, "source", "media-filter")
    expect(filters.locator("summary")).to_have_text("Media types")
    expect(filters.locator('input:checked')).to_have_count(1)
    fields = expand(page, "media", "music-fields")
    expect(fields.locator("summary")).to_have_text("Music information")
    expect(fields.locator('[data-music-field="track_number"]')).to_be_checked()
    expect(fields.locator('[data-preview="music-fields"]')).to_contain_text("Track 3")
    expect(fields.locator(".order-row").first).to_contain_text("Artist")
    badges = expand(page, "technical", "music-badges")
    expect(badges.locator("summary")).to_have_text("Music badges")
    expect(badges.locator('[data-music-badge="container"]')).to_be_checked()
    expect(badges.locator(".order-row").last).to_contain_text("Audio bitrate")
    expect(card.locator('[data-session=direct] .title')).to_have_text("Méridien Zéro")
    expect(card.locator('[data-session=direct] .music-album').last).to_contain_text("Piste 3 · Disque 1")
    expect(card.locator('[data-session=direct] img.poster')).to_be_visible()
    if not individual:
        shot(card, output, "personnalisation")
    page.locator('select[data-field="stream_surface"]').select_option("blur")
    expect(fields.locator('[data-preview="music-fields"] .title')).to_have_text("Studio Sillage")
    expect(badges.locator('[data-preview="music"]')).to_have_class("tech-preview surface-blur")
    expect(page.locator('[data-preview="video"]')).to_have_class("tech-preview surface-blur")
    filters.locator('[data-media-type="track"]').uncheck()
    empty = page.evaluate("musicEditorBench.lastConfig()")
    assert empty["filter_media_types"] == []
    page.evaluate("(cfg) => musicEditorBench.apply(cfg)", empty)
    expect(card.locator(".stream")).to_have_count(0)
    assert not errors, errors
    page.close()


def carousel(browser, images):
    page, errors, _ = open_view(browser, "edition", images)
    options = dict(mode="carousel", carousel_visible=1, carousel_transition="none")
    page.evaluate("(cfg) => musicEditorBench.mountCard(cfg)", options)
    page.locator("button[data-step='1']").click()
    page.locator("button[data-step='1']").click()
    page.wait_for_function("""() => document.querySelector('tracearr-streams-card')._carouselIndex === 2""")
    page.evaluate("(cfg) => musicEditorBench.apply(cfg)", {**options, "filter_media_types": ["episode", "track"]})
    expect(page.locator(".stream").first).to_have_attribute("data-session", "direct")
    page.wait_for_function("""() => document.querySelector('tracearr-streams-card')._carouselIndex === 1""")
    page.locator("button[data-step='1']").click()
    page.wait_for_function("""() => document.querySelector('tracearr-streams-card')._carouselIndex === 2""")
    page.evaluate("(cfg) => musicEditorBench.apply(cfg)", {**options, "filter_media_types": ["episode"]})
    expect(page.locator(".stream")).to_have_count(1)
    expect(page.locator(".stream").first).to_have_attribute("data-session", "episode")
    expect(page.locator("button[data-step='1']")).to_have_count(0)
    page.wait_for_function("""() => {
      const card = document.querySelector('tracearr-streams-card');
      return card._carouselIndex === 0 && card.shadowRoot.querySelector('.carousel').scrollLeft === 0;
    }""")
    assert not errors, errors
    page.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chromium, args=["--disable-background-networking"])
        try:
            images = fixtures(browser)
            edit(browser, images, args.output)
            print("Éditeur groupé et YAML : OK")
            edit(browser, images, args.output, individual=True)
            print("Éditeur individuel et YAML : OK")
            carousel(browser, images)
            print("Carrousel, ancre conservée et ancre exclue : OK")
        finally:
            browser.close()

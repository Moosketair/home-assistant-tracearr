"""Real Core 2026.11.3 acceptance; use only the disposable 4.2 loopback bench."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from aiohttp import web
from playwright.sync_api import expect, sync_playwright
import yaml

from dashboard_browser import scenario
from dashboard_candidate import appearance, open_view
from dashboard_seed import BASE
from dashboard_sim import NEXT_KEY, PORT, application
from music_editor import expand, shot
from music_showcase import ROOT, fixtures
from simulateur import Tracearr


DOMAIN = "tracearr_ha"
COMPONENT = f"custom_components/{DOMAIN}"
MODULE = f"{COMPONENT}/frontend/tracearr-card.js"
CANDIDATE = "e730b6339f738b6573de2c358a6de4d81103246e"
RESOURCE = "/tracearr_ha/tracearr-card.js?v=0.1.18"
SAVED = ("core.config_entries", "core.entity_registry", "core.device_registry",
         "lovelace.lovelace", "lovelace_resources")
VIEW = "lovelace/musique"
GROUP = "custom:tracearr-streams-card"
SINGLE = "custom:tracearr-stream-card"
CONFIG = ROOT / "recette" / "dashboard_music.py"


def simulator(images):
    # Reuse the historic video cases and control endpoint; the additional
    # scenarios drive the same authenticated REST, SSE and image routes.
    app = application(NEXT_KEY)
    upstream = next(r.handler for r in app.router.routes() if r.method == "GET"
                    and r.resource.canonical.endswith("{resource}"))
    action = next(r.handler for r in app.router.routes() if r.method == "POST")
    sim = upstream.__self__
    assert isinstance(sim, Tracearr)
    app = web.Application()

    def poster(name):
        return f"/api/v1/images/proxy?fixture={name}" if name else None

    def reset():
        for sid in list(sim.streams):
            sim.change("stopped", sid)

    async def control(request):
        if request.host != f"127.0.0.1:{PORT}" or request.headers.get("Origin"):
            raise web.HTTPForbidden()
        name = request.match_info["action"]
        if name not in {"empty", "track", "mixed", "music-pause", "music-play", "next-track", "convert-pause"}:
            return await action(request)
        if name == "empty":
            reset()
        elif name == "track":
            reset()
            sim.change("started", "direct", username="alice", media_type="track", media_title="Signal direct",
                       artist_name="Studio Sillage", album_name="Atlas nocturne", year=2024,
                       track_number=3, disc_number=1, rating_key="101", duration_ms=180000, progress_ms=13000,
                       poster_url=poster("original"), audio_decision="directplay",
                       source_audio_codec="FLAC", source_audio_channels=2,
                       source_audio_details={"sampleRate": 44100, "bitrate": 902},
                       transcode_info={"sourceContainer": "FLAC"}, bitrate=1234)
        elif name == "mixed":
            sim.change("started", "film", username="alice", media_title="Orbite fictive",
                       started_at="2026-01-01T12:02:00Z", poster_url=poster("vertical"), bitrate=4000)
            sim.change("started", "episode", server=1, username="bob", media_type="episode",
                       show_title="Les Aurores", media_title="Épisode fictif", season_number=2, episode_number=3,
                       started_at="2026-01-01T12:01:00Z", poster_url=poster("vertical"), bitrate=3000)
            sim.change("started", "convert", server=1, username="bob", media_type="track",
                       media_title="Signal converti", rating_key="201", poster_url=poster("vertical"),
                       started_at="2026-01-01T11:59:00Z", is_transcode=True, audio_decision="transcode",
                       video_decision="transcode", source_video_codec="hevc", stream_video_codec="h264",
                       source_audio_codec="flac", stream_audio_codec="aac", source_audio_channels=6,
                       source_audio_details={"sampleRate": 96000, "bitrate": 1140},
                       stream_audio_details={"channels": 2, "sampleRate": 96000, "bitrate": 1140}, bitrate=196)
            sim.change("started", "ambiguous", server=2, username="charlie", media_type="track",
                       media_title="Signal ambigu", rating_key="301", poster_url=None,
                       started_at="2026-01-01T11:58:00Z", is_transcode=True, audio_decision="transcode",
                       source_audio_codec="flac", stream_audio_codec="flac",
                       source_audio_details={"sampleRate": 48000, "bitrate": 800}, bitrate=176)
            sim.change("started", "live", server=2, username="charlie", media_type="live",
                       media_title="Direct fictif", started_at="2026-01-01T11:57:00Z", poster_url=None)
        elif name == "next-track":
            sim.change("updated", "direct", media_title="Signal suivant", rating_key="102",
                       poster_url=poster("convert"), track_number=4, progress_ms=1000)
        elif name == "convert-pause":
            sim.change("updated", "convert", state="paused", progress_ms=21000)
        else:
            sim.change("updated", "direct", state="paused" if name == "music-pause" else "playing",
                       progress_ms=21000)
        return web.json_response({"scenario": name})

    async def image(request):
        if request.headers.get("Authorization") != f"Bearer {NEXT_KEY}":
            raise web.HTTPUnauthorized()
        if (name := request.query.get("fixture")) in {"original", "vertical", "convert"}:
            return web.Response(body=(images / f"{name}.png").read_bytes(), content_type="image/png")
        return await upstream(request)

    async def shutdown(_app):
        sim.raw(None)

    app.router.add_get("/api/v2/public/{resource}", upstream)
    app.router.add_get("/api/v1/images/proxy", image)
    app.router.add_post("/scenario/{action}", control)
    app.on_shutdown.append(shutdown)
    web.run_app(app, host="127.0.0.1", port=PORT, access_log=None, handler_cancellation=True)


@contextmanager
def service(args, root, log, ready):
    with (root / log).open("wb") as f:
        env = {**os.environ, "HOME": str(root / "home"), "XDG_CACHE_HOME": str(root / "cache"),
               "PYTHONDONTWRITEBYTECODE": "1", "TZ": "UTC"}
        with subprocess.Popen(args, cwd=root, env=env, stdout=f, stderr=subprocess.STDOUT) as proc:
            try:
                until = time.monotonic() + 45
                while time.monotonic() < until and proc.poll() is None:
                    try:
                        with urlopen(ready, timeout=1):
                            break
                    except (URLError, TimeoutError):
                        time.sleep(.2)
                else:
                    raise RuntimeError(f"Service not ready: {root / log}")
                yield
            finally:
                if proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait()


def storage(conf, keys):
    return {key: (conf / ".storage" / key).read_bytes() for key in keys}


def call(page, command, **kwargs):
    page.wait_for_function("() => document.querySelector('home-assistant')?.hass?.connected === true")
    return page.evaluate("args => document.querySelector('home-assistant').hass.callWS(args)",
                         {"type": command, **kwargs})


def loaded(page):
    return page.wait_for_function("""async () => {
      const hass = document.querySelector('home-assistant')?.hass;
      if (!hass?.connected) return false;
      const [entry] = (await hass.callWS({type:'tracearr_ha/get'})).entries;
      return entry?.sse_connected && entry;
    }""", polling=200).json_value()


def live_registry(page, entry_id):
    return page.evaluate("""async entry => {
      const hass = document.querySelector('home-assistant').hass;
      const entities = (await hass.callWS({type:'config/entity_registry/list'}))
        .filter(row=>row.config_entry_id===entry);
      const devices = (await hass.callWS({type:'config/device_registry/list'}))
        .filter(row=>row.config_entries.includes(entry));
      if (!entities.every(row=>hass.states[row.entity_id] &&
           !['unavailable','unknown'].includes(hass.states[row.entity_id].state)))
        throw new Error('Unavailable Tracearr entity');
      return {entities:Object.fromEntries(entities.map(row=>[row.entity_id,row.unique_id])),
              devices:devices.map(row=>[row.id,row.identifiers]).sort()};
    }""", entry_id)


def install_view(page, entry_id, entity):
    dashboard = call(page, "lovelace/config", url_path="lovelace")
    common = dict(entry_id=entry_id, empty_mode="header_only", show_avatar=False, show_end_time=True,
                  show_bitrate=True, technical_badge_style="technical",
                  technical_transcode_mode="source_to_destination", grid_options={"rows": "auto", "columns": 6})
    group = dict(common, type=GROUP, title="Liste mixte")
    single = dict(common, type=SINGLE, title="Lecture individuelle", selection="stream", stream_id="direct")
    carousel = dict(common, type=GROUP, title="Carrousel mixte", mode="carousel", carousel_transition="none")
    fixed_group = dict(group, title="Liste · deux lignes", grid_options={"rows": 2, "columns": 6})
    fixed_single = dict(single, title="Individuelle · une ligne", grid_options={"rows": 1, "columns": 6})
    native = dict(type="tile", entity=entity, name="Une ligne native", grid_options={"rows": 1, "columns": 6})
    grid = lambda *cards: dict(type="grid", cards=list(cards))
    dashboard["views"] += [
        dict(type="sections", title="Recette musicale", path="musique", max_columns=2,
             sections=[grid(native, group, fixed_group), grid(single, fixed_single, carousel)]),
        dict(type="masonry", title="Masonry", path="masonry", cards=[group, single]),
    ]
    call(page, "lovelace/config/save", url_path="lovelace", config=dashboard)


def music_cards(page):
    grouped = page.locator("tracearr-streams-card")
    individual = page.locator("tracearr-stream-card")
    return {"group": grouped.nth(0), "single": individual.nth(0),
            "fixed_group": grouped.nth(1), "fixed_single": individual.nth(1), "carousel": grouped.nth(2)}


def geometry(page, cards):
    page.evaluate("""async () => {
      await document.fonts.ready;
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    }""")
    result = {"native": page.locator("hui-tile-card ha-card").bounding_box()["height"]}
    for name, card in cards.items():
        result[name] = card.evaluate("""el => {
          const root=el.shadowRoot, frame=root.querySelector('ha-card').getBoundingClientRect();
          let wrapper=el;
          while (wrapper && !wrapper.matches('.card')) wrapper=wrapper.parentElement || wrapper.getRootNode().host;
          const outside=wrapper.getBoundingClientRect();
          const overlap=[...wrapper.parentElement.children].filter(child=>child!==wrapper).some(child=>{
            const r=child.getBoundingClientRect();
            return Math.min(r.right,frame.right)-Math.max(r.left,frame.left)>.5 &&
                   Math.min(r.bottom,frame.bottom)-Math.max(r.top,frame.top)>.5;
          });
          const scroller=root.querySelector('.root');
          return {height:frame.height,width:frame.width,cellHeight:outside.height,overlap,
                  rows:wrapper.style.getPropertyValue('--row-size')||'auto',
                  scroll:scroller.scrollHeight-scroller.clientHeight};
        }""")
    assert all(not result[name]["overlap"] and
               result[name]["height"] <= result[name]["cellHeight"] + 1 for name in cards), result
    return result


def ids(card):
    return card.locator(".stream").evaluate_all("els=>els.map(el=>el.dataset.session)")


def artwork(panel):
    image = panel.locator("img.poster")
    expect(image).to_be_visible()
    expect(image).to_have_js_property("complete", True)
    return image.evaluate("""i => {
      const r=i.parentElement.getBoundingClientRect(), s=getComputedStyle(i);
      return {width:r.width,height:r.height,natural:[i.naturalWidth,i.naturalHeight],
              fit:s.objectFit,position:s.objectPosition};
    }""")


def playback(page, cards, proof):
    group, single, carousel = (cards[k] for k in ("group", "single", "carousel"))
    result = {}
    for action, count in (("empty", 0), ("track", 1), ("mixed", 6)):
        scenario(action)
        for name, card in cards.items():
            expect(card.locator(".stream")).to_have_count(min(count, 1) if "single" in name else count)
        result[action] = geometry(page, cards)
    empty, one, mixed = (result[k] for k in ("empty", "track", "mixed"))
    assert empty["group"]["height"] == empty["single"]["height"] == empty["native"], empty
    assert mixed["group"]["height"] > one["group"]["height"] > empty["group"]["height"]
    assert one["single"]["height"] > empty["single"]["height"] and mixed["single"]["height"] == one["single"]["height"]
    for name, height in (("fixed_group", 120), ("fixed_single", 56)):
        assert all(r[name]["height"] == height for r in (empty, one, mixed))
        assert all(r[name]["width"] == empty[name]["width"] for r in (one, mixed))
        assert mixed[name]["scroll"] > 0

    assert ids(group) == ids(carousel) == ["film", "episode", "direct", "convert", "ambiguous", "live"]
    assert ids(single) == ["direct"]
    panel = lambda sid: group.locator(f'[data-session="{sid}"]')
    direct, convert, ambiguous, film = (panel(sid) for sid in ("direct", "convert", "ambiguous", "film"))
    result["artwork"] = {sid: artwork(panel(sid)) for sid in ("direct", "convert", "film", "episode")}
    for sid, natural in (("direct", [600, 600]), ("convert", [400, 600])):
        box = result["artwork"][sid]
        assert box["natural"] == natural and box["height"] == box["width"]
        assert (box["fit"], box["position"]) == ("cover", "50% 50%")
    for sid in ("film", "episode"):
        box = result["artwork"][sid]
        assert box["natural"] == [400, 600] and abs(box["height"] / box["width"] - 1.5) < .04
    expect(ambiguous.locator(".music-placeholder")).to_be_visible()
    expect(direct.locator(".stream-indicator.direct")).to_have_attribute("title", "Audio : Lecture directe")
    expect(convert.locator(".stream-indicator.transcode")).to_have_attribute("title", "Audio : Transcodage")
    for row in (direct, convert, ambiguous):
        expect(row.locator(".stream-indicator")).to_have_count(1)
        expect(row.locator('[data-tech="video_codec"], [data-tech="resolution"], .time-end')).to_have_count(0)
        expect(row).not_to_contain_text(re.compile(r"Hi.Res|[0-9]+[\s-]bits|lossless", re.I))
        expect(row.locator('[data-tech="container"], [data-tech="audio_bitrate"]')).to_have_count(0)
    expect(direct.locator('[data-tech="audio_format"] strong')).to_have_text("FLAC")
    expect(convert.locator('[data-tech="audio_format"] strong')).to_have_text(["FLAC", "AAC"])
    expect(convert.locator('[data-tech="sample_rate"]')).to_have_attribute("title", re.compile("destination inconnue"))
    expect(ambiguous.locator('[data-tech="audio_format"]')).to_have_attribute("title", re.compile("destination inconnue"))
    expect(ambiguous.locator('[data-tech="audio_format"] strong')).to_have_text("FLAC")
    shot(group, proof, "sections-mixte")
    # The one→mixed update may already preserve the active musical panel.
    for _ in range(6):
        current = carousel.evaluate("el=>el._carouselIndex")
        if current == 2:
            break
        carousel.locator(f'button[data-step="{1 if current < 2 else -1}"]').click()
        expect(carousel).not_to_have_js_property("_carouselIndex", current)
    expect(carousel).to_have_js_property("_carouselIndex", 2)
    track = carousel.locator(".carousel").element_handle()
    left = track.evaluate("el=>el.scrollLeft")
    shot(carousel, proof, "carrousel")
    scenario("music-pause")
    expect(single.locator(".time-paused")).to_have_text("En pause")
    frozen = single.locator(".time-remaining").inner_text()
    shot(single, proof, "pause")
    # Cross a whole display-second boundary to verify the clock is frozen.
    single.evaluate("el => new Promise(resolve => setTimeout(resolve, 1100))")
    expect(single.locator(".time-remaining")).to_have_text(frozen)
    scenario("music-play")
    expect(single.locator(".time-paused")).to_have_count(0)
    expect(single.locator(".time-remaining")).not_to_have_text(frozen)
    old_image = single.locator("img.poster").get_attribute("src")
    scenario("next-track")
    expect(single.locator(".title")).to_have_text("Signal suivant")
    expect(single.locator(".time-current")).to_have_text("0:01")
    expect(single.locator("img.poster")).not_to_have_attribute("src", old_image)
    assert artwork(single.locator(".stream"))["natural"] == [600, 600]
    assert carousel.locator(".carousel").evaluate("(el,old)=>el===old", track)
    assert abs(carousel.locator(".carousel").evaluate("el=>el.scrollLeft") - left) <= 1
    result["paused_remaining"] = frozen
    return result


def saved_cards(page):
    config = call(page, "lovelace/config", url_path="lovelace")
    return [card for section in next(v for v in config["views"] if v["path"] == "musique")["sections"]
            for card in section["cards"]]


def global_stats(page, registry):
    return page.evaluate("""ids=>Object.fromEntries(ids.map(id=>
      [id,document.querySelector('home-assistant').hass.states[id].state]))""", list(registry["entities"]))


def edit_cards(page, cards, registry, proof):
    form = page.locator("tracearr-card-editor")
    edit_dashboard = page.get_by_role("button", name=re.compile("Modifier le tableau de bord|Edit dashboard"))
    done = page.get_by_role("button", name=re.compile("^(Terminer|Done)$"))
    buttons = page.get_by_role("button", name="Edit card")
    save = page.get_by_role("button", name=re.compile("^(Enregistrer|Save)$"))
    cancel = page.get_by_role("button", name=re.compile("^(Annuler|Cancel)$"))
    yaml_toggle = page.get_by_role("button", name=re.compile("éditeur de code|code editor", re.I))
    visual_toggle = page.get_by_role("button", name=re.compile("éditeur visuel|visual editor", re.I))
    baseline = saved_cards(page)
    stats = global_stats(page, registry)
    for suffix, expected in (("active_streams", "6"), ("audio_only_transcodes", "2"),
                             ("video_only_transcodes", "0"), ("video_and_audio_transcodes", "0")):
        assert stats[f"sensor.tracearr_{suffix}"] == expected, (suffix, stats)

    def start(index):
        buttons.nth(index).press("Enter")
        expect(form).to_be_visible()

    def filters():
        return expand(form, "source", "media-filter").locator("[data-media-type]")

    def switch_yaml():
        yaml_toggle.click()
        return page.locator("ha-yaml-editor .cm-content[contenteditable=true]")

    def set_yaml(editor, config):
        editor.click()
        editor.press("Control+a")
        page.keyboard.insert_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False))

    edit_dashboard.click()
    for index in (1, 3):
        start(index)
        expect(filters()).to_have_count(4)
        expect(form.locator("[data-media-type]:checked")).to_have_count(4)
        metadata = expand(form, "media", "music-fields")
        badges = expand(form, "technical", "music-badges")
        expect(metadata.locator("[data-music-field=track_number]")).not_to_be_checked()
        expect(badges.locator("[data-music-badge=container]")).not_to_be_checked()
        expect(badges.locator("[data-music-badge=audio_bitrate]")).not_to_be_checked()
        for name in ("movie", "episode", "other"):
            form.locator(f"[data-media-type={name}]").uncheck()
        metadata.locator("[data-music-field=track_number]").check()
        metadata.locator("[data-music-field=year]").uncheck()
        metadata.locator('[data-order=music_field_order][data-index="1"][data-direction="-1"]').click()
        expect(metadata.locator('[data-preview="music-fields"] .title')).to_have_text("Studio Sillage")
        badges.locator("[data-music-badge=container]").check()
        badges.locator("[data-music-badge=audio_bitrate]").check()
        badges.locator('[data-order=music_badge_order][data-index="5"][data-direction="-1"]').click()
        expect(badges.locator('[data-preview=music] [data-tech=audio_bitrate]')).to_be_visible()
        if index == 1:
            shot(badges, proof, "editeur-badges")
        editor = switch_yaml()
        editor.press("Control+End")  # CodeMirror renders only the visible lines.
        expect(editor).to_contain_text("filter_media_types")
        expect(editor).to_contain_text("music_field_order")
        visual_toggle.click()
        expect(form).to_be_visible()
        expect(expand(form, "source", "media-filter").locator("[data-media-type=track]")).to_be_checked()
        save.click()
        expect(form).to_have_count(0)
    done.click()
    page.reload()
    expect(page.locator("hui-sections-view")).to_be_visible()
    group, single = cards["group"], cards["single"]
    expect(group.locator(".stream")).to_have_count(3)
    expect(single.locator(".stream")).to_have_count(1)
    assert ids(group) == ["direct", "convert", "ambiguous"] and ids(single) == ["direct"]
    expect(group.locator('[data-session=direct] .title')).to_have_text("Studio Sillage")
    direct = group.locator('[data-session=direct]')
    expect(direct.locator('[data-tech="container"] strong')).to_have_text("FLAC")
    expect(direct.locator('[data-tech="audio_format"] strong')).to_have_text("FLAC")
    expect(direct.locator('[data-tech="audio_bitrate"] strong')).to_have_text("902 kb/s")
    expect(direct.locator('[data-tech="bitrate"] strong')).to_have_text("1.2 Mb/s")
    assert direct.locator("[data-tech]").evaluate_all("nodes=>nodes.map(n=>n.dataset.tech)") == [
        "audio_format", "sample_rate", "channels", "container", "audio_bitrate", "bitrate"]
    expect(group.locator('[data-session=convert] [data-tech="audio_bitrate"]')).to_have_attribute(
        "title", re.compile("destination inconnue"))
    shot(group, proof, "musique-personnalisee")
    assert global_stats(page, registry) == stats

    saved = saved_cards(page)
    for index in (1, 3):
        before, after = baseline[index], saved[index]
        for key in before:
            assert after[key] == before[key], key
        assert after["filter_media_types"] == ["track"]
        assert after["music_field_order"].startswith("artist,title,")
        assert after["music_field_visibility"] == {"track_number": True, "year": False}
        assert after["music_badge_order"].endswith("container,audio_bitrate")
        assert after["music_badge_visibility"] == {"container": True, "audio_bitrate": True}

    edit_dashboard.click()
    for index in (1, 3):
        start(index)
        expect(filters().and_(page.locator(":checked"))).to_have_count(1)
        metadata = expand(form, "media", "music-fields")
        expect(metadata.locator(".order-row").first).to_contain_text(re.compile("Artiste|Artist"))
        expect(metadata.locator("[data-music-field=year]")).not_to_be_checked()
        badges = expand(form, "technical", "music-badges")
        expect(badges.locator("[data-music-badge=audio_bitrate]")).to_be_checked()
        expect(badges.locator(".order-row").last).to_contain_text(re.compile("Débit audio|Audio bitrate"))
        editor = switch_yaml()
        if index == 1:
            config = {**saved[index], "filter_media_types": [], "filter_transcode": "audio",
                      "filter_user": "bob", "filter_server": "00000000-0000-4000-8000-000000000002",
                      "show_paused": False}
        else:
            config = {**saved[index], "filter_media_types": ["movie"]}
        set_yaml(editor, config)
        visual_toggle.click()
        expect(form).to_be_visible()
        expect(expand(form, "source", "media-filter").locator("input:checked")).to_have_count(int(index == 3))
        save.click()
        expect(form).to_have_count(0)
    done.click()
    page.reload()
    expect(page.locator("hui-sections-view")).to_be_visible()
    loaded(page)
    expect(group.locator(".stream")).to_have_count(0)
    expect(single.locator(".stream")).to_have_count(0)
    assert saved_cards(page)[1]["filter_media_types"] == []
    assert saved_cards(page)[3]["stream_id"] == "direct" and saved_cards(page)[3]["filter_media_types"] == ["movie"]
    assert global_stats(page, registry) == stats

    edit_dashboard.click()
    start(1)
    expect(filters().and_(page.locator(":checked"))).to_have_count(0)
    form.locator("[data-media-type=track]").check()
    save.click()
    expect(form).to_have_count(0)
    done.click()
    edit_dashboard.click()
    start(5)
    expect(filters().and_(page.locator(":checked"))).to_have_count(4)
    for name in ("movie", "episode", "other"):
        expand(form, "source", "media-filter").locator(f"[data-media-type={name}]").uncheck()
    expect(filters().and_(page.locator(":checked"))).to_have_count(1)
    save.click()
    expect(form).to_have_count(0)
    done.click()
    expect(group.locator(".stream")).to_have_count(1)
    assert ids(group) == ["convert"]
    carousel = cards["carousel"]
    expect(carousel.locator(".stream")).to_have_count(3)
    carousel.locator('button[data-step="1"]').click()
    expect(carousel).to_have_js_property("_carouselIndex", 1)
    edit_dashboard.click()
    start(5)
    filters()
    form.locator("[data-media-type=track]").uncheck()
    form.locator("[data-media-type=episode]").check()
    save.click()
    done.click()
    expect(carousel.locator(".stream")).to_have_count(1)
    assert ids(carousel) == ["episode"]
    expect(carousel.locator('button[data-step="1"]')).to_have_count(0)
    expect(carousel).to_have_js_property("_carouselIndex", 0)
    assert global_stats(page, registry) == stats
    scenario("convert-pause")
    expect(group.locator(".stream")).to_have_count(0)
    persisted = {label: {k: v for k, v in saved[index].items() if k.startswith(("filter_media", "music_"))}
                 for label, index in (("group", 1), ("single", 3))}
    return {"persisted": persisted, "global_stats": {key.split(".", 1)[1]: value for key, value in stats.items()}}


def sizing_end(page, cards, proof):
    scenario("empty")
    for card in cards.values():
        expect(card.locator(".stream")).to_have_count(0)
    end = geometry(page, cards)
    assert end["group"]["height"] == end["single"]["height"] == end["native"]
    shot(page.locator("hui-sections-view"), proof, "sections-bandeaux")
    page.goto(BASE + "/lovelace/masonry")
    expect(page.locator("hui-masonry-view")).to_be_visible()
    masonry = page.locator("tracearr-streams-card,tracearr-stream-card")
    expect(masonry).to_have_count(2)
    expect(masonry.locator(".stream")).to_have_count(0)
    before = [card.locator("ha-card").bounding_box()["height"] for card in masonry.all()]
    loaded(page)
    scenario("track")
    expect(masonry.locator(".stream")).to_have_count(2)
    after = [card.locator("ha-card").bounding_box()["height"] for card in masonry.all()]
    assert all(a > b for a, b in zip(after, before, strict=True))
    return {"stopped": end, "masonry": [before, after]}


def declared_yaml(page):
    open_view(page, "tracearr-yaml/musique")
    cards = page.locator("tracearr-streams-card,tracearr-stream-card")
    expect(cards).to_have_count(2)
    music, empty = cards.all()
    expect(music.locator(".stream")).to_have_count(3)
    expect(empty.locator(".stream")).to_have_count(0)
    direct, convert, ambiguous = (music.locator(f'[data-session="{sid}"]') for sid in ("direct", "convert", "ambiguous"))
    expect(direct.locator('[data-tech="audio_codec"] strong')).to_have_text("FLAC")
    expect(convert.locator('[data-tech="audio_codec"] strong')).to_have_text("AAC")
    expect(music.locator('[data-tech="audio_format"]')).to_have_count(0)
    for panel in (convert, ambiguous):
        expect(panel.locator('[data-tech="sample_rate"], [data-tech="audio_bitrate"]')).to_have_count(0)
    expect(ambiguous.locator('[data-tech="audio_codec"]')).to_have_count(0)
    expect(direct.locator('[data-tech="sample_rate"] strong')).to_have_text(re.compile(r"44[,.]1 kHz"))
    expect(direct.locator('[data-tech="audio_bitrate"] strong')).to_have_text("902 kb/s")


def run(source, root):
    conf, proof, images = (root / k for k in ("conf", "preuves", "images"))
    assert source.resolve() == Path("/tmp/opencode/tracearr-42/final-upgrade")
    for port in (18424, PORT):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            probe.bind(("127.0.0.1", port))
    entries = json.loads((source / ".storage/core.config_entries").read_bytes())["data"]["entries"]
    entry, = (e for e in entries if e["domain"] == DOMAIN)
    assert entry["data"] == {"url": f"http://127.0.0.1:{PORT}", "token": NEXT_KEY}
    conf.mkdir(parents=True)
    proof.mkdir()
    images.mkdir()
    (conf / ".storage").mkdir()
    for name in (*SAVED, "auth", "auth_provider.homeassistant", "onboarding", "person",
                 "lovelace_dashboards", "core.area_registry", "frontend.system_data"):
        shutil.copy2(source / ".storage" / name, conf / ".storage" / name)
    storage_yaml = source.parent / "config-storage.yaml"
    assert yaml.safe_load(storage_yaml.read_text())["http"] == {"server_host": "127.0.0.1", "server_port": 18424}
    shutil.copy2(storage_yaml, conf / "configuration.yaml")

    def install(ref):
        if (conf / COMPONENT).exists():
            shutil.move(conf / COMPONENT, root / "previous_component")
        archive = subprocess.check_output(["git", "archive", ref, COMPONENT], cwd=ROOT)
        subprocess.run(["tar", "-xf", "-", "-C", str(conf)], input=archive, check=True)

    python = sys.executable
    core_args = [python, "-B", "-m", "homeassistant", "--skip-pip", "-c", str(conf)]
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path="/usr/bin/chromium", args=["--disable-background-networking"])
        for name, image in fixtures(browser).items():
            (images / f"{name}.png").write_bytes(image)
        ctx = browser.new_context(viewport={"width": 1510, "height": 1040}, timezone_id="UTC")
        ctx.route("**/*", lambda route: route.continue_() if urlsplit(route.request.url).netloc ==
                  urlsplit(BASE).netloc else route.abort())
        page = ctx.new_page()
        page.set_default_timeout(10000)
        errors, responses, unknown = [], [], []
        page.on("pageerror", lambda error: errors.append(error.stack or str(error)))
        page.on("response", lambda response: responses.append(response)
                if response.url == BASE + RESOURCE else None)

        def watch(socket):
            sent = {}
            def remember(payload):
                req = json.loads(payload)
                if "id" in req:
                    sent[req["id"]] = req["type"]
            def receive(payload):
                data = json.loads(payload)
                for msg in data if isinstance(data, list) else [data]:
                    if msg.get("error", {}).get("code") == "unknown_command":
                        unknown.append(sent.get(msg["id"], "?"))
            socket.on("framesent", remember)
            socket.on("framereceived", receive)
        page.on("websocket", watch)

        def module():
            if not any(r.ok for r in responses):
                # The copied 4.2 resource can still be queued for persistence
                # on the first bootstrap; re-open after the entry is loaded.
                with page.expect_response(lambda r: r.url == BASE + RESOURCE and r.ok) as pending:
                    page.reload()
                response = pending.value
            else:
                response = next(r for r in responses if r.ok)
            body = response.body()
            digest = hashlib.sha256(body).hexdigest()
            expected = (conf / MODULE).read_bytes()
            assert digest == hashlib.sha256(expected).hexdigest(), (
                len(body), len(expected), body[:80], response.headers.get("content-encoding"))
            responses.clear()
            return {"status": response.status, "sha256": digest}

        # "/" on the simulator is not a public fixture route: use the stable
        # authenticated /servers GET as the readiness probe.
        ready = Request(f"http://127.0.0.1:{PORT}/api/v2/public/servers",
                        headers={"Authorization": f"Bearer {NEXT_KEY}"})
        with service([python, "-B", str(CONFIG), "--simulator", str(images)], root, "sim.log", ready):
            install("v0.1.18")
            with service(core_args, root, "stable.log", BASE):
                open_view(page, "lovelace/recette")
                old_registry = live_registry(page, loaded(page)["id"])
                assert len(old_registry["entities"]) == 17 and len(old_registry["devices"]) == 4
                old_appearance = appearance(page)
                stable_module = module()
                page.goto("about:blank")
            old_storage = storage(conf, SAVED)
            install(CANDIDATE)
            with service(core_args, root, "candidate.log", BASE):
                open_view(page, "lovelace/recette")
                entry_id = loaded(page)["id"]
                registry = live_registry(page, entry_id)
                assert registry == old_registry
                assert appearance(page) == old_appearance, "historical video dashboard differs"
                candidate_module = module()
                assert storage(conf, SAVED) == old_storage, "historical registries, resources or dashboard differ"
                entity = next(key for key in registry["entities"] if key.startswith("binary_sensor."))
                install_view(page, entry_id, entity)
                open_view(page, VIEW)
                result = {"core": page.evaluate("document.querySelector('home-assistant').hass.config.version"),
                          "stable_module": stable_module, "candidate_module": candidate_module,
                          "entities": len(registry["entities"]), "devices": len(registry["devices"]),
                          "storage_byte_identical": True, "historical_video_equal": True}
                cards = music_cards(page)
                result["playback"] = playback(page, cards, proof)
                (proof / "playback.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
                result["editors"] = edit_cards(page, cards, registry, proof)
                result["sizing_end"] = sizing_end(page, cards, proof)
                page.goto("about:blank")

            config = yaml.safe_load(storage_yaml.read_text())
            config["lovelace"] = dict(resource_mode="yaml", resources=[dict(url=RESOURCE, type="module")],
                                      dashboards={"tracearr-yaml": dict(mode="yaml", title="Recette YAML",
                                                                        filename="ui-music.yaml")})
            (conf / "configuration.yaml").write_text(yaml.safe_dump(config))
            card = dict(type=GROUP, filter_media_types=["track"], show_bitrate=True,
                        technical_badge_style="technical", technical_transcode_mode="destination",
                        music_badge_visibility={"audio_format": False, "audio_bitrate": True})
            empty = dict(type=SINGLE, filter_media_types=[], selection="stream", stream_id="direct")
            (conf / "ui-music.yaml").write_text(yaml.safe_dump({"views": [
                dict(type="sections", path="musique", sections=[dict(type="grid", cards=[card, empty])])]}))
            stored_resource = storage(conf, ("lovelace_resources",))
            scenario("mixed")
            responses.clear()
            with service(core_args, root, "yaml.log", BASE):
                declared_yaml(page)
                result["manual_yaml"] = module()
                assert result["manual_yaml"] == candidate_module
                assert storage(conf, ("lovelace_resources",)) == stored_resource
            result["browser_errors"] = errors
            result["unknown_commands"] = unknown
            (proof / "resultats.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
            # Minimal Core config omits Recorder and Brands. Their frontend
            # lookups are not Tracearr errors; never allow unknown app commands.
            assert set(unknown) <= {"recorder/info", "brands/access_token"}, unknown
            assert all(error == "Object" for error in errors) and len(errors) <= len(unknown), errors
        browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--simulator", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--source", type=Path, default=Path("/tmp/opencode/tracearr-42/final-upgrade"))
    parser.add_argument("--output", type=Path, help="new directory inside /tmp/opencode")
    args = parser.parse_args()
    if args.simulator:
        simulator(args.simulator)
    else:
        assert args.output and args.output.resolve().parent == Path("/tmp/opencode") and not args.output.exists()
        run(args.source, args.output)

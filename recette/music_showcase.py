"""Capture/verify the real 6C.4 card bundle in isolated Chromium.

Uses the same intercepted-origin Playwright bench as readme_showcase.py.
Requires Playwright and Pillow in the recipe environment only.
"""
import argparse
from io import BytesIO
from pathlib import Path
import random
from urllib.parse import parse_qs, urlsplit

from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright
from readme_showcase import MODULE, ORIGIN, ROOT, art

HTML = "recette/music_showcase.html"
OUTPUT = ROOT / "recette/preuves/6c.4"
VIEWS = ("mixte", "musique", "direct", "transcodage", "pause", "carousel", "styles", "clair", "pochettes")


def svg_cover(seed, color, light, title):
    rand = random.Random(seed)
    stars = "".join(f'<circle cx="{rand.randrange(600)}" cy="{rand.randrange(600)}" r="1.2" opacity=".5"/>'
                    for _ in range(145))
    waves = "".join(f'<path d="M0 {y} Q158 {y-120} 300 {y} T600 {y}" opacity=".52"/>'
                    for y in range(335, 555, 19))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
      <defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#0a1228"/><stop offset="1" stop-color="{color}"/></linearGradient>
      <radialGradient id="star"><stop stop-color="#fff2df"/><stop offset="1" stop-color="{light}"/></radialGradient></defs>
      <rect width="600" height="600" fill="url(#sky)"/><g fill="#fff1d8">{stars}</g>
      <circle cx="309" cy="252" r="86" fill="url(#star)"/>
      <g fill="none" stroke="{light}" stroke-width="2">{waves}
      <ellipse cx="309" cy="252" rx="236" ry="61" transform="rotate(-21 309 252)"/>
      <path d="M40 93h32M40 93v32M560 93h-32M560 93v32M40 503h32M40 503v-32M560 503h-32M560 503v-32"/></g>
      <g fill="#fff3df" text-anchor="middle" font-family="sans-serif">
      <text x="300" y="62" font-size="17" letter-spacing="7">ÉDITION FICTIVE</text>
      <text x="300" y="552" font-size="33" font-weight="700" letter-spacing="3">{title}</text></g></svg>'''


def png(image):
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def fixtures(browser):
    page = browser.new_page(viewport={"width": 600, "height": 600})
    page.route("**/*", lambda route: route.abort())
    sources = {}
    for key, args in {
        "original": ("atlas", "#314c91", "#efb788", "ATLAS NOCTURNE"),
        "convert": ("signals", "#874474", "#ffc475", "SIGNAUX DE TRAVERSE"),
    }.items():
        page.set_content(f'<style>body{{margin:0}}</style>{svg_cover(*args)}')
        sources[key] = Image.open(BytesIO(page.screenshot())).convert("RGB")
    page.close()
    original = sources["original"]
    sources["vertical"] = original.crop((100, 0, 500, 600))
    sources["horizontal"] = original.crop((0, 100, 600, 500))
    return {key: png(value) for key, value in sources.items()}


def dispatcher(images, requested):
    def serve(route):
        url = urlsplit(route.request.url)
        path = url.path.lstrip("/")
        if f"{url.scheme}://{url.netloc}" != ORIGIN:
            route.abort()
        elif path in (HTML, MODULE):
            route.fulfill(path=ROOT / path, content_type="text/html; charset=utf-8" if path == HTML else "text/javascript")
        elif path.startswith("showcase-art/"):
            route.fulfill(body=art(Path(path).stem), content_type="image/svg+xml")
        elif path.startswith("music-art/"):
            route.fulfill(body=images[Path(path).stem], content_type="image/png")
        elif path.startswith("api/tracearr_ha/image/music-test/") and path.endswith("/poster"):
            key = parse_qs(url.query)["rev"][0]
            assert len(key) == 64
            number = int(key, 16)
            requested.append(number)
            if number == 9:
                route.fulfill(status=404)
            else:
                route.fulfill(body=images[("original", "vertical", "convert", "horizontal")[number - 1]],
                              content_type="image/png")
        else:
            route.abort()
    return serve


def open_view(browser, name, images, width=1060, args=""):
    page = browser.new_page(viewport={"width": width, "height": 1150},
                            color_scheme="light" if name == "clair" else "dark")
    errors, requests = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("**/*", dispatcher(images, requests))
    page.goto(f"{ORIGIN}/{HTML}?view={name}{args}")
    page.locator(".stream").first.wait_for()
    return page, errors, requests


def measure(page):
    return page.evaluate("""() => [...document.querySelectorAll('tracearr-stream-card, tracearr-streams-card')].map(card => {
      const root = card.shadowRoot, ha = root.querySelector('ha-card');
      const box = ha.getBoundingClientRect();
      const panels = [...root.querySelectorAll('.stream')].map(panel => {
        const poster = panel.querySelector('.poster-wrap');
        const size = poster.getBoundingClientRect(), image = poster.querySelector('img');
        const text = panel.querySelector('.info');
        return {music:poster.classList.contains('music-cover'),width:size.width,height:size.height,
          fit:image && getComputedStyle(image).objectFit,position:image && getComputedStyle(image).objectPosition,
          natural:image && [image.naturalWidth,image.naturalHeight],
          overflow:text.scrollWidth - text.clientWidth, end:!!panel.querySelector('.time-end')};
      });
      return {width:box.width, height:box.height, overflow:ha.scrollWidth - ha.clientWidth,
        rows:card.getGridOptions().rows, panels};
    })""")


def validate_geometry(cards):
    for card in cards:
        assert card["rows"] == "auto" and card["height"] > 0 and card["overflow"] <= 1, card
        for panel in card["panels"]:
            assert panel["overflow"] <= 1, panel
            if panel["music"]:
                assert abs(panel["width"] - panel["height"]) <= 1 and not panel["end"], panel
                if panel["natural"]:
                    assert panel["fit"] == "cover" and panel["position"] == "50% 50%", panel
            else:
                assert abs(panel["height"] / panel["width"] - 1.5) < .04 and panel["end"], panel
        assert len({panel["width"] for panel in card["panels"]}) == 1, card


def validate_crop(page, images):
    # Compare the painted (not natural) image against the center crop. Ignore
    # rounded corners, and allow a few levels for browser/Pillow resampling.
    for index, name in enumerate(("vertical", "original", "horizontal")):
        painted = Image.open(BytesIO(page.locator("img.poster").nth(index).screenshot())).convert("RGB")
        source = Image.open(BytesIO(images[name])).convert("RGB")
        w, h = source.size
        side = min(w, h)
        crop = source.crop(((w-side)//2, (h-side)//2, (w+side)//2, (h+side)//2))
        w, h = painted.size
        region = (8, 8, w-8, h-8)

        def error(candidate):
            expected = candidate.resize(painted.size, Image.Resampling.LANCZOS).crop(region)
            return sum(ImageStat.Stat(ImageChops.difference(painted.crop(region), expected)).mean) / 3

        # Chromium can decode at an intermediate resolution under scrolling.
        # The correct geometry must still match more closely than deformation
        # (wide/tall) or a fabricated further crop (square).
        wrong = source if name != "original" else source.crop((100, 100, 500, 500))
        assert error(crop) < 10 and error(crop) + 1 < error(wrong), (name, error(crop), error(wrong))


def capture(browser, name, images, output):
    page, errors, requests = open_view(browser, name, images)
    if name == "pochettes":
        page.locator(".music-placeholder").nth(1).wait_for()
        page.wait_for_function("() => [...document.querySelectorAll('.reference')].every(i=>i.complete && i.naturalWidth)")
        page.locator("img.poster").nth(2).wait_for()
    else:
        page.locator(".poster-wrap img").first.wait_for()
    page.wait_for_function("""() => [...document.querySelectorAll('tracearr-stream-card,tracearr-streams-card')]
      .every(card => [...card.shadowRoot.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0))""")
    cards = measure(page)
    validate_geometry(cards)
    assert sum(len(card["panels"]) for card in cards) == (5 if name in ("styles", "pochettes") else
        3 if name in ("mixte", "musique", "carousel") else 1)
    assert requests and not errors, errors
    if name == "pochettes":
        assert [card["panels"][0]["natural"] for card in cards] == [[400, 600], [600, 600], [600, 400], None, None]
        assert page.locator(".music-placeholder").count() == 2 and 9 in requests
        validate_crop(page, images)
    if name == "styles":
        for style in ("classic", "premium", "cinema", "minimal", "technical"):
            assert page.locator(f".tech-{style} [data-tech=sample_rate]").count() == 1
    if name == "transcodage":
        badge = page.locator('[data-tech=audio_format]')
        assert badge.locator("strong").all_text_contents() == ["FLAC", "AAC"]
        assert "→" in badge.inner_text()
    if name == "pause":
        assert page.locator(".time-paused").inner_text() == "En pause"
        assert page.locator(".time-remaining").inner_text().startswith("-")
    if name == "carousel":
        page.locator("button[data-step='1']").click()
        page.wait_for_function("() => document.querySelector('tracearr-streams-card').shadowRoot.querySelector('.carousel').scrollLeft > 0")
        page.locator("h1").click()
    image = Image.open(BytesIO(page.locator("#capture").screenshot(animations="disabled"))).convert("RGB")
    image.save(output / f"{name}.webp", format="WEBP", quality=93, method=6)
    if name == "carousel":
        page.evaluate("window.musicBench.startChanges()")
        page.get_by_text("Passage au signal suivant", exact=True).wait_for()
        page.evaluate("window.musicBench.secondChange()")
        page.get_by_text("Signal final", exact=True).wait_for()
        page.wait_for_function("""() => {
          const carousel = document.querySelector('tracearr-streams-card').shadowRoot.querySelector('.carousel');
          const poster = carousel.querySelector('[data-session="direct"] img.poster');
          return carousel === window.oldCarousel && Math.abs(carousel.scrollLeft-window.oldScroll) <= 1 &&
            poster?.naturalWidth === 600 && poster?.naturalHeight === 600;
        }""")
        assert 4 in requests and requests[-1] == 1 and not errors
    page.close()


def widths(browser, images):
    for width in (250, 320, 520, 760):
        for compact in ("", "&compact"):
            for separate in ("", "&separate"):
                # The showcase frame includes 24 px padding on either side.
                page, errors, _ = open_view(browser, "largeur", images, width + 48, compact + separate)
                page.locator('[data-session=direct] img.poster').wait_for()
                cards = measure(page)
                assert abs(cards[0]["width"] - width) <= 1, cards
                validate_geometry(cards)
                assert page.get_by_text("UneArchiveDeNuitAuNomExceptionnellementLongSansSéparateursDeMots",
                                        exact=False).count() == 1
                assert not errors
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
            for view in VIEWS:
                capture(browser, view, images, args.output)
                print(f"{view}: OK")
            widths(browser, images)
            print("16 combinaisons largeur × densité × disposition : OK")
        finally:
            browser.close()

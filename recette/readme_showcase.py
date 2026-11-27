"""Capture the stable module with fictional data and original vector artwork.

Run from any directory with Playwright, Chromium and ImageMagick installed:
    python recette/readme_showcase.py [--chromium /usr/bin/chromium]
"""
import argparse
from pathlib import Path
import random
import subprocess
import tempfile

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/images/showcase"
ORIGIN = "http://127.0.0.1:18430"
HTML = "recette/readme_showcase.html"
MODULE = "custom_components/tracearr_ha/frontend/tracearr-card.js"
VARIANTS = {
    "overview-dark": "overview",
    "overview-cinema": "overview&cinema",
    "individual-dark": "individual",
    "individual-cinema": "individual&cinema",
    "carousel": "carousel&cinema",
    "badge-styles": "styles",
}
PALETTES = {
    "orbit": ("#081b31", "#188fa1", "#f6c287", "THE QUIET", "ORBIT"),
    "glass": ("#150d29", "#8740a5", "#ff9a82", "CITIES OF", "GLASS"),
    "tide": ("#091e2d", "#316e89", "#ffc17c", "WHERE THE", "TIDE SLEEPS"),
}


def art(name):
    key = name.removesuffix("-avatar")
    deep, color, light, line_one, line_two = PALETTES[key]
    if name.endswith("-avatar"):
        mark = {
            "orbit": '<path d="M28 48l20-22 20 22-20 22z" fill="none" stroke-width="4"/><circle cx="48" cy="48" r="6"/>',
            "glass": '<path d="M29 63V41l19-13 19 13v22L48 74z" fill="none" stroke-width="4"/><path d="M29 41l19 13 19-13M48 54v20" fill="none" stroke-width="4"/>',
            "tide": '<path d="M25 47q12-20 24 0t24 0M25 60q12-20 24 0t24 0" fill="none" stroke-width="4"/>',
        }[key]
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="{deep}"/><circle cx="48" cy="48" r="38" fill="{color}"/><g fill="{light}" stroke="{light}">{mark}</g></svg>'
    rand = random.Random(key)
    grains = "".join(
        f'<circle cx="{rand.randrange(420)}" cy="{rand.randrange(535)}" r="{rand.uniform(.5,2.1):.1f}" opacity="{rand.uniform(.1,.6):.2f}"/>'
        for _ in range(170)
    )
    if key == "orbit":
        scene = '''
          <ellipse cx="215" cy="276" rx="190" ry="49" transform="rotate(-24 215 276)" fill="none" stroke="#aaf3f6" stroke-opacity=".65" stroke-width="2"/>
          <circle cx="215" cy="252" r="123" fill="url(#planet)"/>
          <path d="M98 285c-36 31-58 49-57 63 2 28 81 12 176-31 96-43 164-99 166-121" fill="none" stroke="#f8c988" stroke-width="3"/>
          <path d="M0 503L101 451l76 30 100-57 143 46v160H0z" fill="#071525"/>
          <path d="M0 533l131-48 83 19 85-33 121 34v125H0z" fill="#080f1d"/>
        '''
    elif key == "glass":
        towers = []
        for x, y, w in [(12,312,58),(67,244,69),(129,292,50),(166,176,71),(226,230,65),(281,147,66),(339,258,81)]:
            towers.append(f'<path d="M{x} 482V{y+31}l{w*.65} -31 {w*.35} 22v300z" fill="url(#glass)"/>')
            towers += [f'<path d="M{x+13} {j}l{w*.53} -22" stroke="#ffc9cf" opacity=".44"/>' for j in range(y+48,459,16)]
        scene = f'<circle cx="290" cy="214" r="112" fill="url(#planet)"/>{"".join(towers)}<path d="M0 475l161-34 94 20 165-33v202H0z" fill="#110e22"/>'
    else:
        waves = "".join(
            f'<path d="M-40 {y}q100 -43 193 3t286 -12" fill="none" stroke="{light}" opacity="{v}" stroke-width="2"/>'
            for y,v in [(324,.27),(345,.47),(370,.26),(398,.52),(430,.21),(458,.37),(477,.22)]
        )
        scene = f'<circle cx="226" cy="246" r="95" fill="url(#planet)"/><path d="M0 329q116 -45 251 -4t169 -8v313H0z" fill="#0f354d"/>{waves}<path d="M0 510l92-35 58 25 80-22 96 26 94-40v166H0z" fill="#0a1726"/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 630">
      <defs>
        <linearGradient id="sky" x2=".7" y2="1" gradientUnits="objectBoundingBox">
          <stop stop-color="{deep}"/><stop offset=".65" stop-color="{color}"/><stop offset="1" stop-color="{deep}"/>
        </linearGradient>
        <radialGradient id="planet" cx=".34" cy=".25" r=".8">
          <stop stop-color="#fff0c4"/><stop offset=".46" stop-color="{light}"/><stop offset="1" stop-color="{color}"/>
        </radialGradient>
        <linearGradient id="glass" x2="1" y2=".3">
          <stop stop-color="#27153f"/><stop offset=".65" stop-color="#9f558a"/><stop offset="1" stop-color="#311735"/>
        </linearGradient>
      </defs>
      <rect width="420" height="630" fill="url(#sky)"/>
      <g fill="#fff1dc">{grains}</g>{scene}
      <g fill="#fff0dc" text-anchor="middle" font-family="sans-serif">
        <text x="210" y="71" font-size="16" letter-spacing="5">ORIGINAL FICTION</text>
        <text x="210" y="553" font-size="23" font-weight="600" letter-spacing="8">{line_one}</text>
        <text x="210" y="591" font-size="36" font-weight="800" letter-spacing="4">{line_two}</text>
      </g>
    </svg>'''


def serve(route):
    # No real listener, external network, HA API, signed URLs or credentials.
    url = route.request.url.removeprefix(ORIGIN + "/").split("?", 1)[0]
    if route.request.url.startswith(ORIGIN + "/") and url in (HTML, MODULE):
        route.fulfill(path=ROOT / url, content_type="text/html; charset=utf-8" if url == HTML else "text/javascript")
    elif route.request.url.startswith(ORIGIN + "/showcase-art/") and url.endswith(".svg"):
        route.fulfill(body=art(Path(url).stem), content_type="image/svg+xml")
    else:
        route.abort()


def capture(browser, name, query, temp):
    page = browser.new_page(viewport={"width": 1040, "height": 1100}, color_scheme="dark")
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("**/*", serve)
    page.goto(f"{ORIGIN}/{HTML}?view={query}")
    page.locator(".stream").first.wait_for()
    page.wait_for_function("""() => [...document.querySelectorAll('tracearr-stream-card,tracearr-streams-card')]
      .every(card => [...card.shadowRoot.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0))""")
    if name == "carousel":
        page.locator("button[data-step='1']").click()
        page.wait_for_function("""() =>
          document.querySelector('tracearr-streams-card').shadowRoot.querySelector('.carousel').scrollLeft > 0""")
        page.locator("h1").click()
    if name.startswith("overview"):
        assert page.locator(".stream").count() == 3
        assert page.locator(".time-paused").count() == 1
        assert page.locator(".stream-indicator.transcode").count() == 2
        assert page.locator(".stream-indicator.direct").count() == 4
        assert page.locator("img.poster").count() == 3
        assert page.locator("img.avatar").count() == 3
        assert page.locator("img.backdrop-image").count() == (3 if name.endswith("cinema") else 0)
    if name == "badge-styles":
        assert page.locator(".technical").count() == 4 and page.locator(".chip").count() == 2
    assert page.locator("#capture").evaluate("el => el.scrollWidth <= el.clientWidth")
    assert not errors, errors
    png = temp / f"{name}.png"
    page.locator("#capture").screenshot(path=png, animations="disabled")
    page.close()
    subprocess.run(["convert", str(png), "-strip", "-define", "webp:method=6", "-quality", "92",
                    str(OUTPUT / f"{name}.webp")], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    assert (ROOT / MODULE).read_bytes().startswith(b"/* Tracearr HA Lovelace cards 0.1.18 - ")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp, sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chromium, args=["--disable-background-networking"])
        try:
            for name, query in VARIANTS.items():
                capture(browser, name, query, Path(temp))
                print(f"{name}: {(OUTPUT / f'{name}.webp').stat().st_size} bytes")
        finally:
            browser.close()

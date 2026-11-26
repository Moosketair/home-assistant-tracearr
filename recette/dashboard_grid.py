"""Measure sizing in a real, isolated HA frontend with the dashboard_sim fixture."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys

from playwright.sync_api import expect, sync_playwright

from dashboard_browser import scenario
from dashboard_seed import BASE, PASSWORD, USER
from simulateur import KEY


def run(label, module, output):
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path="/usr/bin/chromium",
                                     args=["--disable-background-networking"])
        page = browser.new_page(viewport={"width": 1380, "height": 990})
        # Avoid 304 after login preloads the dashboard resources; verify the
        # actual JS bytes received by Chromium, not just the resource URL.
        page.route("**/tracearr_ha/tracearr-card.js*", lambda route: route.continue_())
        errors = []
        page.on("pageerror", lambda error: errors.append({"path":page.url.split("?")[0], "stack":error.stack or str(error)}))
        unknown_commands = []

        def watch_socket(socket):
            commands = {}

            def sent(payload):
                request = json.loads(payload)
                if isinstance(request, dict) and "id" in request:
                    commands[request["id"]] = request["type"]

            def received(payload):
                for response in [parsed] if isinstance(parsed := json.loads(payload), dict) else parsed:
                    if response.get("error", {}).get("code") == "unknown_command":
                        unknown_commands.append({"path":page.url.split("?")[0],
                                                 "type":commands.get(response["id"], "?")})

            socket.on("framesent", sent)
            socket.on("framereceived", received)

        page.on("websocket", watch_socket)
        scenario("grid-empty")
        page.goto(BASE)
        login = page.locator("input[name=username]")
        expect(login).to_be_visible(timeout=20000)
        login.fill(USER)
        page.locator("input[name=password]").fill(PASSWORD)
        page.get_by_role("button", name="Se connecter", exact=True).or_(
            page.get_by_role("button", name="Log in", exact=True)).first.click()
        page.wait_for_function("document.querySelector('home-assistant')?.hass?.connected")
        page.evaluate("""async key => {
          const hass = document.querySelector('home-assistant').hass;
          const call = (type, data={}) => hass.callWS({type,...data});
          let [entry] = (await call('tracearr_ha/get').catch(() => ({entries:[]}))).entries;
          if (!entry) {
            const path = 'config/config_entries/flow';
            const flow = await hass.callApi('POST', path, {handler:'tracearr_ha'});
            const result = await hass.callApi('POST', `${path}/${flow.flow_id}`, {
              url:'http://127.0.0.1:18425',token:key});
            if (result.type !== 'create_entry') throw Error(result.type);
            entry = {id:result.result.entry_id};
          }
          const registry = await call('config/entity_registry/list');
          const entity = registry.find(row => row.config_entry_id === entry.id &&
            row.entity_id.startsWith('binary_sensor.')).entity_id;
          const common = {type:'custom:tracearr-streams-card',show_poster:false,show_avatar:false,show_title:false,
            empty_mode:'header_only',show_device:false,show_server:false,show_codecs:true,
            technical_badge_style:'technical',technical_transcode_mode:'source_to_destination'};
          const tile = {type:'tile',entity,name:'Tuile native · 1 ligne',grid_options:{columns:6,rows:1}};
          const automatic = {...common,grid_options:{columns:6,rows:'auto'}};
          const group = (config={}) => ({...common,...config});
          const grid = cards => ({type:'grid',cards});
          const variants = [
            group({title:'Sans taille enregistrée',show_title:true}),
            group({title:'Badges longs',show_title:true, grid_options:{columns:6,rows:'auto'},header_entity_badges:[
              {id:'long',entity,label:'État de la connexion au serveur multimédia de démonstration dans le séjour',
                show_name:true,align:'left'},
              {id:'longer',entity,label:'Disponibilité des lectures dans la salle de cinéma et partout ailleurs',
                show_name:true,align:'center'}]}),
            group({title:'Deux lignes explicites',show_title:true,grid_options:{columns:6,rows:2}}),
            group({title:'Une ligne explicite',show_title:true,grid_options:{columns:6,rows:1}}),
            group({title:'Message affiché',show_title:true,empty_mode:'message',grid_options:{columns:6,rows:'auto'}}),
            group({title:'Carte masquée',empty_mode:'hide'}),
            group({title:'Carrousel',show_title:true,mode:'carousel',carousel_transition:'none',grid_options:{rows:'auto'}}),
            group({title:'Individuelle',show_title:true,type:'custom:tracearr-stream-card',grid_options:{rows:'auto'}}),
          ];
          const view = {title:'Dimensionnement Sections',path:'sections',type:'sections',max_columns:2,
            sections:[grid([tile,automatic,...variants.slice(0,6)]),grid(variants.slice(6))]};
          const masonry = {title:'Masonry',path:'masonry',type:'masonry',cards:[group()]};
          const existing = await call('lovelace/dashboards/list');
          if (!existing.some(row=>row.url_path==='tracearr-grille')) await call('lovelace/dashboards/create',{
            url_path:'tracearr-grille',title:'Recette Tracearr',show_in_sidebar:true,require_admin:false});
          await call('lovelace/config/save',{url_path:'tracearr-grille',config:{views:[view,masonry]}});
        }""", KEY)
        modules = []
        page.on("response", lambda response: modules.append(response)
                if "/tracearr_ha/tracearr-card.js?" in response.url else None)
        url = f"{BASE}/tracearr-grille/"
        page.goto(url + "sections")
        expect(page.locator("hui-sections-view")).to_be_visible()
        pending_http = page.get_by_role("heading", name=re.compile("configuration du serveur HTTP|HTTP server configuration", re.I))
        if pending_http.is_visible():
            page.get_by_role("button", name=re.compile("^(Confirmer|Confirm)$")).click()
            expect(pending_http).not_to_be_visible()
        native = page.locator("hui-tile-card ha-card").first
        groups = page.locator("tracearr-streams-card")
        expect(groups).to_have_count(8)
        single = page.locator("tracearr-stream-card")
        auto, default, long, fixed, fixed_one, message, hidden, carousel = [groups.nth(i) for i in range(8)]
        expect(auto.locator(".metric")).to_contain_text("0")
        expect(message.locator(".empty-message")).to_be_visible()
        expect(hidden).not_to_be_visible()
        response = next(response for response in modules if response.status == 200)
        assert hashlib.sha256(response.body()).digest() == hashlib.sha256(module.read_bytes()).digest()
        names = {"auto":auto,"default":default,"long":long,"fixed":fixed,"fixed_one":fixed_one,
                 "message":message,"hidden":hidden,"carousel":carousel,"single":single}

        def measure():
            # Allow the native ha-card's short theme transition to settle.
            page.evaluate("""async () => {
              await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              const collect = root => [...root.querySelectorAll('*')].flatMap(el =>
                el.matches('tracearr-streams-card,tracearr-stream-card') ?
                  el.shadowRoot?.querySelector('ha-card')?.getAnimations() || [] :
                  el.shadowRoot ? collect(el.shadowRoot) : []);
              await Promise.allSettled(collect(document).map(animation=>animation.finished));
            }""")
            native_box = native.bounding_box()
            result = {"native":native_box["height"],"native_top":native_box["y"]}
            for name, locator in names.items():
                result[name] = locator.evaluate("""el => {
                  const surface=el.shadowRoot.querySelector('ha-card');
                  const rect=node=>node?.getBoundingClientRect();
                  const frame=rect(surface), header=rect(el.shadowRoot.querySelector('.head'));
                  let wrapper=el;
                  while (wrapper && !wrapper.matches('.card')) {
                    wrapper=wrapper.parentElement || wrapper.getRootNode().host;
                  }
                  const grid=wrapper.parentElement;
                  const nativeStyles=getComputedStyle(grid);
                  const badges=[...el.shadowRoot.querySelectorAll('.metric')].map(rect);
                  const root=el.shadowRoot.querySelector('.root');
                  const row=Math.max(0,...badges.map(b=>b.bottom)) - Math.min(...badges.map(b=>b.top));
                  const within=badges.every(b=>b.left>=frame.left-.5 && b.right<=frame.right+.5);
                  const overlap=[...grid.children].map(rect).some(b=>frame && b.width && b.height &&
                    Math.min(b.right,frame.right)-Math.max(b.left,frame.left)>.5 &&
                    Math.min(b.bottom,frame.bottom)-Math.max(b.top,frame.top)>.5 &&
                    !(b.left<=frame.left+.5 && b.right>=frame.right-.5 && b.top<=frame.top+.5 && b.bottom>=frame.bottom-.5));
                  return {height:frame?.height??0,width:frame?.width??0,top:frame?.top??null,
                    rowHeight:parseFloat(nativeStyles.getPropertyValue('--row-height')),
                    rowGap:parseFloat(nativeStyles.rowGap), rows:wrapper.style.getPropertyValue('--row-size')||'auto',
                    center:header && (header.top+header.bottom-frame.top-frame.bottom)/2,
                    badgesSpan:badges.length ? row : 0, within, overlap,
                    scroll:root ? Math.max(0,root.scrollHeight-root.clientHeight) : 0};
                }""")
            return result

        before = measure()
        page.screenshot(path=output / f"{label}-vide.png", animations="disabled", full_page=True)
        if label.endswith("base"):
            before["browser_errors"] = errors
            before["unknown_commands"] = unknown_commands
            print(json.dumps(before, ensure_ascii=False, indent=2))
            assert before["auto"]["height"] > before["native"], before
            assert before["default"]["rows"] == "4", before["default"]
            return
        assert before["auto"]["height"] == before["default"]["height"] == before["native"], before
        assert before["auto"]["top"] == before["native_top"], before
        assert abs(before["auto"]["center"]) <= .5 and abs(before["default"]["center"]) <= .5, before
        assert before["long"]["height"] > before["native"] and before["long"]["within"], before
        assert before["fixed"]["height"] == 120 and before["fixed_one"]["height"] == before["native"], before
        assert before["message"]["height"] > before["native"] and before["hidden"]["height"] == 0, before
        dashboard = page.evaluate("""() => document.querySelector('home-assistant').hass.callWS({
          type:'lovelace/config',url_path:'tracearr-grille'})""")
        results = {"empty":before}

        for action, count in (("one",1),("three",3),("empty",0)):
            scenario("grid-" + action)
            expect(auto.locator(".stream")).to_have_count(count)
            expect(carousel.locator(".stream")).to_have_count(count)
            expect(single.locator(".stream")).to_have_count(int(bool(count)))
            results[action if count else "stopped"] = measure()
            if count == 1:
                expect(auto.locator('[data-tech="hdr"]')).to_have_text("HDR10+HDR dynamique")
                expect(auto.locator('[data-tech="hdr"]')).to_have_attribute("title", re.compile("destination inconnue"))
            if count == 3:
                page.screenshot(path=output / f"{label}-lectures.png", animations="disabled")
                carousel.get_by_role("button", name="Suivant").click()
                track = carousel.locator(".streams.carousel")
                assert track.evaluate("el => el.scrollLeft") > 0
                assert abs(measure()["carousel"]["height"] - results["three"]["carousel"]["height"]) <= 1
        assert results["one"]["auto"]["height"] > before["native"]
        assert results["three"]["auto"]["height"] > results["one"]["auto"]["height"]
        assert results["stopped"]["auto"]["height"] == before["native"]
        assert results["three"]["fixed"]["height"] == 120 and results["three"]["fixed"]["scroll"] > 0
        assert all(value["within"] and not value["overlap"]
                   for state in results.values() for value in state.values() if isinstance(value, dict))

        page.set_viewport_size({"width":375,"height":900})
        results["narrow"] = measure()
        assert results["narrow"]["long"]["within"] and results["narrow"]["long"]["height"] >= before["long"]["height"]
        page.set_viewport_size({"width":1380,"height":990})
        scenario("down")
        expect(auto.locator(".availability-status")).to_contain_text("données non actualisées", timeout=85000)
        expect(hidden.locator(".availability-status")).to_be_visible()
        results["unavailable"] = measure()
        assert results["unavailable"]["auto"]["height"] > before["native"]
        scenario("grid-recover")
        expect(auto.locator(".availability-status")).to_have_text("", timeout=85000)
        expect(hidden).not_to_be_visible()
        assert measure()["auto"]["height"] == before["native"]
        assert page.evaluate("""() => document.querySelector('home-assistant').hass.callWS({
          type:'lovelace/config',url_path:'tracearr-grille'})""") == dashboard
        page.goto(url + "masonry")
        expect(page.locator("hui-masonry-view")).to_be_visible()
        masonry = page.locator("tracearr-streams-card")
        expect(masonry.locator(".metric")).to_have_text("0 flux")
        # A header can render at mount before the dashboard subscription is
        # acknowledged. Let both the mounted card and the simulator settle.
        page.wait_for_function("""async () => {
          const hass = document.querySelector('home-assistant')?.hass;
          if (!hass?.connected) return false;
          const [{sse_connected}] = (await hass.callWS({type:'tracearr_ha/get'})).entries;
          return sse_connected;
        }""", polling=250, timeout=85000)
        masonry.evaluate("el => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
        empty = masonry.locator("ha-card").bounding_box()["height"]
        scenario("grid-one")
        expect(masonry.locator(".stream")).to_be_visible(timeout=20000)
        playing = masonry.locator("ha-card").bounding_box()["height"]
        assert playing > empty
        results["masonry"] = {"empty":empty,"one":playing}
        results["browser_errors"] = errors
        results["unknown_commands"] = unknown_commands
        print(json.dumps(results, ensure_ascii=False, indent=2))
        # Core 2025.6's own frontend calls recorder/info on navigation even
        # when the isolated fixture has no recorder. Allow only those
        # correlated rejections, never an unknown Tracearr command.
        assert all(command["type"] == "recorder/info" for command in unknown_commands), unknown_commands
        assert all(error["stack"] == "Object" for error in errors), errors
        assert Counter(error["path"] for error in errors) <= Counter(cmd["path"] for cmd in unknown_commands), errors
        browser.close()


if __name__ == "__main__":
    name, js, directory = sys.argv[1:]
    run(name, Path(js), Path(directory))

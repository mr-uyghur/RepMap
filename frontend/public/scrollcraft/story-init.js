    ScrollCraft.mount(document.body);
    (function () {
      const DATA = window.REPMAP_ATLAS_DATA || { nc116: [], nc119: [], heroStates: {} };

      const ANCHOR_DELEGATIONS = {
        "95112": {
          zip: "95112",
          city: "San Jose, CA",
          state: "CA",
          district: 18,
          coord: "37.3446° N, 121.8834° W",
          house: { id: 3353, name: "Zoe Lofgren", party: "democrat", bioguide: "L000397", room: "1401 Longworth HOB", phone: "202-225-3072", att: "97.4%", bills: "100+", collab: "64.2%", comms: ["House Science, Space, and Technology", "House Committee on the Judiciary"] },
          senators: [
            { id: 3294, name: "Alejandro Padilla", party: "democrat", room: "331 Hart SOB" },
            { id: 3250, name: "Adam Schiff", party: "democrat", room: "112 Hart SOB" }
          ]
        },
        "27701": {
          zip: "27701",
          city: "Durham, NC",
          state: "NC",
          district: 4,
          coord: "35.9992° N, 78.8979° W",
          house: { id: 3633, name: "Valerie Foushee", party: "democrat", bioguide: "F000477", room: "2452 Rayburn HOB", phone: "202-225-1784", att: "96.8%", bills: "100+", collab: "71.0%", comms: ["House Transportation and Infrastructure", "House Science, Space, and Technology"] },
          senators: [
            { id: 3280, name: "Ted Budd", party: "republican", room: "354 Russell SOB" },
            { id: 3272, name: "Thom Tillis", party: "republican", room: "113 Dirksen SOB" }
          ]
        },
        "10001": {
          zip: "10001",
          city: "New York, NY",
          state: "NY",
          district: 12,
          coord: "40.7506° N, 73.9973° W",
          house: { id: 3363, name: "Jerrold Nadler", party: "democrat", bioguide: "N000002", room: "2132 Rayburn HOB", phone: "202-225-5635", att: "96.2%", bills: "100+", collab: "66.8%", comms: ["House Committee on the Judiciary", "House Transportation and Infrastructure"] },
          senators: [
            { id: 3251, name: "Charles Schumer", party: "democrat", room: "322 Hart SOB" },
            { id: 3225, name: "Kirsten Gillibrand", party: "democrat", room: "478 Russell SOB" }
          ]
        },
        "78701": {
          zip: "78701",
          city: "Austin, TX",
          state: "TX",
          district: 37,
          coord: "30.2706° N, 97.7426° W",
          house: { id: 3332, name: "Lloyd Doggett", party: "democrat", bioguide: "D000399", room: "2307 Rayburn HOB", phone: "202-225-4865", att: "98.7%", bills: "100+", collab: "62.1%", comms: ["House Committee on Ways and Means", "House Committee on the Budget"] },
          senators: [
            { id: 3216, name: "John Cornyn", party: "republican", room: "517 Hart SOB" },
            { id: 3266, name: "Ted Cruz", party: "republican", room: "167 Russell SOB" }
          ]
        },
        "60601": {
          zip: "60601",
          city: "Chicago, IL",
          state: "IL",
          district: 7,
          coord: "41.8852° N, 87.6215° W",
          house: { id: 3327, name: "Danny Davis", party: "democrat", bioguide: "D000096", room: "2159 Rayburn HOB", phone: "202-225-5006", att: "94.6%", bills: "100+", collab: "67.9%", comms: ["House Committee on Ways and Means"] },
          senators: [
            { id: 3217, name: "Richard Durbin", party: "democrat", room: "711 Hart SOB" },
            { id: 3260, name: "Tammy Duckworth", party: "democrat", room: "524 Hart SOB" }
          ]
        }
      };

      let activeZip = "95112";
      let ncManualMode = "auto";
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

      function renderHeroGeometry(zipKey) {
        const geo = DATA.heroStates[zipKey] || DATA.heroStates["95112"];
        const stateSvg = document.getElementById("hero-state-svg");
        const focalSvg = document.getElementById("hero-focal-svg");
        if (!geo || !stateSvg || !focalSvg) return;

        let stateMarkup = "";
        for (const item of geo.statePaths) {
          const isDem = item.party === "democrat";
          const fill = item.isFocal
            ? "rgba(245, 158, 11, 0.42)"
            : (isDem ? "rgba(59, 130, 246, 0.20)" : "rgba(239, 68, 68, 0.20)");
          const stroke = item.isFocal
            ? "#fbbf24"
            : (isDem ? "rgba(96, 165, 250, 0.62)" : "rgba(248, 113, 113, 0.62)");
          const sw = item.isFocal ? "2.4" : "1.1";
          stateMarkup += `<path d="${item.d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>`;
        }
        stateSvg.innerHTML = stateMarkup;

        const fc = geo.focalCutout;
        if (fc && fc.d) {
          focalSvg.innerHTML = `
            <path d="${fc.d}" fill="rgba(245, 158, 11, 0.22)" stroke="#fbbf24" stroke-width="2.6"/>
            <circle cx="${fc.cx}" cy="${fc.cy}" r="5.5" fill="#fbbf24"/>
            <circle cx="${fc.cx}" cy="${fc.cy}" r="16" fill="none" stroke="#fbbf24" stroke-width="1.2" stroke-dasharray="3 3"/>
            <text x="${Math.min(240, fc.cx + 14)}" y="${Math.max(24, fc.cy - 10)}" fill="#fde68a" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600">${geo.state}-${geo.district} · ${geo.zip}</text>
          `;
        }
      }

      function renderNorthCarolinaPeak() {
        const svg116 = document.getElementById("nc-116-svg");
        const svg119 = document.getElementById("nc-119-svg");
        if (!svg116 || !svg119) return;

        let m116 = "";
        for (const d of DATA.nc116) {
          const isDem = d.party === "democrat";
          const fill = isDem ? "rgba(59, 130, 246, 0.18)" : "rgba(148, 163, 184, 0.14)";
          const stroke = isDem ? "rgba(96, 165, 250, 0.75)" : "rgba(203, 213, 225, 0.55)";
          m116 += `<path d="${d.d}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-dasharray="4 2"/>`;
          m116 += `<text x="${d.cx}" y="${d.cy}" fill="rgba(244,241,234,0.65)" font-family="JetBrains Mono, monospace" font-size="10" text-anchor="middle">NC-${d.num}</text>`;
        }
        svg116.innerHTML = m116;

        let m119 = "";
        for (const d of DATA.nc119) {
          const isDem = d.party === "democrat";
          const isNewSeat = d.num === 14;
          const fill = isNewSeat
            ? "rgba(245, 158, 11, 0.36)"
            : (isDem ? "rgba(59, 130, 246, 0.34)" : "rgba(239, 68, 68, 0.30)");
          const stroke = isNewSeat
            ? "#fbbf24"
            : (isDem ? "#60a5fa" : "#f87171");
          const sw = isNewSeat ? "2.4" : "1.6";
          m119 += `<path d="${d.d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
          m119 += `<text x="${d.cx}" y="${d.cy}" fill="#f4f1ea" font-family="JetBrains Mono, monospace" font-size="10.5" font-weight="600" text-anchor="middle">${isNewSeat ? "★ NC-14" : "NC-" + d.num}</text>`;
        }
        svg119.innerHTML = m119;
      }

      function selectAnchorZip(zipKey) {
        const info = ANCHOR_DELEGATIONS[zipKey];
        if (!info) return;
        activeZip = zipKey;

        document.querySelectorAll(".zip-chip").forEach((btn) => {
          btn.setAttribute("aria-pressed", btn.dataset.zip === zipKey ? "true" : "false");
        });

        renderHeroGeometry(zipKey);

        const globeUrl = `/?mode=map&zip=${info.zip}&rep=${info.house.id}`;
        const chromeZip = document.getElementById("chrome-active-zip");
        const chromeCta = document.getElementById("chrome-launch-cta");
        if (chromeZip) chromeZip.textContent = `ZIP ${info.zip} · ${info.state}-${info.district}`;
        if (chromeCta) chromeCta.href = globeUrl;

        const hudCoord = document.getElementById("hud-coord");
        const hudDist = document.getElementById("hud-district");
        if (hudCoord) hudCoord.textContent = info.coord;
        if (hudDist) hudDist.textContent = `${info.state} · District ${info.district}`;

        const beat2Sub = document.getElementById("beat2-sub");
        const beat2List = document.getElementById("hero-delegation-list");
        const beat2Link = document.getElementById("beat2-globe-link");
        if (beat2Sub) {
          beat2Sub.textContent = `ZIP ${info.zip} in ${info.city} sits inside ${info.state} Congressional District ${info.district}. Your ballot is represented simultaneously by one House member and two statewide Senators.`;
        }
        if (beat2Link) beat2Link.href = globeUrl;
        if (beat2List) {
          const rows = [
            { name: info.house.name, role: `U.S. House · ${info.state} District ${info.district} · ${info.house.room}`, party: info.house.party },
            ...info.senators.map((s) => ({ name: s.name, role: `U.S. Senate · ${info.state} · ${s.room}`, party: s.party }))
          ];
          beat2List.innerHTML = rows.map((r) => `
            <div class="hero-rep-row">
              <div>
                <div class="hero-rep-row__name">${r.name}</div>
                <div class="hero-rep-row__role">${r.role}</div>
              </div>
              <span class="party-pill party-pill--${r.party}">${r.party}</span>
            </div>
          `).join("");
        }

        const cBio = document.getElementById("active-card-bioguide");
        const cName = document.getElementById("active-card-name");
        const cSeat = document.getElementById("active-card-seat");
        const cParty = document.getElementById("active-card-party");
        const cAtt = document.getElementById("active-card-att");
        const cCollab = document.getElementById("active-card-collab");
        const cComms = document.getElementById("active-card-comms");
        const cRoom = document.getElementById("active-card-room");
        const cLink = document.getElementById("active-card-link");

        if (cBio) cBio.textContent = `ACTIVE ZIP ${info.zip} · BIOGUIDE ${info.house.bioguide}`;
        if (cName) cName.textContent = info.house.name;
        if (cSeat) cSeat.textContent = `U.S. House · ${info.state} District ${info.district}`;
        if (cParty) {
          cParty.textContent = info.house.party;
          cParty.className = `party-pill party-pill--${info.house.party}`;
        }
        if (cAtt) cAtt.textContent = info.house.att;
        if (cCollab) cCollab.textContent = info.house.collab;
        if (cComms) {
          cComms.innerHTML = info.house.comms.map((c) => `<span class="dossier-comm-chip">${c}</span>`).join("");
        }
        if (cRoom) cRoom.textContent = `${info.house.room} · ${info.house.phone}`;
        if (cLink) cLink.href = globeUrl;

        const closeZip = document.getElementById("close-readout-zip");
        const closeRep = document.getElementById("close-readout-rep");
        const closeSen = document.getElementById("close-readout-senate");
        const closeCta = document.getElementById("close-primary-cta");
        if (closeZip) closeZip.textContent = `ZIP ${info.zip} · ${info.city}`;
        if (closeRep) closeRep.textContent = `${info.state} District ${info.district} · Rep. ${info.house.name}`;
        if (closeSen) closeSen.textContent = info.senators.map((s) => s.name).join(" · ");
        if (closeCta) closeCta.href = globeUrl;
      }

      document.querySelectorAll(".zip-chip").forEach((btn) => {
        btn.addEventListener("click", () => selectAnchorZip(btn.dataset.zip));
      });

      const zipForm = document.getElementById("hero-zip-form");
      const zipInput = document.getElementById("hero-zip-input");
      const zipStatus = document.getElementById("hero-zip-status");
      if (zipForm && zipInput) {
        zipForm.addEventListener("submit", (e) => {
          const val = zipInput.value.trim();
          if (ANCHOR_DELEGATIONS[val]) {
            e.preventDefault();
            selectAnchorZip(val);
            if (zipStatus) zipStatus.textContent = `Locked ${val}`;
          } else if (/^\d{5}$/.test(val)) {
            if (zipStatus) zipStatus.textContent = `Opening ${val} on 3D Globe...`;
          } else {
            e.preventDefault();
            if (zipStatus) zipStatus.textContent = "Enter a 5-digit ZIP";
          }
        });
      }

      document.querySelectorAll(".redraw-mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          ncManualMode = btn.dataset.ncMode || "auto";
          document.querySelectorAll(".redraw-mode-btn").forEach((b) => {
            b.setAttribute("aria-pressed", b === btn ? "true" : "false");
          });
          syncScrollDrivenStages();
        });
      });

      document.querySelectorAll(".comm-filter-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const comm = btn.dataset.comm || "all";
          document.querySelectorAll(".comm-filter-btn").forEach((b) => {
            b.setAttribute("aria-pressed", b === btn ? "true" : "false");
          });
          document.querySelectorAll("#bipartite-edges path").forEach((edge) => {
            const match = comm === "all" || edge.dataset.edgeComm === comm;
            edge.style.opacity = match ? "1" : "0.14";
            edge.style.strokeWidth = match && comm !== "all" ? "3.2" : "2";
          });
          document.querySelectorAll("[data-hub-comm]").forEach((hub) => {
            const match = comm === "all" || hub.dataset.hubComm === comm;
            hub.style.opacity = match ? "1" : "0.32";
          });
          const statusEl = document.getElementById("comm-status-readout");
          const launchEl = document.getElementById("comm-launch-link");
          const closeComm = document.getElementById("close-comm-card");
          if (comm === "all") {
            if (statusEl) statusEl.textContent = "Showing all 5 standing committee hubs across 8 federal lawmakers (536 members in full graph).";
            if (launchEl) launchEl.href = "/?mode=map&committee=House%20Committee%20on%20Science%2C%20Space%2C%20and%20Technology";
          } else {
            if (statusEl) statusEl.textContent = `Filtered to ${comm}. Click Launch to inspect full chamber membership.`;
            const url = `/?mode=map&committee=${encodeURIComponent(comm)}`;
            if (launchEl) launchEl.href = url;
            if (closeComm) closeComm.href = url;
          }
        });
      });

      const atlasSec = document.getElementById("atlas");
      const heroStage = document.getElementById("hero-stage");
      const redrawSec = document.getElementById("redraw");
      const redrawStage = document.getElementById("redraw-stage");
      const enterSec = document.getElementById("enter");
      const enterStage = document.getElementById("enter-stage");
      const ncStack = document.getElementById("nc-svg-stack");
      const ncCaliper = document.getElementById("nc-caliper");
      const ncCaliperTag = document.getElementById("nc-caliper-tag");

      function syncScrollDrivenStages() {
        const isReduced = reducedMotion.matches;

        if (atlasSec && heroStage) {
          const p = parseFloat(atlasSec.style.getPropertyValue("--sc-p")) || 0;
          const stScale = (1 + p * 0.14).toFixed(3);
          const fcScale = (0.94 + p * 0.18).toFixed(3);
          heroStage.style.setProperty("--hero-state-scale", isReduced ? "1" : stScale);
          heroStage.style.setProperty("--hero-focal-scale", isReduced ? "1" : fcScale);
          heroStage.setAttribute("data-sc-verify-state", `hero:${Math.round(p * 100)}:${activeZip}`);
          if (isReduced) {
            heroStage.setAttribute("data-sc-verify-hold", "true");
          } else {
            heroStage.removeAttribute("data-sc-verify-hold");
          }
        }

        if (redrawSec && redrawStage && ncStack) {
          const rawP = parseFloat(redrawSec.style.getPropertyValue("--sc-p")) || 0;
          let morph = rawP;
          if (ncManualMode === "0") morph = 0;
          else if (ncManualMode === "1") morph = 1;
          else if (isReduced) morph = 0.65;
          else {
            morph = Math.max(0.02, Math.min(0.98, rawP));
          }

          const pct = Math.round(morph * 100);
          ncStack.style.setProperty("--nc-morph", morph.toFixed(3));
          if (ncCaliper) ncCaliper.style.left = `${pct}%`;
          if (ncCaliperTag) {
            ncCaliperTag.textContent = pct < 35
              ? `CD116 BASELINE · ${pct}%`
              : (pct < 72 ? `REAPPORTIONMENT SWEEP · ${pct}%` : `CD119 14-SEAT MAP · ${pct}%`);
          }
          redrawStage.setAttribute("data-sc-verify-state", `nc:caliper:${pct}`);
          if (isReduced) {
            redrawStage.setAttribute("data-sc-verify-hold", "true");
          } else {
            redrawStage.removeAttribute("data-sc-verify-hold");
          }
        }

        if (enterSec && enterStage) {
          const p = parseFloat(enterSec.style.getPropertyValue("--sc-p")) || 0;
          const phase = p < 0.22 ? Math.round(p * 100) : 100;
          enterStage.setAttribute("data-sc-verify-state", `enter:${phase}`);
          if (isReduced || p >= 0.22) {
            enterStage.setAttribute("data-sc-verify-hold", "true");
          } else {
            enterStage.removeAttribute("data-sc-verify-hold");
          }
        }
      }

      function handlePinnedFocus(e) {
        const cueEl = e.target.closest("[data-sc-cue]");
        const actEl = e.target.closest('[data-sc-act="pin"]');
        if (!cueEl || !actEl) return;
        const spec = (cueEl.getAttribute("data-sc-cue") || "").trim().split(/\s+/).map(Number);
        const targetP = spec.length >= 2 && !isNaN(spec[1]) ? (spec[0] + spec[1]) / 2 : Math.max(0.25, spec[0] || 0);
        const top = actEl.getBoundingClientRect().top + window.scrollY;
        const travel = Math.max(0, actEl.offsetHeight - window.innerHeight);
        if (travel > 0) {
          window.scrollTo({ top: Math.round(top + travel * targetP), behavior: "instant" });
        }
      }
      document.addEventListener("focusin", handlePinnedFocus);

      renderHeroGeometry(activeZip);
      renderNorthCarolinaPeak();
      syncScrollDrivenStages();

      let ticking = false;
      function requestTick() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          syncScrollDrivenStages();
        });
      }
      window.addEventListener("scroll", requestTick, { passive: true });
      window.addEventListener("resize", requestTick, { passive: true });
      setInterval(syncScrollDrivenStages, 120);
    })();

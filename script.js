// ========================================
// CREATE MAP
// ========================================

const indiaBounds = L.latLngBounds([6.0, 67.0], [38.5, 98.5]);

const map = L.map("map", {
    zoomControl: true,
    doubleClickZoom: false,
    maxBounds: indiaBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 4.4,
    maxZoom: 14
}).setView([23.5, 80], 4.8);

function updateMarkerLabelScale() {
    const container = map.getContainer();
    const zoom = map.getZoom();
    container.classList.toggle("map-zoom-low", zoom < 5.6);
    container.classList.toggle("map-zoom-mid", zoom >= 5.6 && zoom < 7.5);
    container.classList.toggle("map-zoom-high", zoom >= 7.5);
}

map.whenReady(updateMarkerLabelScale);
map.on("zoomend", updateMarkerLabelScale);

L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
).addTo(map);

map.createPane("statesPane");
map.createPane("districtPane");
map.createPane("markerPane");
map.getPane("statesPane").style.zIndex = 400;
map.getPane("districtPane").style.zIndex = 520;
map.getPane("markerPane").style.zIndex = 650;

const locationMarkerIcon = L.divIcon({
    className: "custom-map-marker location-map-marker",
    html: '<span class="marker-pin" aria-hidden="true"></span>',
    iconSize: [24, 34],
    iconAnchor: [12, 32],
    popupAnchor: [0, -30],
    tooltipAnchor: [0, -30]
});

const districtMarkerIcon = L.divIcon({
    className: "",
    html: `<img src="district-marker.gif" style="width:50px;height:50px;" onerror="this.style.display='none'">`,
    iconSize: [50, 50],
    iconAnchor: [25, 50]
});

let allMarkers = [];
let allDistrictMarkers = [];
let activeDistrictMarkers = [];
let statesLayer;
let districtFeatures = [];
let selectedDistrictLayer;
let selectedDistrictGroup = null;
let currentLocationGroups = [];
let currentDistrictGroups = [];

// ========================================
// SIDEBAR AND FILTER CONTROLS
// ========================================

const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const filterBtn = document.getElementById("filterBtn");
const filterPanel = document.getElementById("filterPanel");
const projectsBtn = document.getElementById("projectsBtn");
const projectsPanel = document.getElementById("projectsPanel");
const projectsTreeEl = document.getElementById("projectsTree");
const clearProjectBtn = document.getElementById("clearProjectSelection");
const projectSelectedLabelEl = document.getElementById("projectSelectedLabel");

function setSidebarCollapsed(collapsed) {
    sidebar.classList.toggle("collapsed", collapsed);
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    sidebarToggle.setAttribute("aria-label", collapsed ? "Open sidebar" : "Hide sidebar");
    sidebarToggle.setAttribute("title", collapsed ? "Open sidebar" : "Hide sidebar");
    setTimeout(() => { map.invalidateSize(); }, 260);
}

sidebarToggle.addEventListener("click", () => {
    setSidebarCollapsed(!sidebar.classList.contains("collapsed"));
});

filterBtn.addEventListener("click", () => {
    const isOpen = filterPanel.classList.toggle("show");
    filterBtn.setAttribute("aria-expanded", String(isOpen));
});

projectsBtn.addEventListener("click", () => {
    const isOpen = projectsPanel.classList.toggle("show");
    projectsBtn.setAttribute("aria-expanded", String(isOpen));
    projectsPanel.setAttribute("aria-hidden", String(!isOpen));
});

if (window.matchMedia("(max-width: 900px)").matches) {
    setSidebarCollapsed(true);
}

window.addEventListener("resize", () => { map.invalidateSize(); });

function safeText(value) { return String(value || ""); }

function escapeHTML(value) {
    return safeText(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function displayValue(value, fallback = "Not added") {
    const text = safeText(value).trim();
    return text || fallback;
}

function normalizeInstrumentData(data) {
    if (!Array.isArray(data)) return [];

    if (data.some(item => Array.isArray(item.instruments))) {
        return data.flatMap((location, locationIndex) => {
            const instruments = Array.isArray(location.instruments) ? location.instruments : [];
            return instruments.map((instrument, instrumentIndex) => ({
                id: `${locationIndex}-${instrumentIndex}`,
                instrument_name: safeText(instrument.instrument_name),
                location_name: safeText(location.location_name),
                latitude: safeText(location.latitude),
                longitude: safeText(location.longitude),
                installation_date: safeText(instrument.installation_date),
                category: safeText(instrument.category),
                objective: safeText(instrument.objective),
                description: safeText(instrument.description),
                project: safeText(instrument.project),
                network: safeText(instrument.network),
                sensor_type: safeText(instrument.sensor_type),
                measurement: safeText(instrument.measurement)
            }));
        });
    }

    return data.map((instrument, index) => ({
        id: instrument.id || index,
        instrument_name: safeText(instrument.instrument_name),
        location_name: safeText(instrument.location_name),
        latitude: safeText(instrument.latitude),
        longitude: safeText(instrument.longitude),
        installation_date: safeText(instrument.installation_date),
        category: safeText(instrument.category),
        objective: safeText(instrument.objective),
        description: safeText(instrument.description),
        project: safeText(instrument.project),
        network: safeText(instrument.network),
        sensor_type: safeText(instrument.sensor_type),
        measurement: safeText(instrument.measurement)
    }));
}

// ========================================
// PROJECT TREE CONFIGURATION
// ========================================
// Each leaf carries a `match` predicate that runs against a normalized
// instrument record. Parent nodes inherit the union of their children's matches.
// Tree structure provided by the user (5 roots).

function txt(v) { return safeText(v).trim().toLowerCase(); }
function eqProject(...names) {
    const set = new Set(names.map(n => n.toLowerCase()));
    return (it) => set.has(txt(it.project));
}
function eqNetwork(...names) {
    const set = new Set(names.map(n => n.toLowerCase()));
    return (it) => set.has(txt(it.network));
}
function projectAndLocation(project, locSubstrings) {
    const p = project.toLowerCase();
    const subs = locSubstrings.map(s => s.toLowerCase());
    return (it) => txt(it.project) === p && subs.some(s => txt(it.location_name).includes(s));
}
function any(...predicates) { return (it) => predicates.some(fn => fn(it)); }

const projectTreeConfig = [
    {
        id: "art",
        label: "ART",
        children: [
            { id: "art-silkheda", label: "ART-CI, Silkheda", match: eqProject("ART, Silkheda") },
            { id: "art-mesonet",  label: "MESONET & Mumbai Radar", match: eqProject("ART, MESONET & Mumbai Radar") },
            { id: "art-hacpl",    label: "HACPL, Mahabhaleswar", match: eqProject("ART-HACPL") },
            { id: "art-testbed",  label: "Test bed, Visakhapatnam",
              match: (it) => txt(it.location_name).includes("visakhapatnam") || txt(it.location_name).includes("vishakhapatnam") },
            { id: "art-laurus",   label: "LAURUS", match: eqProject("LAURUS") },
            { id: "art-disdro",   label: "Disdrometer network", match: eqNetwork("Disdrometer Network") }
        ]
    },
    {
        id: "caipeex",
        label: "CAIPEEX",
        children: [
            { id: "cai-solapur",  label: "Solapur",  match: (it) => txt(it.location_name).includes("solapur") },
            { id: "cai-tuljapur", label: "Tuljapur", match: (it) => txt(it.location_name).includes("tuljapur") },
            { id: "cai-chennai",  label: "Chennai",  match: (it) => txt(it.location_name).includes("chennai") },
            {
                id: "cai-delhi",
                label: "Delhi",
                children: [
                    { id: "cai-delhi-iitm", label: "IITM branch office",
                      match: (it) => txt(it.location_name).includes("delhi") && txt(it.location_name).includes("iitm") },
                    { id: "cai-delhi-pb",   label: "Prithvi Bhavan, MoES",
                      match: (it) => txt(it.location_name).includes("prithvi") || txt(it.location_name).includes("moes") },
                    { id: "cai-delhi-nc",   label: "NCMRWF",
                      match: (it) => txt(it.location_name).includes("ncmrwf") }
                ]
            }
        ]
    },
    {
        id: "thunderstorm",
        label: "Thunderstorm Dynamics",
        match: eqProject("Thunderstorm Dynamics")
    },
    {
        id: "maqws",
        label: "MAQWS",
        children: [
            { id: "maqws-pune",   label: "IITM, Pune", match: projectAndLocation("MAQWS", ["pune", "iitm"]) },
            { id: "maqws-delhi",  label: "Delhi",      match: projectAndLocation("MAQWS", ["delhi"]) },
            { id: "maqws-aqnet",  label: "Air Quality monitoring Network",
              match: (it) => txt(it.project) === "maqws" && !txt(it.location_name).includes("pune") && !txt(it.location_name).includes("delhi") }
        ]
    },
    {
        id: "cccr",
        label: "CCCR",
        children: [
            { id: "cccr-cosmos",   label: "COSMOS",        match: (it) => txt(it.project).includes("cosmos") || txt(it.instrument_name).includes("cosmos") },
            { id: "cccr-ghg",      label: "GHGs & Flux",   match: (it) => txt(it.measurement).includes("ghg") || txt(it.sensor_type).includes("ghg") || txt(it.objective).includes("ghg") },
            { id: "cccr-isotope",  label: "Water Isotope", match: (it) => txt(it.instrument_name).includes("isotope") || txt(it.objective).includes("isotope") },
            { id: "cccr-rings",    label: "Tree rings",    match: (it) => txt(it.instrument_name).includes("tree ring") || txt(it.objective).includes("tree ring") || txt(it.measurement).includes("dendro") },
            { id: "cccr-speleo",   label: "Speleothem",    match: (it) => txt(it.instrument_name).includes("speleothem") || txt(it.objective).includes("speleothem") }
        ]
    }
];

// Walk tree and ensure every parent has a derived `match` = OR of all descendant leaf matches.
function resolveTreeMatchers(nodes) {
    nodes.forEach(node => {
        if (node.children && node.children.length) {
            resolveTreeMatchers(node.children);
            const childMatchers = node.children.map(c => c.match).filter(Boolean);
            if (!node.match) node.match = any(...childMatchers);
        }
    });
}
resolveTreeMatchers(projectTreeConfig);

// Flat index of nodes by id for quick lookups.
const projectNodeById = new Map();
(function indexTree(nodes, parent) {
    nodes.forEach(n => {
        n.parent = parent || null;
        n.isLeaf = !(n.children && n.children.length);
        projectNodeById.set(n.id, n);
        if (n.children) indexTree(n.children, n);
    });
})(projectTreeConfig, null);

let selectedProjectNodeId = null;
const expandedProjectNodeIds = new Set();
function getActiveProjectMatcher() {
    if (!selectedProjectNodeId) return null;
    const node = projectNodeById.get(selectedProjectNodeId);
    return node ? node.match : null;
}
function projectPathLabel(node) {
    const parts = [];
    let cur = node;
    while (cur) { parts.unshift(cur.label); cur = cur.parent; }
    return parts.join(" › ");
}

// ========================================
// INSTRUMENT TABLE MODAL
// ========================================

function buildLocationPopup(locationGroup, index) {
    const selectedInstrument = locationGroup.selectedInstrumentId
        ? locationGroup.instruments.find(i => String(i.id) === String(locationGroup.selectedInstrumentId))
        : null;
    const selectedParam = selectedInstrument
        ? `, ${escapeHTML(JSON.stringify(String(selectedInstrument.id)))}`
        : "";
    const allButtonLabel = locationGroup.hasActiveFilters ? "View All Sensors" : "View Instruments";

    let popupButtons = `
        <button type="button" class="popup-view-btn" onclick="openInstrumentTable(${index})">
            ${allButtonLabel}
        </button>`;

    if (selectedInstrument) {
        popupButtons = locationGroup.hasActiveFilters
            ? `${popupButtons}
                <button type="button" class="popup-view-btn popup-secondary-btn" onclick="openInstrumentTable(${index}${selectedParam})">
                    View Selected Instrument
                </button>`
            : `<button type="button" class="popup-view-btn" onclick="openInstrumentTable(${index}${selectedParam})">
                    View Instrument
                </button>`;
    }

    return `
        <div class="location-popup">
            <h3>${escapeHTML(displayValue(locationGroup.locationName, "Location"))}</h3>
            <p><b>Latitude:</b> ${escapeHTML(locationGroup.lat.toFixed(6))}</p>
            <p><b>Longitude:</b> ${escapeHTML(locationGroup.lon.toFixed(6))}</p>
            <p><b>Matching Instruments:</b> ${locationGroup.instruments.length}</p>
            ${selectedInstrument ? `<p><b>Selected:</b> ${escapeHTML(displayValue(selectedInstrument.instrument_name, "Unnamed Instrument"))}</p>` : ""}
            ${popupButtons}
        </div>`;
}

function openInstrumentTable(index, selectedInstrumentId = "") {
    const locationGroup = currentLocationGroups[index];
    if (!locationGroup) return;

    const tableSource = locationGroup.allInstruments || locationGroup.instruments;
    const tableInstruments = selectedInstrumentId
        ? tableSource.filter(i => String(i.id) === String(selectedInstrumentId))
        : tableSource;

    document.getElementById("instrumentTableTitle").innerText =
        displayValue(locationGroup.locationName, "Location");
    document.getElementById("instrumentTableMeta").innerText =
        "Latitude: " + locationGroup.lat.toFixed(6) +
        " | Longitude: " + locationGroup.lon.toFixed(6) +
        " | Showing Instruments: " + tableInstruments.length;

    document.getElementById("instrumentTableBody").innerHTML =
        tableInstruments.map((instrument, rowIndex) => `
            <tr>
                <td>${rowIndex + 1}</td>
                <td>${escapeHTML(displayValue(instrument.instrument_name, "Unnamed Instrument"))}</td>
                <td>${escapeHTML(displayValue(instrument.installation_date))}</td>
                <td>${escapeHTML(displayValue(instrument.category))}</td>
                <td>${escapeHTML(displayValue(instrument.objective))}</td>
                <td>${escapeHTML(displayValue(instrument.description))}</td>
            </tr>`).join("");

    document.getElementById("instrumentTableModal").classList.add("show");
}

function closeInstrumentTable() {
    document.getElementById("instrumentTableModal").classList.remove("show");
}

function createInstrumentTableModal() {
    const modal = document.createElement("div");
    modal.id = "instrumentTableModal";
    modal.className = "instrument-table-modal";
    modal.innerHTML = `
        <div class="instrument-table-panel" role="dialog" aria-modal="true" aria-labelledby="instrumentTableTitle">
            <div class="instrument-table-header">
                <div>
                    <h2 id="instrumentTableTitle">Instruments</h2>
                    <p id="instrumentTableMeta"></p>
                </div>
                <button type="button" class="modal-close-btn" onclick="closeInstrumentTable()">Close</button>
            </div>
            <div class="instrument-table-wrapper">
                <table class="full-instrument-table">
                    <thead>
                        <tr>
                            <th>#</th><th>Instrument</th><th>Date</th>
                            <th>Category</th><th>Objective</th><th>Description</th>
                        </tr>
                    </thead>
                    <tbody id="instrumentTableBody"></tbody>
                </table>
            </div>
        </div>`;
    modal.addEventListener("click", e => { if (e.target === modal) closeInstrumentTable(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeInstrumentTable(); });
    document.body.appendChild(modal);
}

createInstrumentTableModal();

// ========================================
// DISTRICT GEOMETRY HELPERS
// ========================================

function getDistrictName(feature) {
    return feature.properties.district || feature.properties.DISTRICT ||
        feature.properties.dtname || feature.properties.NAME_2 ||
        feature.properties.name || "Unknown District";
}

function getDistrictStateName(feature) {
    return feature.properties.st_nm || feature.properties.STATE_NAME ||
        feature.properties.state || feature.properties.NAME_1 || "";
}

function clearSelectedDistrict() {
    if (selectedDistrictLayer) {
        map.removeLayer(selectedDistrictLayer);
        selectedDistrictLayer = null;
    }
    selectedDistrictGroup = null;
}

function getDistrictForPoint(lat, lon) {
    if (!districtFeatures.length) return null;
    const point = turf.point([lon, lat]);
    return districtFeatures.find(feature => {
        if (feature.bbox) {
            const [minLon, minLat, maxLon, maxLat] = feature.bbox;
            if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) return false;
        }
        return turf.booleanPointInPolygon(point, feature);
    }) || null;
}

function showDistrictMarkers() {
    clearSelectedDistrict();
    allMarkers.forEach(m => map.removeLayer(m));
    allDistrictMarkers.forEach(m => map.removeLayer(m));
    activeDistrictMarkers = [...allDistrictMarkers];
    activeDistrictMarkers.forEach(m => m.addTo(map));
}

function showLocationMarkersForDistrict(districtGroup) {
    const baseDistrictMarkers = activeDistrictMarkers.length
        ? activeDistrictMarkers
        : [...allDistrictMarkers];

    allMarkers.forEach(m => map.removeLayer(m));
    allDistrictMarkers.forEach(m => map.removeLayer(m));

    baseDistrictMarkers.forEach(m => {
        if (m !== districtGroup.marker) m.addTo(map);
    });

    districtGroup.locationGroups.forEach(lg => lg.marker.addTo(map));

    clearSelectedDistrict();
    selectedDistrictGroup = districtGroup;
    if (districtGroup.feature) {
        selectedDistrictLayer = L.geoJSON(districtGroup.feature, {
            pane: "districtPane",
            style: { color: "#00ffff", weight: 2.5, opacity: 1, fillColor: "#ff9800", fillOpacity: 0.2 }
        }).addTo(map);
    }

    if (districtGroup.bounds && districtGroup.bounds.isValid()) {
        const locationBounds = districtGroup.locationGroups.reduce(
            (bounds, lg) => bounds.extend([lg.lat, lg.lon]),
            L.latLngBounds([districtGroup.locationGroups[0].lat, districtGroup.locationGroups[0].lon])
        );
        let targetBounds = locationBounds.isValid() ? locationBounds : districtGroup.bounds;
        const ne = targetBounds.getNorthEast();
        const sw = targetBounds.getSouthWest();
        if (ne.lat === sw.lat && ne.lng === sw.lng) {
            const buffer = 0.015;
            targetBounds = L.latLngBounds(
                [sw.lat - buffer, sw.lng - buffer],
                [ne.lat + buffer, ne.lng + buffer]
            );
        }
        map.fitBounds(targetBounds, { padding: [80, 80], maxZoom: 12, animate: true });
    }
}

fetch("geoindia_district.json")
    .then(r => r.json())
    .then(data => {
        if (!window.topojson) throw new Error("TopoJSON library is not loaded");
        const objectName = Object.keys(data.objects)[0];
        const districtCollection = topojson.feature(data, data.objects[objectName]);
        districtFeatures = districtCollection.features.map(f => {
            f.bbox = turf.bbox(f);
            return f;
        });
        if (typeof window.refreshInstrumentMarkers === "function") {
            window.refreshInstrumentMarkers();
        }
    })
    .catch(err => console.log("District TopoJSON Error:", err));

// ========================================
// INDIA STATES GEOJSON
// ========================================

fetch("geoindia.geojson")
    .then(r => r.json())
    .then(data => {
        function defaultStyle() { return { color: "#ffffff", weight: 1.5, opacity: 1, fillColor: "#666666", fillOpacity: 0.35 }; }
        function hoverStyle()   { return { color: "#ffffff", weight: 2, fillColor: "#ff5722", fillOpacity: 0.6 }; }
        function selectedStyle(){ return { color: "#00ffff", weight: 3, opacity: 1, fillColor: "#ff9800", fillOpacity: 0.6 }; }
        function resetStates() {
            statesLayer.eachLayer(layer => {
                layer.selected = false;
                layer.closeTooltip();
                layer.setStyle(defaultStyle());
            });
        }

        statesLayer = L.geoJSON(data, {
            pane: "statesPane",
            style: defaultStyle,
            onEachFeature: function(feature, layer) {
                const stateName =
                    feature.properties.shapeName || feature.properties.STATE_NAME ||
                    feature.properties.st_nm || feature.properties.NAME_1 ||
                    feature.properties.name || "Unknown";
                layer.stateName = stateName;

                layer.bindTooltip(stateName, { sticky: false, direction: "top", className: "state-tooltip" });

                layer.on("mouseover", e => { if (!layer.selected) { layer.openTooltip(e.latlng); layer.setStyle(hoverStyle()); } });
                layer.on("mousemove", e => { if (!layer.selected) layer.getTooltip().setLatLng(e.latlng); });
                layer.on("mouseout",  () => { if (!layer.selected) { layer.closeTooltip(); layer.setStyle(defaultStyle()); } });
                layer.on("click", () => {
                    resetStates();
                    layer.selected = true;
                    layer.setStyle(selectedStyle());
                    layer.openTooltip(layer.getBounds().getCenter());
                    layer.bringToFront();
                    map.fitBounds(layer.getBounds());
                    filterMarkers(layer);
                });
            }
        }).addTo(map);

        statesLayer.bringToFront();
    })
    .catch(err => console.log("State GeoJSON Error:", err));

// ========================================
// LOAD INSTRUMENTS
// ========================================

fetch("instruments.json")
    .then(r => r.json())
    .then(data => {
        const resultCount = document.getElementById("resultCount");
        const searchInput = document.getElementById("searchInput");
        const instrumentFilter = document.getElementById("instrumentFilter");
        const locationFilter = document.getElementById("locationFilter");
        const networkFilter = document.getElementById("networkFilter");
        const resetFilters = document.getElementById("resetFilters");

        let allData = normalizeInstrumentData(data);
        let markerObjects = [];

        function getFilterSelections() {
            return {
                instrument: instrumentFilter.value,
                location: locationFilter.value,
                network: networkFilter.value
            };
        }

        function matchesSearch(item) {
            return item.instrument_name.toLowerCase().includes(searchInput.value.toLowerCase());
        }

        function matchesSelectedFilters(item, selections, excludedFilter = "") {
            return (
                (excludedFilter === "instrument" || !selections.instrument || item.instrument_name === selections.instrument) &&
                (excludedFilter === "location" || !selections.location || item.location_name === selections.location) &&
                (excludedFilter === "network" || !selections.network || item.network === selections.network)
            );
        }

        function matchesProjectTree(item) {
            const matcher = getActiveProjectMatcher();
            return !matcher || matcher(item);
        }

        function getFilteredData(selections) {
            return allData.filter(item =>
                matchesSearch(item) &&
                matchesSelectedFilters(item, selections) &&
                matchesProjectTree(item)
            );
        }

        function hasActiveFilters(selections = getFilterSelections()) {
            return Boolean(
                searchInput.value.trim() || selections.instrument ||
                selections.location || selections.network ||
                selectedProjectNodeId
            );
        }

        function setSelectOptions(select, allLabel, values, currentValue) {
            select.innerHTML = "";
            const allOption = document.createElement("option");
            allOption.value = "";
            allOption.textContent = allLabel;
            select.appendChild(allOption);
            values.sort((a, b) => a.localeCompare(b)).forEach(value => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = value;
                select.appendChild(option);
            });
            select.value = values.includes(currentValue) ? currentValue : "";
        }

        function populateFilters(selections = getFilterSelections()) {
            const filterConfigs = [
                { key: "network", select: networkFilter, field: "network", allLabel: "All Networks" },
                { key: "instrument", select: instrumentFilter, field: "instrument_name", allLabel: "All Sensors" },
                { key: "location", select: locationFilter, field: "location_name", allLabel: "All Locations" }
            ];

            let clearedInvalidSelection = false;

            filterConfigs.forEach(config => {
                const values = [...new Set(
                    allData
                        .filter(item => matchesSearch(item) && matchesProjectTree(item) && matchesSelectedFilters(item, selections, config.key))
                        .map(item => item[config.field])
                        .filter(item => item && item.trim() !== "")
                )];

                setSelectOptions(config.select, config.allLabel, values, selections[config.key]);

                if (selections[config.key] && !values.includes(selections[config.key])) {
                    selections[config.key] = "";
                    clearedInvalidSelection = true;
                }
            });

            return clearedInvalidSelection;
        }

        function renderData(filteredData, filtersActive = false) {
            resultCount.innerText = filteredData.length;

            markerObjects.forEach(obj => map.removeLayer(obj.marker));
            markerObjects = [];
            allMarkers = [];
            allDistrictMarkers = [];
            activeDistrictMarkers = [];
            currentLocationGroups = [];
            currentDistrictGroups = [];
            clearSelectedDistrict();

            const visibleLocations = new Map();
            const allInstrumentsByLocation = new Map();

            allData.forEach(instrument => {
                const lat = parseFloat(instrument.latitude);
                const lon = parseFloat(instrument.longitude);
                if (Number.isNaN(lat) || Number.isNaN(lon)) return;
                const locationKey = [instrument.location_name, lat.toFixed(6), lon.toFixed(6)].join("|");
                if (!allInstrumentsByLocation.has(locationKey)) allInstrumentsByLocation.set(locationKey, []);
                allInstrumentsByLocation.get(locationKey).push(instrument);
            });

            filteredData.forEach(instrument => {
                const lat = parseFloat(instrument.latitude);
                const lon = parseFloat(instrument.longitude);
                if (Number.isNaN(lat) || Number.isNaN(lon)) return;

                const locationKey = [instrument.location_name, lat.toFixed(6), lon.toFixed(6)].join("|");

                if (!visibleLocations.has(locationKey)) {
                    visibleLocations.set(locationKey, {
                        lat, lon,
                        locationName: instrument.location_name,
                        hasActiveFilters: filtersActive,
                        allInstruments: allInstrumentsByLocation.get(locationKey) || [],
                        instruments: []
                    });
                }
                visibleLocations.get(locationKey).instruments.push(instrument);
            });

            currentLocationGroups = Array.from(visibleLocations.values());

            currentLocationGroups.forEach((locationGroup, locationIndex) => {
                locationGroup.tableIndex = locationIndex;

                const marker = L.marker([locationGroup.lat, locationGroup.lon], {
                    pane: "markerPane",
                    icon: locationMarkerIcon,
                    title: locationGroup.locationName || "Location"
                })
                    .bindTooltip(locationGroup.locationName || "Location", {
                        permanent: true,
                        direction: "top",
                        offset: [-1, -4],
                        className: "marker-label"
                    })
                    .bindPopup(buildLocationPopup(locationGroup, locationIndex));

                locationGroup.marker = marker;
                markerObjects.push({ marker, data: locationGroup });
                allMarkers.push(marker);

                marker.on("click", () => {
                    locationGroup.selectedInstrumentId = "";
                    marker.setPopupContent(buildLocationPopup(locationGroup, locationIndex));
                });
            });

            // District groups
            const districtGroups = new Map();
            currentLocationGroups.forEach(locationGroup => {
                const districtFeature = getDistrictForPoint(locationGroup.lat, locationGroup.lon);
                const districtName = districtFeature ? getDistrictName(districtFeature) : "Unknown District";
                const stateName = districtFeature ? getDistrictStateName(districtFeature) : "";
                const districtKey = districtFeature
                    ? `${stateName}|${districtName}`
                    : `unknown|${locationGroup.locationName}|${locationGroup.lat.toFixed(6)}|${locationGroup.lon.toFixed(6)}`;

                if (!districtGroups.has(districtKey)) {
                    const districtBounds = districtFeature
                        ? L.geoJSON(districtFeature).getBounds()
                        : L.latLngBounds([[locationGroup.lat, locationGroup.lon]]);
                    districtGroups.set(districtKey, {
                        districtName, stateName,
                        feature: districtFeature,
                        bounds: districtBounds,
                        locationGroups: []
                    });
                }

                const districtGroup = districtGroups.get(districtKey);
                districtGroup.locationGroups.push(locationGroup);
                locationGroup.districtGroup = districtGroup;

                if (!districtGroup.bounds.contains([locationGroup.lat, locationGroup.lon])) {
                    districtGroup.bounds.extend([locationGroup.lat, locationGroup.lon]);
                }
            });

            currentDistrictGroups = Array.from(districtGroups.values());

            currentDistrictGroups.forEach(districtGroup => {
                const sum = districtGroup.locationGroups.reduce((acc, lg) => {
                    acc.lat += lg.lat; acc.lon += lg.lon; return acc;
                }, { lat: 0, lon: 0 });
                const count = districtGroup.locationGroups.length;
                const center = [sum.lat / count, sum.lon / count];

                const districtMarker = L.marker(center, {
                    pane: "markerPane",
                    icon: districtMarkerIcon,
                    title: districtGroup.districtName
                })
                    .bindTooltip(districtGroup.districtName, {
                        permanent: true,
                        direction: "top",
                        offset: [-1, -45],
                        className: "marker-label district-marker-label"
                    });

                districtMarker.on("click", () => { showLocationMarkersForDistrict(districtGroup); });

                districtGroup.marker = districtMarker;
                allDistrictMarkers.push(districtMarker);
                markerObjects.push({ marker: districtMarker, data: districtGroup });
            });

            showDistrictMarkers();
        }

        function applyFilters() {
            let selections = getFilterSelections();
            while (populateFilters(selections)) selections = getFilterSelections();
            renderData(getFilteredData(selections), hasActiveFilters(selections));
            renderProjectTree(); // refresh counts
        }

        // ========================================
        // PROJECT TREE RENDERING
        // ========================================

        function countForNode(node) {
            return allData.filter(node.match).length;
        }

        function renderProjectTree() {
            projectsTreeEl.innerHTML = "";

            function renderNodes(nodes, container, depth) {
                nodes.forEach(node => {
                    const li = document.createElement("li");
                    li.className = "tree-item";
                    const expanded = expandedProjectNodeIds.has(node.id);
                    if (!node.isLeaf && !expanded) li.classList.add("collapsed");

                    const row = document.createElement("div");
                    row.className = "tree-row";
                    if (depth === 0) row.classList.add("is-root");
                    if (selectedProjectNodeId === node.id) row.classList.add("selected");

                    const count = countForNode(node);
                    if (count === 0) row.classList.add("empty");

                    const toggle = document.createElement("span");
                    toggle.className = "tree-toggle";
                    if (node.isLeaf) toggle.classList.add("is-leaf");
                    toggle.textContent = "▾";

                    const label = document.createElement("span");
                    label.className = "tree-label";
                    label.textContent = node.label;

                    const countEl = document.createElement("span");
                    countEl.className = "tree-count";
                    countEl.textContent = String(count);

                    row.appendChild(toggle);
                    row.appendChild(label);
                    row.appendChild(countEl);

                    // Toggle expand/collapse on the chevron only
                    toggle.addEventListener("click", (e) => {
                        e.stopPropagation();
                        if (node.isLeaf) return;
                        if (expandedProjectNodeIds.has(node.id)) {
                            expandedProjectNodeIds.delete(node.id);
                            li.classList.add("collapsed");
                        } else {
                            expandedProjectNodeIds.add(node.id);
                            li.classList.remove("collapsed");
                        }
                    });

                    // Whole row toggles selection (no-op for empty branches)
                    row.addEventListener("click", () => {
                        if (count === 0) return;
                        if (selectedProjectNodeId === node.id) {
                            selectedProjectNodeId = null;
                        } else {
                            selectedProjectNodeId = node.id;
                            // auto-expand ancestor path so the selected node stays visible
                            let cur = node.parent;
                            while (cur) { expandedProjectNodeIds.add(cur.id); cur = cur.parent; }
                        }
                        applyFilters();
                        fitMapToFilteredMarkers();
                    });

                    li.appendChild(row);

                    if (!node.isLeaf) {
                        const ul = document.createElement("ul");
                        renderNodes(node.children, ul, depth + 1);
                        li.appendChild(ul);
                    }

                    container.appendChild(li);
                });
            }


            renderNodes(projectTreeConfig, projectsTreeEl, 0);

            if (selectedProjectNodeId) {
                const node = projectNodeById.get(selectedProjectNodeId);
                projectSelectedLabelEl.hidden = false;
                projectSelectedLabelEl.innerHTML = `<b>Selected:</b> ${escapeHTML(projectPathLabel(node))}`;
                clearProjectBtn.hidden = false;
            } else {
                projectSelectedLabelEl.hidden = true;
                clearProjectBtn.hidden = true;
            }
        }

        function fitMapToFilteredMarkers() {
            if (!currentLocationGroups.length) return;
            const bounds = L.latLngBounds(currentLocationGroups.map(lg => [lg.lat, lg.lon]));
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [60, 60], maxZoom: 10, animate: true });
            }
        }

        clearProjectBtn.addEventListener("click", () => {
            selectedProjectNodeId = null;
            applyFilters();
            map.fitBounds(indiaBounds);
        });

        searchInput.addEventListener("input", applyFilters);
        instrumentFilter.addEventListener("change", applyFilters);
        locationFilter.addEventListener("change", applyFilters);
        networkFilter.addEventListener("change", applyFilters);
        window.refreshInstrumentMarkers = applyFilters;

        resetFilters.addEventListener("click", () => {
            searchInput.value = "";
            instrumentFilter.value = "";
            locationFilter.value = "";
            networkFilter.value = "";
            selectedProjectNodeId = null;
            populateFilters();
            renderData(allData);
            renderProjectTree();
            map.fitBounds(indiaBounds);
        });

        renderProjectTree();
        populateFilters();
        renderData(allData);
    });

// ========================================
// FILTER MARKERS USING STATE BOUNDARY
// ========================================

function filterMarkers(clickedLayer) {
    allMarkers.forEach(m => map.removeLayer(m));
    allDistrictMarkers.forEach(m => map.removeLayer(m));
    clearSelectedDistrict();
    activeDistrictMarkers = [];

    const stateGeoJSON = clickedLayer.toGeoJSON();

    allDistrictMarkers.forEach(marker => {
        const latlng = marker.getLatLng();
        const point = turf.point([latlng.lng, latlng.lat]);
        if (turf.booleanPointInPolygon(point, stateGeoJSON)) {
            marker.addTo(map);
            activeDistrictMarkers.push(marker);
        }
    });
}

// ========================================
// DOUBLE CLICK RESET
// ========================================

map.on("dblclick", function() {
    map.fitBounds(indiaBounds);
    if (statesLayer) {
        statesLayer.eachLayer(layer => {
            layer.selected = false;
            layer.closeTooltip();
            layer.setStyle({ color: "#ffffff", weight: 1.5, fillColor: "#666666", fillOpacity: 0.35 });
        });
    }
    showDistrictMarkers();
});

// Tip toggle
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("tipToggle");
    const content = document.getElementById("tipContent");
    if (!btn || !content) return;
    btn.addEventListener("click", () => {
        const open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!open));
        content.hidden = open;
    });
});

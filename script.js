// ========================================
// CREATE MAP
// ========================================

const map = L.map("map", {
    zoomControl: true,
    doubleClickZoom: false
}).setView([23.5, 80], 4.8);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap & CARTO"
}).addTo(map);

map.createPane("statesPane");
map.createPane("markerPane");
map.getPane("statesPane").style.zIndex = 400;
map.getPane("markerPane").style.zIndex = 650;

let allMarkers = [];
let statesLayer;
let currentLocationGroups = [];

// ========================================
// SIDEBAR AND FILTER CONTROLS
// ========================================

const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");
const filterBtn = document.getElementById("filterBtn");
const filterPanel = document.getElementById("filterPanel");

function setSidebarCollapsed(collapsed) {
    sidebar.classList.toggle("collapsed", collapsed);
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    sidebarToggle.setAttribute("aria-label", collapsed ? "Open sidebar" : "Hide sidebar");

    setTimeout(() => {
        map.invalidateSize();
    }, 260);
}

sidebarToggle.addEventListener("click", () => {
    setSidebarCollapsed(!sidebar.classList.contains("collapsed"));
});

filterBtn.addEventListener("click", () => {
    const isOpen = filterPanel.classList.toggle("show");
    filterBtn.setAttribute("aria-expanded", String(isOpen));
});

if (window.matchMedia("(max-width: 900px)").matches) {
    setSidebarCollapsed(true);
}

window.addEventListener("resize", () => {
    map.invalidateSize();
});

function safeText(value) {
    return String(value || "");
}

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
                description: safeText(instrument.description)
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
        description: safeText(instrument.description)
    }));
}

// ========================================
// READ-ONLY INSTRUMENT TABLE
// ========================================

function buildLocationPopup(locationGroup, index) {
    const selectedInstrument = locationGroup.selectedInstrumentId
        ? locationGroup.instruments.find(instrument => String(instrument.id) === String(locationGroup.selectedInstrumentId))
        : null;
    const selectedParam = selectedInstrument
        ? `, ${escapeHTML(JSON.stringify(String(selectedInstrument.id)))}`
        : "";
    const selectedButton = selectedInstrument
        ? `
            <button type="button" class="popup-view-btn popup-secondary-btn" onclick="openInstrumentTable(${index}${selectedParam})">
                View Selected Instrument
            </button>
        `
        : "";

    return `
        <div class="location-popup">
            <h3>${escapeHTML(displayValue(locationGroup.locationName, "Location"))}</h3>
            <p><b>Latitude:</b> ${escapeHTML(locationGroup.lat.toFixed(6))}</p>
            <p><b>Longitude:</b> ${escapeHTML(locationGroup.lon.toFixed(6))}</p>
            <p><b>Matching Instruments:</b> ${locationGroup.instruments.length}</p>
            ${selectedInstrument ? `<p><b>Selected:</b> ${escapeHTML(displayValue(selectedInstrument.instrument_name, "Unnamed Instrument"))}</p>` : ""}
            <button type="button" class="popup-view-btn" onclick="openInstrumentTable(${index})">
                View Matching Instruments
            </button>
            ${selectedButton}
        </div>
    `;
}

function openInstrumentTable(index, selectedInstrumentId = "") {
    const locationGroup = currentLocationGroups[index];
    if (!locationGroup) return;

    const tableInstruments = selectedInstrumentId
        ? locationGroup.instruments.filter(instrument => String(instrument.id) === String(selectedInstrumentId))
        : locationGroup.instruments;

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
            </tr>
        `).join("");

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
                            <th>#</th>
                            <th>Instrument</th>
                            <th>Date</th>
                            <th>Category</th>
                            <th>Objective</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody id="instrumentTableBody"></tbody>
                </table>
            </div>
        </div>
    `;

    modal.addEventListener("click", event => {
        if (event.target === modal) closeInstrumentTable();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeInstrumentTable();
    });

    document.body.appendChild(modal);
}

createInstrumentTableModal();

// ========================================
// INDIA STATES GEOJSON
// ========================================

fetch("geoindia.geojson")
    .then(response => response.json())
    .then(data => {
        function defaultStyle() {
            return {
                color: "#ffffff",
                weight: 1.5,
                opacity: 1,
                fillColor: "#666666",
                fillOpacity: 0.35
            };
        }

        function hoverStyle() {
            return {
                color: "#ffffff",
                weight: 2,
                fillColor: "#ff9800",
                fillOpacity: 0.6
            };
        }

        function selectedStyle() {
            return {
                color: "#00ffff",
                weight: 3,
                opacity: 1,
                fillColor: "#ff5722",
                fillOpacity: 0.6
            };
        }

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
                    feature.properties.shapeName ||
                    feature.properties.STATE_NAME ||
                    feature.properties.st_nm ||
                    feature.properties.NAME_1 ||
                    feature.properties.name ||
                    "Unknown";

                layer.stateName = stateName;

                layer.bindTooltip(stateName, {
                    sticky: false,
                    direction: "top",
                    className: "state-tooltip"
                });

                layer.on("mouseover", function(e) {
                    if (!layer.selected) {
                        layer.openTooltip(e.latlng);
                        layer.setStyle(hoverStyle());
                    }
                });

                layer.on("mousemove", function(e) {
                    if (!layer.selected) {
                        layer.getTooltip().setLatLng(e.latlng);
                    }
                });

                layer.on("mouseout", function() {
                    if (!layer.selected) {
                        layer.closeTooltip();
                        layer.setStyle(defaultStyle());
                    }
                });

                layer.on("click", function() {
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
    .catch(error => {
        console.log("State GeoJSON Error:", error);
    });

// ========================================
// LOAD INSTRUMENTS
// ========================================

fetch("instruments.json")
    .then(response => response.json())
    .then(data => {
        const instrumentList = document.getElementById("instrumentList");
        const resultCount = document.getElementById("resultCount");
        const searchInput = document.getElementById("searchInput");
        const instrumentFilter = document.getElementById("instrumentFilter");
        const locationFilter = document.getElementById("locationFilter");
        const categoryFilter = document.getElementById("categoryFilter");
        const resetFilters = document.getElementById("resetFilters");

        let allData = normalizeInstrumentData(data);
        let markerObjects = [];

        function populateFilters() {
            const instruments = [...new Set(
                allData.map(d => d.instrument_name).filter(item => item && item.trim() !== "")
            )];
            const locations = [...new Set(
                allData.map(d => d.location_name).filter(item => item && item.trim() !== "")
            )];
            const categories = [...new Set(
                allData.map(d => d.category).filter(item => item && item.trim() !== "")
            )];

            instrumentFilter.innerHTML = `<option value="">All Instruments</option>`;
            locationFilter.innerHTML = `<option value="">All Locations</option>`;
            categoryFilter.innerHTML = `<option value="">All Categories</option>`;

            instruments.forEach(item => {
                instrumentFilter.innerHTML += `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`;
            });

            locations.forEach(item => {
                locationFilter.innerHTML += `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`;
            });

            categories.forEach(item => {
                categoryFilter.innerHTML += `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`;
            });
        }

        function renderData(filteredData) {
            instrumentList.innerHTML = "";
            resultCount.innerText = filteredData.length;

            markerObjects.forEach(obj => {
                map.removeLayer(obj.marker);
            });

            markerObjects = [];
            allMarkers = [];
            currentLocationGroups = [];

            const visibleLocations = new Map();

            filteredData.forEach(instrument => {
                const lat = parseFloat(instrument.latitude);
                const lon = parseFloat(instrument.longitude);

                if (Number.isNaN(lat) || Number.isNaN(lon)) return;

                let detectedState = "Unknown";

                if (statesLayer) {
                    statesLayer.eachLayer(stateLayer => {
                        if (stateLayer.getBounds().contains([lat, lon])) {
                            detectedState = stateLayer.stateName;
                        }
                    });
                }

                const locationKey = [
                    instrument.location_name,
                    lat.toFixed(6),
                    lon.toFixed(6)
                ].join("|");

                if (!visibleLocations.has(locationKey)) {
                    visibleLocations.set(locationKey, {
                        lat,
                        lon,
                        locationName: instrument.location_name,
                        instruments: []
                    });
                }

                visibleLocations.get(locationKey).instruments.push(instrument);

                const card = document.createElement("div");
                card.className = "instrument-card";
                card.tabIndex = 0;
                card.setAttribute("role", "button");
                card.setAttribute("aria-label", `Show ${instrument.instrument_name} on map`);

                card.innerHTML = `
                    <h3>${escapeHTML(instrument.instrument_name || "Unnamed Instrument")}</h3>
                    <p>${escapeHTML(instrument.location_name || "Location not added")}</p>
                    <p>${escapeHTML(detectedState)}</p>
                    <p>${escapeHTML(instrument.category || "Category not added")}</p>
                    <p>${escapeHTML(instrument.installation_date || "Date not added")}</p>
                `;

                function focusInstrument() {
                    document.querySelectorAll(".instrument-card.active").forEach(activeCard => {
                        activeCard.classList.remove("active");
                    });

                    card.classList.add("active");
                    map.setView([lat, lon], 8);
                    card.scrollIntoView({ behavior: "smooth", block: "nearest" });

                    const locationGroup = visibleLocations.get(locationKey);
                    if (locationGroup && locationGroup.marker) {
                        locationGroup.selectedInstrumentId = instrument.id;
                        locationGroup.marker.setPopupContent(
                            buildLocationPopup(locationGroup, locationGroup.tableIndex)
                        );
                        locationGroup.marker.openPopup();
                    }

                    if (window.matchMedia("(max-width: 900px)").matches) {
                        setSidebarCollapsed(true);
                    }
                }

                card.addEventListener("click", focusInstrument);
                card.addEventListener("keydown", event => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        focusInstrument();
                    }
                });

                instrumentList.appendChild(card);
            });

            currentLocationGroups = Array.from(visibleLocations.values());

            currentLocationGroups.forEach((locationGroup, locationIndex) => {
                locationGroup.tableIndex = locationIndex;

                const marker = L.marker([locationGroup.lat, locationGroup.lon], {
                    pane: "markerPane"
                })
                    .bindTooltip(locationGroup.locationName || "Location", {
                        permanent: true,
                        direction: "top",
                        offset: [-15, -13],
                        className: "marker-label"
                    })
                    .bindPopup(buildLocationPopup(locationGroup, locationIndex));

                marker.addTo(map);
                locationGroup.marker = marker;

                markerObjects.push({
                    marker: marker,
                    data: locationGroup
                });

                allMarkers.push(marker);

                marker.on("click", () => {
                    locationGroup.selectedInstrumentId = "";
                    marker.setPopupContent(buildLocationPopup(locationGroup, locationIndex));

                    const firstInstrument = locationGroup.instruments[0];
                    const firstCard = Array.from(document.querySelectorAll(".instrument-card"))
                        .find(card => card.getAttribute("aria-label") === `Show ${firstInstrument.instrument_name} on map`);

                    document.querySelectorAll(".instrument-card.active").forEach(activeCard => {
                        activeCard.classList.remove("active");
                    });

                    if (firstCard) {
                        firstCard.classList.add("active");
                        firstCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }

                    if (window.matchMedia("(max-width: 900px)").matches) {
                        setSidebarCollapsed(false);
                    }
                });
            });
        }

        function applyFilters() {
            const searchText = searchInput.value.toLowerCase();
            const selectedInstrument = instrumentFilter.value;
            const selectedLocation = locationFilter.value;
            const selectedCategory = categoryFilter.value;

            const filteredData = allData.filter(item => {
                return (
                    item.instrument_name.toLowerCase().includes(searchText) &&
                    (!selectedInstrument || item.instrument_name === selectedInstrument) &&
                    (!selectedLocation || item.location_name === selectedLocation) &&
                    (!selectedCategory || item.category === selectedCategory)
                );
            });

            renderData(filteredData);
        }

        searchInput.addEventListener("input", applyFilters);
        instrumentFilter.addEventListener("change", applyFilters);
        locationFilter.addEventListener("change", applyFilters);
        categoryFilter.addEventListener("change", applyFilters);

        resetFilters.addEventListener("click", () => {
            searchInput.value = "";
            instrumentFilter.value = "";
            locationFilter.value = "";
            categoryFilter.value = "";
            renderData(allData);
        });

        populateFilters();
        renderData(allData);
    });

// ========================================
// FILTER MARKERS USING STATE BOUNDARY
// ========================================

function filterMarkers(clickedLayer) {
    allMarkers.forEach(marker => {
        map.removeLayer(marker);
    });

    const stateGeoJSON = clickedLayer.toGeoJSON();

    allMarkers.forEach(marker => {
        const latlng = marker.getLatLng();
        const point = turf.point([latlng.lng, latlng.lat]);

        if (turf.booleanPointInPolygon(point, stateGeoJSON)) {
            marker.addTo(map);
        }
    });
}

// ========================================
// DOUBLE CLICK RESET
// ========================================

map.on("dblclick", function() {
    map.setView([23.5, 80], 4.8);

    if (statesLayer) {
        statesLayer.eachLayer(layer => {
            layer.selected = false;
            layer.closeTooltip();
            layer.setStyle({
                color: "#ffffff",
                weight: 1.5,
                fillColor: "#666666",
                fillOpacity: 0.35
            });
        });
    }

    allMarkers.forEach(marker => {
        marker.addTo(map);
    });
});

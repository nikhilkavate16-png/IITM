// ========================================
// CREATE MAP
// ========================================

const map = L.map('map', {
    zoomControl: true,
    doubleClickZoom: false
}).setView([23.5, 80], 4.8);


// ========================================
// DARK TILE LAYER
// ========================================

L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    {
        attribution: '&copy; OpenStreetMap & CARTO'
    }
).addTo(map);


// ========================================
// CREATE PANES
// ========================================

map.createPane('statesPane');
map.createPane('markerPane');

map.getPane('statesPane').style.zIndex = 400;
map.getPane('markerPane').style.zIndex = 650;


// ========================================
// STORE DATA
// ========================================

let allMarkers = [];
let statesLayer;


// ========================================
// INDIA STATES GEOJSON
// ========================================

fetch('geoindia.geojson')
.then(response => response.json())
.then(data => {

    function defaultStyle() {
        return {
            color: '#ffffff',
            weight: 1.5,
            opacity: 1,
            fillColor: '#666666',
            fillOpacity: 0.35
        };
    }

    function hoverStyle() {
        return {
            color: '#ffffff',
            weight: 2,
            fillColor: '#ff9800',
            fillOpacity: 0.6
        };
    }

    function selectedStyle() {
        return {
            color: '#00ffff',
            weight: 3,
            opacity: 1,
            fillColor: '#ff5722',
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
        pane: 'statesPane',
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
                direction: 'top',
                className: 'state-tooltip'
            });

            layer.on('mouseover', function(e) {
                if (!layer.selected) {
                    layer.openTooltip(e.latlng);
                    layer.setStyle(hoverStyle());
                }
            });

            layer.on('mousemove', function(e) {
                if (!layer.selected) {
                    layer.getTooltip().setLatLng(e.latlng);
                }
            });

            layer.on('mouseout', function() {
                if (!layer.selected) {
                    layer.closeTooltip();
                    layer.setStyle(defaultStyle());
                }
            });

            layer.on('click', function() {
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

fetch('instruments.json')
.then(response => response.json())
.then(data => {

    const instrumentList = document.getElementById('instrumentList');
    const searchInput = document.getElementById('searchInput');
    const instrumentFilter = document.getElementById('instrumentFilter');
    const locationFilter = document.getElementById('locationFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    const resetFilters = document.getElementById('resetFilters');

    let allData = data;
    let markerObjects = [];

    // =====================================
    // FILL FILTER DROPDOWNS
    // =====================================

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

        // Reset dropdowns
        instrumentFilter.innerHTML = `<option value="">All Instruments</option>`;
        locationFilter.innerHTML = `<option value="">All Locations</option>`;
        categoryFilter.innerHTML = `<option value="">All Categories</option>`;

        instruments.forEach(item => {
            instrumentFilter.innerHTML += `<option value="${item}">${item}</option>`;
        });

        locations.forEach(item => {
            locationFilter.innerHTML += `<option value="${item}">${item}</option>`;
        });

        categories.forEach(item => {
            categoryFilter.innerHTML += `<option value="${item}">${item}</option>`;
        });
    }

    // =====================================
    // DISPLAY DATA
    // =====================================

    function renderData(filteredData) {

        instrumentList.innerHTML = '';

        // Remove old markers
        markerObjects.forEach(obj => {
            map.removeLayer(obj.marker);
        });

        markerObjects = [];
        allMarkers = [];

        filteredData.forEach(instrument => {

            const lat = parseFloat(instrument.latitude);
            const lon = parseFloat(instrument.longitude);

            let detectedState = "Unknown";

            if (statesLayer) {
                statesLayer.eachLayer(stateLayer => {
                    if (stateLayer.getBounds().contains([lat, lon])) {
                        detectedState = stateLayer.stateName;
                    }
                });
            }

            const marker = L.marker([lat, lon], {
                pane: 'markerPane'
            })
            .bindTooltip(instrument.location_name, {
                permanent: true,
                direction: 'top',
                offset: [-15, -13],
                className: 'marker-label'
            })
            .bindPopup(`
                <div style="min-width:220px;">
                    <h3>${instrument.instrument_name}</h3>
                    <b>Location:</b> ${instrument.location_name}<br><br>
                    <b>Installation Date:</b> ${instrument.installation_date}<br><br>
                    <b>Category:</b> ${instrument.category}<br><br>
                    ${instrument.description || ''}
                </div>
            `);

            marker.addTo(map);

            markerObjects.push({
                marker: marker,
                data: instrument
            });

            allMarkers.push(marker);

            const card = document.createElement('div');
            card.className = 'instrument-card';

            card.innerHTML = `
                <h3>${instrument.instrument_name}</h3>
                <p>${instrument.location_name}</p>
                <p>${detectedState}</p>
                <p>${instrument.category}</p>
                <p>${instrument.installation_date}</p>
            `;

            card.addEventListener('click', () => {
                map.setView([lat, lon], 8);
                marker.openPopup();
            });

            instrumentList.appendChild(card);
        });
    }

    // =====================================
    // APPLY FILTER
    // =====================================

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

    // =====================================
    // FILTER EVENTS
    // =====================================

    searchInput.addEventListener('input', applyFilters);
    instrumentFilter.addEventListener('change', applyFilters);
    locationFilter.addEventListener('change', applyFilters);
    categoryFilter.addEventListener('change', applyFilters);

    resetFilters.addEventListener('click', () => {
        searchInput.value = "";
        instrumentFilter.value = "";
        locationFilter.value = "";
        categoryFilter.value = "";
        renderData(allData);
    });

    // Initialize
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

        const point = turf.point([
            latlng.lng,
            latlng.lat
        ]);

        if (turf.booleanPointInPolygon(point, stateGeoJSON)) {
            marker.addTo(map);
        }

    });

}


// ========================================
// DOUBLE CLICK RESET
// ========================================

map.on('dblclick', function() {

    map.setView([23.5, 80], 4.8);

    if (statesLayer) {
        statesLayer.eachLayer(layer => {
            layer.selected = false;
            layer.closeTooltip();
            layer.setStyle({
                color: '#ffffff',
                weight: 1.5,
                fillColor: '#666666',
                fillOpacity: 0.35
            });
        });
    }

    allMarkers.forEach(marker => {
        marker.addTo(map);
    });

});
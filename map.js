class Leistungstag {
    title;
    position;
    constructor(title, position) {
        this.title = title;
        this.position = position;
    }
}
// config map
let config = {
    minZoom: 7,
    maxZoom: 18,
};

// magnification with which the map will start
const zoom = 13;
// co-ordinates
const lat = 48.304918;
const lng = 14.289177;

async function getLeistungstage() {
    //const data = await fetch('https://ics.leistungstag.beer')
    const data = await fetch('assets/misc/lt.json')
        .then(response => response.json())
    let hauptLeistungstagCounter = 1
    return data.map((event, i) => {
        let name = ""
        if (event.type === "1") {
            name = "Leistungstag #" + hauptLeistungstagCounter + " | " + event.name
            hauptLeistungstagCounter += 1
        } else if(event.type === "2") {
            name = "Konkurrenzleistungstag | " + event.name
        } else if(event.type === "3") {
            name = "Zusatzleistungstag | " + event.name
        }
        return new Leistungstag(name, [parseFloat(event.lat), parseFloat(event.lng)])
    });
}

async function initMap() {
    const map = L.map("map", config).setView([lat, lng], zoom);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    var leistungstage = await getLeistungstage()
    // Create the markers.
    const LeafIcon = L.Icon.extend({
        options: {
            iconSize: [60, 30]
        }
    });
    const beerIcon = new LeafIcon({iconUrl: 'images/beer.png'});

    leistungstage.forEach(({ position, title }, i) => {
        L.marker(position, {icon: beerIcon}).bindPopup(title).addTo(map);
    });
}

initMap();
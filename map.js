import ICAL from 'https://unpkg.com/ical.js';

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
    const data = await fetch('https://ics.leistungstag.beer?locationAsCoords=true')
        .then(async response => ICAL.parse(await response.text()))
    const vCalendar = new ICAL.Component(data);
    return vCalendar.getAllSubcomponents("vevent").map(event => {
        let name = event.getFirstPropertyValue("summary")
        let latLng = event.getFirstPropertyValue("location").split(" ")
        return new Leistungstag(name, [parseFloat(latLng[0]), parseFloat(latLng[1])])
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

    leistungstage.forEach(leistungstag => {
        L.marker(leistungstag.position, {icon: beerIcon}).bindPopup(leistungstag.title).addTo(map);
    });
}

initMap();
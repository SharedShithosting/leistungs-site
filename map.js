var ICAL = ICALmodule;

class LeistungsTypen {
    static get LEISTUNGSTAG() {
        return 0;
    }
    static get ZUSATZLEISTUNGSTAG() {
        return 1;
    }
    static get YEARLY_WINNER() {
        return 2;
    }
    static get KONKURRENZLEISTUNGSTAG() {
        return 3;
    }
}
// Google Calendar prefixes every summary with its category ("Leistungstag:
// Goethe Stub'n"). The old spellings stay in the list so historic events that
// were written by Leistungsbot itself still get the right icon. Order matters:
// the specific categories have to win over the plain "Leistungstag".
const LEISTUNGSTAG_KATEGORIEN = [
    [/^Konkurrenz[ -]?Leistungstag:?\s*/i, LeistungsTypen.KONKURRENZLEISTUNGSTAG],
    [/^(?:Leistungstag Zusatztermin|Zusatzleistungstag):?\s*/i, LeistungsTypen.ZUSATZLEISTUNGSTAG],
    [/^(?:Jahres|Abschluss)leistungstag:?\s*/i, LeistungsTypen.YEARLY_WINNER],
    [/^Leistungstag:?\s*/i, LeistungsTypen.LEISTUNGSTAG],
];

class Leistungstag {
    title;
    date;
    position;
    type;

    constructor(title, position, date) {
        this.position = position;
        this.date = date;
        this.type = LeistungsTypen.LEISTUNGSTAG;
        this.title = title;

        for (const [prefix, type] of LEISTUNGSTAG_KATEGORIEN) {
            if (prefix.test(title)) {
                // The icon already says which category it is, so the popup only
                // needs the name of the Lokal.
                this.title = title.replace(prefix, "");
                this.type = type;
                break;
            }
        }
    }
}

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
        // The proxy drops LOCATION for venues it has not geocoded yet, so an
        // event without usable coordinates is expected rather than an error.
        let location = event.getFirstPropertyValue("location")
        if (!location) return null

        let [lat, lng] = location.split(" ").map(value => parseFloat(value))
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

        let name = event.getFirstPropertyValue("summary")
        let date = event.getFirstPropertyValue("dtstart").toJSDate()
        return new Leistungstag(name, [lat, lng], date)
    }).filter(leistungstag => leistungstag !== null);
}

async function initMap() {
    const key = 'D2wVuzUwMjpTJ3uMaTi4';
    const map = L.map("map").setView([lat, lng], zoom);

    const mtLayer = L.maptiler.maptilerLayer({
      apiKey: key,
      style: L.maptiler.MapStyle.BASIC_V2, //optional
    }).addTo(map);

    var leistungstage = await getLeistungstage()
    // Create the markers.
    const LeafIcon = L.Icon.extend({
        options: {
            iconSize: [50, 25]
        }
    });

    leistungstage.forEach(leistungstag => {
        let beerIcon;
        switch (leistungstag.type) {
            case LeistungsTypen.ZUSATZLEISTUNGSTAG:
                beerIcon = new LeafIcon({iconUrl: 'images/zusatz_beer.svg'});
                break
            case LeistungsTypen.YEARLY_WINNER:
                beerIcon = new LeafIcon({iconUrl: 'images/yearly_beer.svg'});
                beerIcon.options.iconSize = [25, 12.5];
                break
            case LeistungsTypen.KONKURRENZLEISTUNGSTAG:
                beerIcon = new LeafIcon({iconUrl: 'images/konkurrenz_beer.svg'});
                break
            default:
                beerIcon = new LeafIcon({iconUrl: 'images/lt_beer.svg'});
                break
        }
        L.marker(leistungstag.position, {icon: beerIcon}).bindPopup("" +
            `${leistungstag.title}<br>${leistungstag.date.toLocaleDateString()}`
        ).addTo(map);
    });
}

initMap();

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
class Leistungstag {
    title;
    date;
    position;
    type;

    constructor(title, position, date) {
        this.title = title;
        this.position = position;
        this.date = date;
        if(title.startsWith("Konkurrenzleistungstag")) {
            this.type = LeistungsTypen.KONKURRENZLEISTUNGSTAG
        }
        else if(title.startsWith("Zusatzleistungstag")) {
            this.type = LeistungsTypen.ZUSATZLEISTUNGSTAG
        }
	else if(title.startsWith("Jahresleistungstag")) {
            this.type = LeistungsTypen.YEARLY_WINNER
	}
        else {
            this.type = LeistungsTypen.LEISTUNGSTAG
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
        let name = event.getFirstPropertyValue("summary")
        let latLng = event.getFirstPropertyValue("location").split(" ")
        let date = event.getFirstPropertyValue("dtstart").toJSDate()
        return new Leistungstag(name, [parseFloat(latLng[0]), parseFloat(latLng[1])], date)
    });
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

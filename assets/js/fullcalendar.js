
const calendarEl = document.getElementById('leistungscalendar');
const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    weekends: false,
});

document.addEventListener('DOMContentLoaded', function() {
    calendar.render();
});

document.getElementById('calendar').addEventListener("click", function() {
    calendar.render();
});
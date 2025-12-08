/* Clock Logic */
document.addEventListener('DOMContentLoaded', () => {
    const hour = document.getElementById('clock-hour');
    const minutes = document.getElementById('clock-minutes');
    const seconds = document.getElementById('clock-seconds');

    const textHour = document.getElementById('text-hour');
    const textMinutes = document.getElementById('text-minutes');
    const textAmPm = document.getElementById('text-ampm');
    const dateDay = document.getElementById('date-day');
    const dateMonth = document.getElementById('date-month');
    const dateYear = document.getElementById('date-year');

    if (!hour) return; // Exit if clock not present

    const clock = () => {
        let date = new Date();

        let hh = date.getHours() * 30,
            mm = date.getMinutes() * 6,
            ss = date.getSeconds() * 6;

        // We add a rotation to the elements
        hour.style.transform = `rotateZ(${hh + mm / 12}deg)`;
        minutes.style.transform = `rotateZ(${mm}deg)`;
        seconds.style.transform = `rotateZ(${ss}deg)`;
    };
    setInterval(clock, 1000); // 1000 = 1s
    clock(); // Run immediately

    const clockText = () => {
        let date = new Date();

        let hh = date.getHours(),
            ampm,
            mm = date.getMinutes(),
            day = date.getDate(),
            month = date.getMonth(),
            year = date.getFullYear();

        // We change the hours from 24 to 12 hours and establish whether it is AM or PM
        if (hh >= 12) {
            hh = hh - 12;
            ampm = 'PM';
        } else {
            ampm = 'AM';
        }

        // We detect when it's 0 AM and transform to 12 AM
        if (hh == 0) { hh = 12; }

        // Show a zero before hours
        if (hh < 10) { hh = `0${hh}`; }

        // Show time
        if (textHour) textHour.innerHTML = `${hh}:`;

        // Show a zero before the minutes
        if (mm < 10) { mm = `0${mm}`; }

        // Show minutes
        if (textMinutes) textMinutes.innerHTML = mm;

        // Show am or pm
        if (textAmPm) textAmPm.innerHTML = ampm;

        // We get the months of the year and show it
        let months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // We show the day, the month and the year
        if (dateDay) dateDay.innerHTML = day;
        if (dateMonth) dateMonth.innerHTML = `${months[month]},`;
        if (dateYear) dateYear.innerHTML = year;
    };
    setInterval(clockText, 1000); // 1000 = 1s
    clockText(); // Run immediately
});

(function () {
    "use strict";

    const year = String(new Date().getFullYear());
    document.querySelectorAll(".current-year").forEach(function (element) {
        element.textContent = year;
    });
}());

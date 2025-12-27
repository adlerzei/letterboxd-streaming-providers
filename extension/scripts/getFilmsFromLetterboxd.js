if (typeof browser === "undefined") {
  var browser = chrome;
}

var gridItems = document.querySelectorAll("li.griditem");

var movies = {};
for (let index = 0; index < gridItems.length; index++) {
  const li = gridItems[index];

  const outerDiv = li.querySelector(".react-component[data-film-id]");
  if (!outerDiv) continue;

  const rawName =
    outerDiv.getAttribute("data-item-name") ||
    outerDiv.getAttribute("data-item-full-display-name") ||
    "";

  if (!rawName) continue;

  let filmName = rawName.trim();
  let filmYear = -1;

  if (outerDiv.hasAttribute("data-film-release-year")) {
    const y = parseInt(
      outerDiv.getAttribute("data-film-release-year"),
      10
    );
    if (!Number.isNaN(y)) filmYear = y;
  } else {
    const m = rawName.match(/\((\d{4})\)\s*$/);
    if (m) {
      filmYear = parseInt(m[1], 10);
      filmName = rawName.replace(/\s*\(\d{4}\)\s*$/, "").trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(movies, filmName)) {
    if (movies[filmName].year === -1) {
      movies[filmName].year = filmYear;
    }
    movies[filmName].id.push(index);
  } else {
    movies[filmName] = {
      year: filmYear,
      id: [index],
    };
  }
}

browser.runtime.sendMessage({
  messageType: "movie-titles",
  messageContent: movies,
});

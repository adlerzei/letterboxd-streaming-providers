if (typeof browser === "undefined") {
  var browser = chrome;
}

var gridItems = document.querySelectorAll("li.griditem");

var movies = {};
for (let index = 0; index < gridItems.length; index++) {
  const li = gridItems[index];

  const outerDiv = li.querySelector(".react-component[data-film-id]");
  if (!outerDiv) {
    continue;
  }

  const rawName =
    outerDiv.getAttribute("data-item-name") ||
    outerDiv.getAttribute("data-item-full-display-name") ||
    "";

  if (!rawName) {
    continue;
  }

  let filmName = rawName.trim();
  let filmYear = -1;

  // we need to extract the film title and the release year item name
  const match = rawName.match(/\((\d{4})\)\s*$/);
  if (match) {
    filmYear = parseInt(match[1], 10); // the year is in the first capture group
    filmName = rawName.replace(/\s*\(\d{4}\)\s*$/, "").trim();
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

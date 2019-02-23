if (typeof browser === 'undefined') {
  var browser = chrome;
}

var filmposters = document.body.getElementsByClassName('poster-container');

var movies = {};
for (let poster = 0; poster < filmposters['length']; poster++) {
  if (filmposters[poster].children[0].attributes.hasOwnProperty('data-film-name')) {
    movies[filmposters[poster].children[0].attributes['data-film-name'].value] = {
      year: filmposters[poster].children[0].attributes['data-film-release-year'].value,
      id: poster
    };
  } else {
    movies[filmposters[poster].children[0].children[0].alt] = {
      year: -1,
      id: poster
    };
  }
}

browser.runtime.sendMessage({
  message_type: 'movie-titles',
  message_content: movies
});
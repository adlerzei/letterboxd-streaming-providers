if (typeof browser === 'undefined') {
  var browser = chrome;
}

var filmposters = document.body.getElementsByClassName('poster-container');

var movies = [];
for(let poster = 0; poster < filmposters['length']; poster++) {
  movies[filmposters[poster].children[0].attributes['data-film-name'].value] = filmposters[poster].children[0].attributes['data-film-release-year'].value;
}

browser.runtime.sendMessage({
  message_type: 'movie-titles',
  message_content: movies
});
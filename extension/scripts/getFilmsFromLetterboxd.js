if (typeof browser === 'undefined') {
	var browser = chrome;
}

var filmposters = document.body.getElementsByClassName('poster-container');

var movies = {};
for (let poster = 0; poster < filmposters['length']; poster++) {
	if (filmposters[poster].children[0].attributes.hasOwnProperty('data-film-name')) {
		let filmName = filmposters[poster].children[0].attributes['data-film-name'].value;

		if (movies.hasOwnProperty(filmName)) {
			if (movies[filmName].year === -1) {
				movies[filmName].year = filmposters[poster].children[0].attributes['data-film-release-year'].value;
			}

			movies[filmName].id.push(poster);
		} else {
			movies[filmName] = {
				year: filmposters[poster].children[0].attributes['data-film-release-year'].value,
				id: [poster]
			};
		}
	} else {
		let filmName = filmposters[poster].children[0].children[0].alt;

		if (movies.hasOwnProperty(filmName)) {
			movies[filmName].id.push(poster);
		} else {
			movies[filmName] = {
				year: -1,
				id: [poster]
			};
		}
	}
}

browser.runtime.sendMessage({
	messageType: 'movie-titles',
	messageContent: movies
});

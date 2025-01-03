if (typeof browser === 'undefined') {
	var browser = chrome;
}

var filmposters = document.body.getElementsByClassName('poster-container');

var movies = {};
for (let poster = 0; poster < filmposters['length']; poster++) {
	let outerDiv = filmposters[poster].children[0];
	if (outerDiv.attributes.hasOwnProperty('data-film-name')) {
		let filmName = outerDiv.attributes['data-film-name'].value;

		let filmYear = -1;
		if (outerDiv.attributes.hasOwnProperty('data-film-release-year')) {
			filmYear = outerDiv.attributes['data-film-release-year'].value;
		}
		else if (outerDiv.children[0].children[1].attributes.hasOwnProperty('data-original-title')) {
			// sometimes, the release year is not specified as own attribute
			// we need to find the release year on a different way then

			let movieWithYear = outerDiv.children[0].children[1].attributes['data-original-title'].value; // contains "title (year)"
			let yearRegex = /\((\d{4})\)/;
			let match = movieWithYear.match(yearRegex);
			if (match) {
				filmYear = match[1];  // the year is in the first capture group
			}
		}
		else {
			// we are unlucky, no date specified
		}

		if (movies.hasOwnProperty(filmName)) {
			if (movies[filmName].year === -1) {
				movies[filmName].year = filmYear;
			}

			movies[filmName].id.push(poster);
		} else {
			movies[filmName] = {
				year: filmYear,
				id: [poster]
			};
		}
	} else {
		// if poster does not have attribute "data-film-name" it is lazy loaded
		// we need to find the poster on a different way then
		let filmName = outerDiv.children[0].alt;

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

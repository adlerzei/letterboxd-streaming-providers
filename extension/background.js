/*!
 *
 *     Copyright (c) 2021 Christian Zei
 *
 *     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *     IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *     FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *     AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *     LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *     OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *     SOFTWARE.
 *
 *
 */

"use strict";

// for compatibility reasons
var browser = chrome;

var providerId = 0; // e.g. Netflix: 8, Amazon Prime Video: 9

var providers = {};

var countries = {};

var justWatchCountryCode = ''; // e.g. German: "de_DE", USA: "en_US"
var tmdbCountryCode = ''; // e.g. German: "de-DE", USA: "en-US"
var tmdbCountryCode2 = ''; // e.g. Austria: "de"

var availableMovies = {};
var crawledMovies = {};
var unsolvedRequests = {};
var unsolvedRequestsDelay = {};
var tmdbKey = '';

var checkCounter = {};

var filterStatus = false;

var reloadActive = {};

/**
 * Loads all information from JSON files for intern computations. Also loads the current settings.
 *
 * @returns {Promise<void>} - An empty Promise if the loadings worked correctly, else the Promise contains the respective errors.
 */
const onStartUp = async () => {
	// load country list
	loadJSON("countries/countries.json", function (response) {
		// Parse JSON string into object
		countries = JSON.parse(response);

		requestProviderList();
	});

	// load TMDb key
	loadJSON("settings/api.json", function (response) {
		// Parse JSON string into object
		response = JSON.parse(response);
		tmdbKey = response.tmdb;
	});

	// load stored settings from localStorage
	browser.storage.local.get(parseSettings);

	function requestProviderList() {
		for (let country in countries) {
			if (!countries[country].hasOwnProperty('justwatch_country_code'))
				continue;

			let country_code = countries[country].justwatch_country_code; // TODO escape

			let xhttp = new XMLHttpRequest();
			xhttp.open("GET", "https://apis.justwatch.com/content/providers/locale/" + country_code, true);
			xhttp.send();
			xhttp.onreadystatechange = createProviderDataCallback(xhttp, country);
		}
	}

	function createProviderDataCallback(xhttp, country) {
		return function() {
			if (xhttp.readyState === 4 && xhttp.status === 200) {
				let rsp = JSON.parse(xhttp.response);
				for (let entry of rsp) {
					if (!entry.hasOwnProperty('id') || !entry.hasOwnProperty('short_name') || !entry.hasOwnProperty('clear_name') || !entry.hasOwnProperty('monetization_types'))
						continue;

					if (!entry.monetization_types.includes('flatrate') && !entry.monetization_types.includes('free'))
						continue;

					if (!providers.hasOwnProperty(entry.short_name)) {
						providers[entry.short_name] = {
							'provider_id': Number(entry.id),
							'name': entry.clear_name,
							'countries': []
						};
					}

					if (!providers[entry.short_name].countries.includes(country)) {
						providers[entry.short_name].countries.push(country);
					}
				}
			}
		}
	}

	function parseSettings(item) {
		let version = 0;
		let countrySet = false;
		let languageSet = false;
		let providerSet = false;
		let statusSet = false;

		if (item.hasOwnProperty('version')) {
			version = item.version;
		}
		if (item.hasOwnProperty('justwatch_country_code')) {
			countrySet = true;
			setJustWatchCountryCode(item.justwatch_country_code);
		}
		if (item.hasOwnProperty('tmdb_country_code')) {
			languageSet = true;
			setTMDBCountryCode(item.tmdb_country_code);
		}
		if (item.hasOwnProperty('tmdb_country_code_2')) {
			setTMDBCountryCode2(item.tmdb_country_code_2);
		}
		if (item.hasOwnProperty('provider_id')) {
			providerSet = true;
			setProviderId(item.provider_id);
		}
		if (item.hasOwnProperty('filter_status')) {
			statusSet = true;
			setFilterStatus(item.filter_status);
		}

		if (version < 1.2) {
			if (item.hasOwnProperty('country_code')) {
				countrySet = true;
				setJustWatchCountryCode(item.country_code);
				browser.storage.local.remove('country_code');
			}

			if (item.hasOwnProperty('filterStatus')) {
				statusSet = true;
				setFilterStatus(item.filterStatus);
				browser.storage.local.remove('filterStatus');
			}

			if (countrySet) {
				estimateTMDBCountryCode(justWatchCountryCode);
				languageSet = true;
			}
		}

		if (version < 1.4) {
			if (countrySet) {
				estimateTMDBCountryCode2(justWatchCountryCode);
			}
		}

		if ((!countrySet) || (!languageSet) || (!providerSet) || (!statusSet)) {
			loadDefaultSettings(countrySet, languageSet, providerSet, statusSet);
		}
	}

	function estimateTMDBCountryCode(code) {
		for (let country in countries) {
			if (!response[country].hasOwnProperty('justwatch_country_code') || !response[country].hasOwnProperty('tmdb_country_code'))
				continue;

			if (response[country].justwatch_country_code === code) {
				setTMDBCountryCode(response[country].tmdb_country_code);
				return;
			}
		}
		loadDefaultSettings(true, false, true, true)
	}

	function estimateTMDBCountryCode2(code) {
		for (let country in countries) {
			if (!response[country].hasOwnProperty('justwatch_country_code') || !response[country].hasOwnProperty('tmdb_country_code_2'))
				continue;

			if (response[country].justwatch_country_code === code) {
				setTMDBCountryCode2(response[country].tmdb_country_code_2);
				return;
			}
		}
	}

	function loadDefaultSettings(countrySet, languageSet, providerSet, statusSet) {
		// load default settings
		loadJSON("settings/default.json", function (response) {
			// Parse JSON string into object
			response = JSON.parse(response);
			// set the intern settings
			if (!countrySet && response.hasOwnProperty('justwatch_country_code')) {
				setJustWatchCountryCode(response.justwatch_country_code);
			}
			if (!languageSet && response.hasOwnProperty('tmdb_country_code')) {
				setTMDBCountryCode(response.tmdb_country_code);
			}
			if (!providerSet && response.hasOwnProperty('provider_id')) {
				setProviderId(response.provider_id);
			}
			if (!statusSet && response.hasOwnProperty('filter_status')) {
				setFilterStatus(response.filter_status);
			}
		});
	}
};

/**
 * Called to load a JSON file.
 *
 * @param {string} path - The path to the JSON file.
 * @param {function} callback - A callback function, which is called after loading the file successfully.
 */
const loadJSON = (path, callback) => {
	var xobj = new XMLHttpRequest();
	xobj.overrideMimeType("application/json");
	xobj.open('GET', path, true);
	xobj.onreadystatechange = function () {
		if (xobj.readyState === 4 && xobj.status === 200) {
			// Required use of an anonymous callback as .open will NOT return a value but simply returns undefined in asynchronous mode
			callback(xobj.responseText);
		}
	};
	xobj.send(null);
};

/**
 * Stores the settings in localStorage.
 *
 * @param {string} justWatchCountryCode - The currently set country code to store.
 * @param {string} tmdbCountryCode - The currently set TMDb country code to store.
 * @param {string} tmdbCountryCode2 - The currently set TMDb country code 2 to store.
 * @param {int} providerId - The currently set provider id to store.
 * @param {boolean} filterStatus - The currently set filter status to store.
 */
function storeSettings(justWatchCountryCode, tmdbCountryCode, tmdbCountryCode2, providerId, filterStatus) {
	let version = 1.4;

	browser.storage.local.set({
		version: version,
		justwatch_country_code: justWatchCountryCode,
		tmdb_country_code: tmdbCountryCode,
		tmdb_country_code_2: tmdbCountryCode2,
		provider_id: providerId,
		filter_status: filterStatus
	});
}

onStartUp();

/**
 * Checks if a movie is available and adds it to availableMovies[tabId].
 *
 * @param {object} toFind - An object, which contains the movie title, the release year and the Letterboxd-intern array id.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @returns {Promise<void>} - An empty Promise if the API calls worked correctly, else the Promise contains the respective errors.
 */
async function isIncluded(tabId, toFind) {
	let englishTitle = toFind.title;
	let titleSanitized = encodeURIComponent(englishTitle);

	let xhttp = new XMLHttpRequest();

	let justwatchRequest = {
		page: 1,
		page_size: 30,
		query: titleSanitized,
	};

	xhttp.open('GET', "https://apis.justwatch.com/content/titles/" + justWatchCountryCode + "/popular?body=" + JSON.stringify(justwatchRequest), true);
	xhttp.send();

	xhttp.onreadystatechange = createJustWatchCallback(xhttp, tabId, toFind);
}

/**
 * Returns a callback function that processes the JustWatch request response.
 *
 * @param {XMLHttpRequest} xhttp - The XMLHttpRequest object from the ajax request.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @param {object} toFind - An object, which contains the movie title, the release year and the Letterboxd-intern array id.
 * @returns {function(): void} - The callback function.
 */
function createJustWatchCallback(xhttp, tabId, toFind) {
	return function() {
		if (xhttp.readyState === 4 && xhttp.status === 200) {
			let englishTitle = toFind.title;
			let movieReleaseYear = toFind.year;
			let movieLetterboxdId = toFind.id;

			if (isNaN(movieReleaseYear)) {
				movieReleaseYear = -1;
			}

			if (typeof movieReleaseYear === 'string') {
				movieReleaseYear = parseInt(movieReleaseYear);
			}

			toFind.year = movieReleaseYear;

			let titleSanitized = encodeURIComponent(englishTitle);

			let justwatchRsp = JSON.parse(xhttp.response);
			let matchFound = getOffersWithReleaseYear(tabId, justwatchRsp, movieLetterboxdId, englishTitle, movieReleaseYear);

			if (matchFound) {
				checkCounter[tabId]++;

				if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
					fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
				}
			} else {
				xhttp.open('GET', "https://api.themoviedb.org/3/search/multi?api_key=" + getAPIKey() + "&query=" + titleSanitized, true);
				xhttp.send();

				xhttp.onreadystatechange = createTMDbSearchCallback(xhttp, justwatchRsp, tabId, toFind);
			}
		} else if (xhttp.readyState === 4 && xhttp.status !== 200) {
			checkCounter[tabId]++;
			if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
				fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
			}
		}
	};
}

/**
 * Returns a callback function that processes the TMDb search request response.
 *
 * @param {XMLHttpRequest} xhttp - The XMLHttpRequest object from the ajax request.
 * @param {object} justwatchRsp - The response from the preceding JustWatch request.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @param {object} toFind - An object, which contains the movie title, the release year and the Letterboxd-intern array id.
 * @returns {function(): void} - The callback function.
 */
function createTMDbSearchCallback(xhttp, justwatchRsp, tabId, toFind) {
	return function() {
		if (xhttp.readyState === 4 && xhttp.status === 200) {
			let englishTitle = toFind.title;
			let movieReleaseYear = toFind.year;

			let tmdbRsp = JSON.parse(xhttp.response);

			let rslt = getIdWithReleaseYear(tabId, tmdbRsp, englishTitle, movieReleaseYear);
			let matchFound = rslt.matchFound;

			let tmdbId = -1;
			let mediaType = '';
			if (matchFound) {
				tmdbId = rslt.tmdbId;
				mediaType = rslt.mediaType;
			} else {
				rslt = getIdWithoutExactReleaseYear(tabId, tmdbRsp, englishTitle, movieReleaseYear);
				tmdbId = rslt.tmdbId;
				mediaType = rslt.mediaType;
				matchFound = rslt.matchFound;
			}

			toFind.tmdbId = tmdbId;
			toFind.mediaType = mediaType;

			if (matchFound) {
				let tmdbUrl = "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId; // todo escape

				if (tmdbCountryCode2 !== '')
				{
					xhttp.open('GET',  tmdbUrl + "/translations?api_key=" + getAPIKey(), true);
					xhttp.send();

					xhttp.onreadystatechange = createTMDbMediaTranslationsCallback(xhttp, justwatchRsp, tabId, toFind);
				} else {
					xhttp.open('GET', tmdbUrl + "?api_key=" + getAPIKey() + "&language=" + tmdbCountryCode, true); // todo escape
					xhttp.send();

					xhttp.onreadystatechange = createTMDbMediaInfoCallback(xhttp, justwatchRsp, tabId, toFind);
				}
			} else {
				checkCounter[tabId]++;
				if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
					fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
				}
			}
		} else if (xhttp.readyState === 4 && xhttp.status === 429) {
			checkCounter[tabId]++;
			unsolvedRequests[tabId][toFind.title] = {
				year: toFind.year,
				id: toFind.id
			};

			//unsolvedRequestsDelay[tabId] = parseInt(xhttp.getResponseHeader('Retry-After')); // commented out to lower traffic

			if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
				fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
			}
		} else if (xhttp.readyState === 4 && xhttp.status !== 200 && xhttp.status !== 429) {
			checkCounter[tabId]++;
			if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
				fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
			}
		}
	}
}

/**
 * Returns a callback function that processes the TMDb translation request response.
 *
 * @param {XMLHttpRequest} xhttp - The XMLHttpRequest object from the ajax request.
 * @param {object} justwatchRsp - The response from the preceding JustWatch request.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @param {object} toFind - An object, which contains the movie title, the release year, the media type, the TMDb id and the Letterboxd-intern array id.
 * @returns {function(): void} - The callback function.
 */
function createTMDbMediaTranslationsCallback(xhttp, justwatchRsp, tabId, toFind) {
	return function() {
		if (xhttp.readyState === 4 && xhttp.status === 200) {
			let tmdbId = toFind.tmdbId;
			let mediaType = toFind.mediaType;

			let tmdbUrl = "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId;

			let tmdbRsp = JSON.parse(xhttp.response);
			let countryCode = tmdbCountryCode;
			if (!isLanguageSupported(tmdbRsp, tmdbCountryCode)) {
				countryCode = tmdbCountryCode2;
			}

			xhttp.open('GET', tmdbUrl + "?api_key=" + getAPIKey() + "&language=" + countryCode, true); // todo escape
			xhttp.send();

			xhttp.onreadystatechange = createTMDbMediaInfoCallback(xhttp, justwatchRsp, tabId, toFind);
		} else if (xhttp.readyState === 4 && xhttp.status !== 200) {
			checkCounter[tabId]++;
			if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
				fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
			}
		}
	};
}

/**
 * Returns a callback function that processes the TMDb media info request response.
 *
 * @param {XMLHttpRequest} xhttp - The XMLHttpRequest object from the ajax request.
 * @param {object} justwatchRsp - The response from the preceding JustWatch request.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @param {object} toFind - An object, which contains the movie title, the release year, the media type, the TMDb id and the Letterboxd-intern array id.
 * @returns {function(): void} - The callback function.
 */
function createTMDbMediaInfoCallback(xhttp, justwatchRsp, tabId, toFind) {
	return function() {
		if (xhttp.readyState === 4 && xhttp.status === 200) {
			let englishTitle = toFind.title;
			let movieReleaseYear = toFind.year;
			let movieLetterboxdId = toFind.id;
			let mediaType = toFind.mediaType;

			let tmdbRsp = JSON.parse(xhttp.response);

			let titleLocalized = englishTitle;

			if (mediaType === 'movie') {
				if (tmdbRsp.hasOwnProperty('title')) {
					titleLocalized = tmdbRsp.title;
				} else {
					if (tmdbRsp.hasOwnProperty('original_title'))
						titleLocalized = tmdbRsp.original_title;
				}
			} else if (mediaType === 'tv') {
				if (tmdbRsp.hasOwnProperty('name')) {
					titleLocalized = tmdbRsp.name;
				} else {
					if (tmdbRsp.hasOwnProperty('original_name'))
						titleLocalized = tmdbRsp.original_name;
				}
			}

			let matchFound = getOffersWithReleaseYear(tabId, justwatchRsp, movieLetterboxdId, titleLocalized, movieReleaseYear);

			if (!matchFound) {
				getOffersWithoutExactReleaseYear(tabId, justwatchRsp, movieLetterboxdId, titleLocalized, movieReleaseYear);
			}

			checkCounter[tabId]++;

			if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
				fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
			}
		} else if (xhttp.readyState === 4 && xhttp.status !== 200) {
			checkCounter[tabId]++;
			if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
				fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
			}
		}
	};
}

/**
 * Checks if the streaming provider offers a flatrate for the given movie released in movieReleaseYear.
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} rsp - The response from the ajax request.
 * @param {int} letterboxdMovieId - The intern ID from the array in letterboxd.com.
 * @param {string} title - The movie title.
 * @param {int} movieReleaseYear - The movie's release year.
 * @returns {boolean} - Returns true if the searched movie is found unter the given conditions, returns false else.
 */
function getOffersWithReleaseYear(tabId, rsp, letterboxdMovieId, title, movieReleaseYear) {
	for (let item in rsp.items) {
		if (!rsp.items[item].hasOwnProperty('original_release_year') || !rsp.items[item].hasOwnProperty('title') || !rsp.items[item].hasOwnProperty('offers'))
			continue;

		if (rsp.items[item].title.toLowerCase() === title.toLowerCase() && rsp.items[item].original_release_year === movieReleaseYear) {
			for (let offer in rsp.items[item].offers) {
				if (!rsp.items[item].offers[offer].hasOwnProperty('monetization_type') || !rsp.items[item].offers[offer].hasOwnProperty('provider_id'))
					continue;

				if (rsp.items[item].offers[offer].monetization_type === 'flatrate' || rsp.items[item].offers[offer].monetization_type === 'free') {
					if (Number(rsp.items[item].offers[offer].provider_id) === providerId) {
						availableMovies[tabId].push(...letterboxdMovieId);
						return true;
					}
				}
			}
			return true;
		}
	}
	return false;
}

/**
 * Checks if the streaming provider offers a flatrate for the given movie released in movieReleaseYear-1 or movieReleaseYear+1 or if the movieReleaseYear is invalid (=-1).
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} rsp - The response from the ajax request.
 * @param {int} letterboxdMovieId - The intern ID from the array in letterboxd.com.
 * @param {string} title - The movie title.
 * @param {int} movieReleaseYear - The movie's release year.
 */
function getOffersWithoutExactReleaseYear(tabId, rsp, letterboxdMovieId, title, movieReleaseYear) {
	for (let item in rsp.items) {
		if (!rsp.items[item].hasOwnProperty('original_release_year') || !rsp.items[item].hasOwnProperty('title') || !rsp.items[item].hasOwnProperty('offers'))
			continue; // TODO maybe find best candidate if original_release_year was not found

		// TODO cast the years correctly before comparison (check if needed at all??)
		if (rsp.items[item].title.toLowerCase() === title.toLowerCase()
			&& ((rsp.items[item].original_release_year === movieReleaseYear - 1)) || (rsp.items[item].original_release_year === movieReleaseYear + 1) || (movieReleaseYear === -1)) {
			for (let offer in rsp.items[item].offers) {
				if (!rsp.items[item].offers[offer].hasOwnProperty('monetization_type') || !rsp.items[item].offers[offer].hasOwnProperty('provider_id'))
					continue;

				if (rsp.items[item].offers[offer].monetization_type === 'flatrate' || rsp.items[item].offers[offer].monetization_type === 'free') {
					if (Number(rsp.items[item].offers[offer].provider_id) === providerId) {
						availableMovies[tabId].push(...letterboxdMovieId);
						return;
					}
				}
			}
			return;
		}
	}
}

/**
 * Returns the TMDB ID for a given English media title and a corresponding release year.
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} tmdbRsp - The response from the ajax request.
 * @param {string} titleEnglish - The English movie title.
 * @param {int} releaseYear - The media's release year.
 * @returns {{tmdbId: int, mediaType: string, matchFound: boolean}} - An object containing the TMDB movie ID, the media type and if this was a perfect match (titleEnglish and movie_release_year match up).
 */
function getIdWithReleaseYear(tabId, tmdbRsp, titleEnglish, releaseYear) {
	if (releaseYear !== -1) {
		for (let item in tmdbRsp.results) {
			if (!tmdbRsp.results[item].hasOwnProperty('media_type'))
				continue;

			let itemTitle = '';
			let itemReleaseDate = '';
			if (tmdbRsp.results[item].media_type === 'movie') {
				if (!tmdbRsp.results[item].hasOwnProperty('release_date') || !tmdbRsp.results[item].hasOwnProperty('title'))
					continue;

				itemTitle = tmdbRsp.results[item].title;
				itemReleaseDate = tmdbRsp.results[item].release_date;
			} else if (tmdbRsp.results[item].media_type === 'tv') {
				if (!tmdbRsp.results[item].hasOwnProperty('first_air_date') || !tmdbRsp.results[item].hasOwnProperty('name'))
					continue;

				itemTitle = tmdbRsp.results[item].name;
				itemReleaseDate = tmdbRsp.results[item].first_air_date;
			} else {
				continue;
			}

			let itemReleaseYear = itemReleaseDate.split('-')[0];
			if (typeof itemReleaseYear === 'string') {
				itemReleaseYear = parseInt(itemReleaseYear);
			}

			if (itemTitle.toLowerCase() === titleEnglish.toLowerCase() && itemReleaseYear === releaseYear) {
				return {
					tmdbId: tmdbRsp.results[item].id,
					mediaType: tmdbRsp.results[item].media_type,
					matchFound: true
				};
			}
		}
	}

	return {
		tmdbId: -1,
		mediaType: '',
		matchFound: false
	};
}

/**
 * Returns the TMDB ID for a given English media title and a for the given movie released in releaseYear-1 or releaseYear+1 or if the releaseYear is invalid (=-1).
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} tmdbRsp - The response from the ajax request.
 * @param {string} titleEnglish - The English movie title.
 * @param {int} releaseYear - The media's release year.
 * @returns {{tmdbId: int, mediaType: string, matchFound: boolean}} - An object containing the TMDB movie ID, the media type and if a match was found.
 */
function getIdWithoutExactReleaseYear(tabId, tmdbRsp, titleEnglish, releaseYear) {
	for (let item in tmdbRsp.results) {
		if (!tmdbRsp.results[item].hasOwnProperty('media_type'))
			continue;

		let itemTitle = '';
		let itemReleaseDate = '';
		if (tmdbRsp.results[item].media_type === 'movie') {
			if (!tmdbRsp.results[item].hasOwnProperty('release_date') || !tmdbRsp.results[item].hasOwnProperty('title'))
				continue; // TODO maybe find best candidate if this happens?

			itemTitle = tmdbRsp.results[item].title;
			itemReleaseDate = tmdbRsp.results[item].release_date;
		} else if (tmdbRsp.results[item].media_type === 'tv') {
			if (!tmdbRsp.results[item].hasOwnProperty('first_air_date') || !tmdbRsp.results[item].hasOwnProperty('name'))
				continue; // TODO maybe find best candidate if this happens?

			itemTitle = tmdbRsp.results[item].name;
			itemReleaseDate = tmdbRsp.results[item].first_air_date;
		} else {
			continue;
		}

		let itemReleaseYear = itemReleaseDate.split('-')[0];
		if (typeof itemReleaseYear === 'string') {
			itemReleaseYear = parseInt(itemReleaseYear);
		}

		if (itemTitle.toLowerCase() === titleEnglish.toLowerCase()
			&& ((releaseYear === -1) || (itemReleaseYear === releaseYear - 1) || (itemReleaseYear === releaseYear + 1))) {
			return {
				tmdbId: tmdbRsp.results[item].id,
				mediaType: tmdbRsp.results[item].media_type,
				matchFound: true
			};
		}
	}

	return {
		tmdbId: -1,
		mediaType: '',
		matchFound: false
	};
}

/**
 * Checks if the given language is supported.
 *
 * @param tmdbRsp - The response from the ajax request.
 * @param tmdbCountryCode - The TMDb country code to be checked.
 * @returns {boolean} - True if the given language is supported.
 */
function isLanguageSupported(tmdbRsp, tmdbCountryCode) {
	if (!tmdbRsp.hasOwnProperty('translations'))
		return false;

	for (let translation of tmdbRsp.translations) {
		let countryCodeFromRsp = translation.iso_639_1 + '-' + translation.iso_3166_1;
		if (countryCodeFromRsp === tmdbCountryCode)
			return true;
	}

	return false;
}

/**
 * Injects a content script into the Letterboxd web page to crawl the movie titles and release years.
 *
 * @param tabId - The tabId to operate in.
 */
function getFilmsFromLetterboxd(tabId) {
	browser.tabs.get(tabId, (tab) => {
		let fileName = "./scripts/getFilmsFromLetterboxd.js";

		browser.tabs.executeScript(tabId, {
			file: fileName,
			allFrames: true
		});
	});
}

browser.runtime.onMessage.addListener(handleMessage);

browser.tabs.onUpdated.addListener(checkForLetterboxd);

/**
 * Returns the currently set provider id.
 *
 * @returns {int} - The currently set provider id.
 */
function getProviderId() {
	return providerId;
}

/**
 * Returns the currently set country code
 *
 * @returns {string} - The currently set country code
 */
function getJustWatchCountryCode() {
	return justWatchCountryCode;
}

/**
 * Returns the currently set TMDb country code
 *
 * @returns {string} - The currently set TMDb country code
 */
function getTMDBCountryCode() {
	return tmdbCountryCode;
}

/**
 * Returns the currently set TMDb country code 2
 *
 * @returns {string} - The currently set TMDb country code 2
 */
function getTMDBCountryCode2() {
	return tmdbCountryCode2;
}

/**
 * Returns all supported providers.
 *
 * @returns {object} - The providers requested from JustWatch.
 */
function getProviders() {
	return providers;
}

/**
 * Returns all supported countries.
 *
 * @returns {object} - The countries loaded from countries.json.
 */
function getCountries() {
	return countries;
}

/**
 * Returns the status of the filter.
 *
 * @returns {boolean} - True if the filter is enabled and false else.
 */
function getFilterStatus() {
	return filterStatus;
}

/**
 * To change the provider ID out of the popup.
 *
 * @param {int} id - The new provider ID.
 */
function setProviderId(id) {
	if (providerId === Number(id))
		return;

	providerId = Number(id);
	storeSettings(justWatchCountryCode, tmdbCountryCode, tmdbCountryCode2, providerId, filterStatus);
	reloadMovieFilter();
}

/**
 * Sets the status of the filter.
 *
 * @param {boolean} status - True if the filter should be enabled and false else.
 */
function setFilterStatus(status) {
	if (status === filterStatus)
		return;

	filterStatus = status;
	storeSettings(justWatchCountryCode, tmdbCountryCode, tmdbCountryCode2, providerId, filterStatus);
	reloadMovieFilter();
}

/**
 * To change the JustWatch country code out of the settings.
 *
 * @param {string} code - The new JustWatch country code.
 */
function setJustWatchCountryCode(code) {
	if (code === justWatchCountryCode)
		return;

	justWatchCountryCode = code;
	storeSettings(justWatchCountryCode, tmdbCountryCode, tmdbCountryCode2, providerId, filterStatus);
	reloadMovieFilter();
}

/**
 * To change the TMDB country code out of the settings.
 *
 * @param {string} code - The new TMDB country code.
 */
function setTMDBCountryCode(code) {
	if (code === tmdbCountryCode)
		return;

	tmdbCountryCode = code;
	storeSettings(justWatchCountryCode, tmdbCountryCode, tmdbCountryCode2, providerId, filterStatus);
}

/**
 * To change the TMDB country code 2 out of the settings.
 *
 * @param {string} code - The new TMDB country code 2.
 */
function setTMDBCountryCode2(code) {
	if (code === tmdbCountryCode2)
		return;

	tmdbCountryCode2 = code;
	storeSettings(justWatchCountryCode, tmdbCountryCode, tmdbCountryCode2, providerId, filterStatus);
}

/**
 * Called to force the filters to reload with the new provider ID.
 */
function reloadMovieFilter() {
	browser.tabs.query({}, reloadFilterInTab);

	function reloadFilterInTab(tabs) {
		for (let tab of tabs) {
			let tabId = tab.id;

			if (reloadActive[tabId])
				continue;
			else
				reloadActive[tabId] = true;

			let changeInfo = {
				status: 'complete'
			};
			let tabInfo = {
				url: tab.url
			};

			// unfadeUnstreamedMovies(tabId, crawledMovies[tabId]);
			unfadeAllMovies(tabId);
			checkForLetterboxd(tabId, changeInfo, tabInfo);
		}
	}
}

/**
 * Returns the API Key for TMDb.
 *
 * @returns {string} - The API key.
 */
function getAPIKey() {
	return tmdbKey;
}

/**
 * Checks if the current URL of the tab matches the given pattern.
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} changeInfo - The changeInfo from the tabs.onUpdated event.
 * @param {object} tabInfo - The tabInfo from the tabs.onUpdated event.
 */
function checkForLetterboxd(tabId, changeInfo, tabInfo) {
	if (filterStatus) {
		if (changeInfo.hasOwnProperty('status') && changeInfo.status === 'complete') {
			let url = tabInfo.url;
			if (url.includes("://letterboxd.com/") || url.includes("://www.letterboxd.com/")) {
				if (url.includes('/watchlist/') || url.includes('/films/') || url.includes('/likes/') || url.includes('/list/')) { // || url === "https://letterboxd.com/" || url === 'https://www.letterboxd.com/'
					checkCounter[tabId] = 0;
					availableMovies[tabId] = [];
					crawledMovies[tabId] = {};
					unsolvedRequests[tabId] = {};
					unsolvedRequestsDelay[tabId] = 10000;
					getFilmsFromLetterboxd(tabId);
				}
			}
		}
	} else {
		reloadActive[tabId] = false;
	}
}

/**
 * Called from within the listener for new messages from the content script.
 *
 * @param {{messageType: string, messageContent: object}} request - The message from the content script.
 * @param {object} sender - The sender from the runtime.onMessage event.
 * @param {object} sendResponse - The sendResponse from the runtime.onMessage event.
 */
function handleMessage(request, sender, sendResponse) {
	var tabId;
	if (sender.hasOwnProperty('tab') && sender.tab.hasOwnProperty('id')) {
		tabId = sender.tab.id;
	} else {
		console.log("Error: missing TabId");
	}
	if (request.hasOwnProperty('messageType') && request.hasOwnProperty('messageContent')) {
		if (request.messageType === 'movie-titles') {
			crawledMovies[tabId] = request.messageContent;
			if (Object.keys(crawledMovies[tabId]).length === 0) {
				getFilmsFromLetterboxd(tabId);
			} else {
				checkMovieAvailability(tabId, crawledMovies[tabId]);
			}
		}
	}
}

/**
 * Calls the method for checking the movie availability for each movie in movies.
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} movies - The crawled movies from Letterboxed.
 */
function checkMovieAvailability(tabId, movies) {
	if (filterStatus) {
		prepareLetterboxdForFading(tabId);
		for (let movie in movies) {
			var inc = isIncluded(tabId, {
				title: movie,
				year: movies[movie].year,
				id: movies[movie].id
			});
		}
	} else {
		reloadActive[tabId] = false;
	}
}

/**
 * Inserts CSS and a corresponding content script in Letterboxd to add a new class and its style sheets.
 *
 * @param tabId - The tabId to operate in.
 */
function prepareLetterboxdForFading(tabId) {
	browser.tabs.insertCSS(tabId, {
		file: "./style/hideunstreamed.css"
	});

	browser.tabs.executeScript(tabId, {
		code: "document.body.className += ' hide-films-unstreamed';",
		allFrames: false
	});
}

/**
 * Inserts a content script for unfading all unavailable movies,
 *
 * @param tabId - The tabId to operate in.
 * @param movies - The crawled movies.
 */
function fadeUnstreamableMovies(tabId, movies) {
	var className = 'poster-container';

	for (let movie in movies) {
		for (let movie_id in movies[movie].id) {
			if (!availableMovies[tabId].includes(movies[movie].id[movie_id])) {
				browser.tabs.executeScript(tabId, {
					code: "filmposters = document.body.getElementsByClassName('" + className + "'); \n" +
						"filmposters[" + movies[movie].id[movie_id] + "].className += ' film-not-streamed';",
					allFrames: false
				});
			}
		}
	}

	// // short delay for the overview page, needs to reload intern javascript
	// if (tab.url.includes('letterboxd.com/films/')) {
	// 	setTimeout(function () {
	// 		fadeUnstreamableMovies(tabId, movies);
	// 	}, 500);
	// }

	// if there are unsolved requests left: solve them
	if (Object.keys(unsolvedRequests[tabId]).length !== 0) {
		if (isNaN(unsolvedRequestsDelay[tabId])) {
			unsolvedRequestsDelay[tabId] = 10000;
		}

		// but first wait for a delay to limit the traffic
		setTimeout(function () {
			var movies = JSON.parse(JSON.stringify(unsolvedRequests[tabId]));
			unsolvedRequests[tabId] = {};
			checkMovieAvailability(tabId, movies);
		}, unsolvedRequestsDelay[tabId]);
	}

	reloadActive[tabId] = false;
}

/**
 * Inserts a content script to unfade all movies on Letterboxd.
 *
 * @param tabId - The tabId to operate in.
 */
function unfadeAllMovies(tabId) {
	browser.tabs.get(tabId, (tab) => {
		if (!tab.url.includes('://letterboxd.com/') && !tab.url.includes('://www.letterboxd.com/'))
			return;

		var className = 'poster-container';

		browser.tabs.executeScript(tabId, {
			code: "filmposters = document.body.getElementsByClassName('" + className + "'); \n" +
				"for(poster in filmposters) { \n" +
				"  filmposters[poster].className = filmposters[poster].className.replace(' film-not-streamed', ''); \n" +
				"}",
			allFrames: false
		});
	});
}
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

// settings
var justWatchCountryCode = ''; // e.g. German: "de_DE", USA: "en_US"
var tmdbCountryCode = ''; // e.g. German: "de-DE", USA: "en-US"
var tmdbCountryCode2 = ''; // e.g. Austria: "de"
var providerId = 0; // e.g. Netflix: 8, Amazon Prime Video: 9
var filterStatus = false;

// cache
var providers = {};
var countries = {};

var availableMovies = {};
var crawledMovies = {};
var unsolvedRequests = {};
var tmdbKey = '';

var checkCounter = {};

var reloadActive = {};

/**
 * Loads all information from JSON files for intern computations. Also loads the current settings.
 *
 * @returns {Promise<void>} - An empty Promise if the loadings worked correctly, else the Promise contains the respective errors.
 */
const onStartUp = async () => {
	// load country list
	loadJSON("countries/countries.json", function (json) {
		countries = json;

		// persist for later service worker cycles
		browser.storage.session.set({countries: countries});

		requestProviderList();
	});

	// load TMDb key
	loadJSON("settings/api.json", function (json) {
		tmdbKey = json.tmdb;

		// persist for later service worker cycles
		browser.storage.session.set({tmdb_key: tmdbKey});
	});

	// load stored settings from localStorage
	browser.storage.local.get(parseSettings);

	function requestProviderList() {
		for (let country in countries) {
			if (!countries[country].hasOwnProperty('justwatch_country_code'))
				continue;

			let country_code = countries[country].justwatch_country_code; // TODO escape

			fetch('https://apis.justwatch.com/content/providers/locale/' + country_code)
				.then(response => providerDataCallback(response, country));
		}
	}

	async function providerDataCallback(response, country) {
		if (response.status == 200) {
			let rsp = await response.json();
			for (let entry of rsp) {
				if (!entry.hasOwnProperty('id') || !entry.hasOwnProperty('short_name') || !entry.hasOwnProperty('clear_name') || !entry.hasOwnProperty('monetization_types'))
					continue;

				if (entry.monetization_types == null || !entry.monetization_types.includes('flatrate') && !entry.monetization_types.includes('free'))
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

			// persist for later service worker cycles
			browser.storage.session.set({providers: providers});
		}
	}
};

function parseSettings(items) {;
	let countrySet = false;
	let tmdbCountryCodeSet = false;
	let tmdbCountryCode2Set = false;
	let languageSet = false;
	let providerSet = false;
	let statusSet = false;

	if (items.hasOwnProperty('justwatch_country_code')) {
		countrySet = true;
		justWatchCountryCode = items.justwatch_country_code;
	}
	if (items.hasOwnProperty('tmdb_country_code')) {
		tmdbCountryCodeSet = true;
		tmdbCountryCode = items.tmdb_country_code;
	}
	if (items.hasOwnProperty('tmdb_country_code_2')) {
		tmdbCountryCode2Set = true;
		tmdbCountryCode2 = items.tmdb_country_code_2;
	}
	languageSet = tmdbCountryCodeSet && tmdbCountryCode2Set;
	if (items.hasOwnProperty('provider_id')) {
		providerSet = true;
		providerId = items.provider_id;
	}
	if (items.hasOwnProperty('filter_status')) {
		statusSet = true;
		filterStatus = items.filter_status;
	}

	if ((!countrySet) || (!languageSet) || (!providerSet) || (!statusSet)) {
		loadDefaultSettings(countrySet, languageSet, providerSet, statusSet);
	}
}

function loadDefaultSettings(countrySet, languageSet, providerSet, statusSet) {
	// load default settings
	loadJSON("settings/default.json", function (json) {
		// set the intern settings
		if (!countrySet && json.hasOwnProperty('justwatch_country_code')) {
			justWatchCountryCode = json.justwatch_country_code;
		}
		if (!languageSet && json.hasOwnProperty('tmdb_country_code') && json.hasOwnProperty('tmdb_country_code_2')) {
			tmdbCountryCode = json.tmdb_country_code;
			tmdbCountryCode2 = json.tmdb_country_code_2;
		}
		if (!providerSet && json.hasOwnProperty('provider_id')) {
			providerId = json.provider_id;
		}
		if (!statusSet && json.hasOwnProperty('filter_status')) {
			filterStatus = json.filter_status;
		}
	});
}

function parseCache(items) {
	providers = items.hasOwnProperty('providers') ? items.providers : {};
	countries = items.hasOwnProperty('countries') ? items.countries : {};

	availableMovies = items.hasOwnProperty('available_movies') ? items.available_movies : {};
	crawledMovies = items.hasOwnProperty('crawled_movies') ? items.crawled_movies : {};
	unsolvedRequests = items.hasOwnProperty('unsolved_requests') ? items.unsolved_requests : {};
	tmdbKey = items.hasOwnProperty('tmdb_key') ? items.tmdb_key : '';

	checkCounter = items.hasOwnProperty('check_counter') ? items.check_counter : {};

	reloadActive = items.hasOwnProperty('reload_active') ? items.reload_active : {};
}

/**
 * Called to load a JSON file.
 *
 * @param {string} path - The path to the JSON file.
 * @param {function} callback - A callback function, which is called after loading the file successfully.
 */
const loadJSON = async (path, callback) => {
	let response = await fetch(path);

	if (response.status === 200) {
		callback(await response.json());
	}
};

/**
 * Checks if a movie is available and adds it to availableMovies[tabId].
 *
 * @param {object} toFind - An object, which contains the movie title, the release year and the Letterboxd-intern array id.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @returns {Promise<void>} - An empty Promise if the API calls worked correctly, else the Promise contains the respective errors.
 */
function isIncluded(tabId, toFind) {
	let englishTitle = toFind.title;
	let titleSanitized = encodeURIComponent(englishTitle);

	let justwatchRequest = {
		page: 1,
		page_size: 30,
		query: titleSanitized,
	};

	fetch("https://apis.justwatch.com/content/titles/" + justWatchCountryCode + "/popular?body=" + JSON.stringify(justwatchRequest))
		.then(response => justWatchCallback(response, tabId, toFind));
}

/**
 * Processes the JustWatch request response
 *
 * @param {Response} response - The Response interface of the Fetch API.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @param {object} toFind - An object, which contains the movie title, the release year and the Letterboxd-intern array id.
 */
async function justWatchCallback(response, tabId, toFind) {
	if (response.status === 200) {
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

		let justwatchRsp = await response.json();
		let matchFound = getOffersWithReleaseYear(tabId, justwatchRsp, movieLetterboxdId, englishTitle, movieReleaseYear);

		if (matchFound) {
			checkCounter[tabId]++;

			// persist for later service worker cycles
			browser.storage.session.set({check_counter: checkCounter});

			if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
				fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
			}
		} else {
			fetch("https://api.themoviedb.org/3/search/multi?api_key=" + getAPIKey() + "&query=" + titleSanitized)
				.then(response => tmdbSearchCallback(response, justwatchRsp, tabId, toFind));
		}
	} else if (response.status !== 200) {
		checkCounter[tabId]++;

		// persist for later service worker cycles
		browser.storage.session.set({check_counter: checkCounter});

		if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
			fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
		}
	}
}

/**
 * Processes the TMDb search request response.
 *
 * @param {Response} response - The Response interface of the Fetch API.
 * @param {object} justwatchRsp - The response from the preceding JustWatch request.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @param {object} toFind - An object, which contains the movie title, the release year and the Letterboxd-intern array id.
 */
async function tmdbSearchCallback(response, justwatchRsp, tabId, toFind) {
	if (response.status === 200) {
		let englishTitle = toFind.title;
		let movieReleaseYear = toFind.year;

		let tmdbRsp = await response.json();

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
			let tmdbUrl = "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId; // TODO escape

			if (tmdbCountryCode2 !== '')
			{
				fetch(tmdbUrl + "/translations?api_key=" + getAPIKey())
					.then(response => tmdbMediaTranslationsCallback(response, justwatchRsp, tabId, toFind));
			} else {
				fetch(tmdbUrl + "?api_key=" + getAPIKey() + "&language=" + tmdbCountryCode) // TODO escape
					.then(response => tmdbMediaInfoCallback(response, justwatchRsp, tabId, toFind));
			}
		} else {
			checkCounter[tabId]++;

			// persist for later service worker cycles
			browser.storage.session.set({check_counter: checkCounter});

			if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
				fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
			}
		}
	} else if (response.status === 429) {
		checkCounter[tabId]++;

		// persist for later service worker cycles
		browser.storage.session.set({check_counter: checkCounter});

		unsolvedRequests[tabId][toFind.title] = {
			year: toFind.year,
			id: toFind.id
		};
		
		// persist for later service worker cycles
		browser.storage.session.set({unsolved_requests: unsolvedRequests});

		if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
			fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
		}
	} else {
		checkCounter[tabId]++;

		// persist for later service worker cycles
		browser.storage.session.set({check_counter: checkCounter});

		if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
			fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
		}
	}
}

/**
 * Processes the TMDb translation request response.
 *
 * @param {Response} response - The Response interface of the Fetch API.
 * @param {object} justwatchRsp - The response from the preceding JustWatch request.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @param {object} toFind - An object, which contains the movie title, the release year, the media type, the TMDb id and the Letterboxd-intern array id.
 */
async function tmdbMediaTranslationsCallback(response, justwatchRsp, tabId, toFind) {
	if (response.status === 200) {
		let tmdbId = toFind.tmdbId;
		let mediaType = toFind.mediaType;

		let tmdbUrl = "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId;

		let tmdbRsp = await response.json();
		let countryCode = tmdbCountryCode;
		if (!isLanguageSupported(tmdbRsp, tmdbCountryCode)) {
			countryCode = tmdbCountryCode2;
		}

		fetch(tmdbUrl + "?api_key=" + getAPIKey() + "&language=" + countryCode) // TODO escape
			.then(response => tmdbMediaInfoCallback(response, justwatchRsp, tabId, toFind));
	} else {
		checkCounter[tabId]++;

		// persist for later service worker cycles
		browser.storage.session.set({check_counter: checkCounter});

		if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
			fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
		}
	}
}

/**
 * Processes the TMDb media info request response.
 *
 * @param {Response} response - The Response interface of the Fetch API.
 * @param {object} justwatchRsp - The response from the preceding JustWatch request.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @param {object} toFind - An object, which contains the movie title, the release year, the media type, the TMDb id and the Letterboxd-intern array id.
 */
async function tmdbMediaInfoCallback(response, justwatchRsp, tabId, toFind) {
	if (response.status === 200) {
		let englishTitle = toFind.title;
		let movieReleaseYear = toFind.year;
		let movieLetterboxdId = toFind.id;
		let mediaType = toFind.mediaType;

		let tmdbRsp = await response.json();

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

		// persist for later service worker cycles
		browser.storage.session.set({check_counter: checkCounter});

		if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
			fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
		}
	} else {
		checkCounter[tabId]++;

		// persist for later service worker cycles
		browser.storage.session.set({check_counter: checkCounter});

		if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
			fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
		}
	}
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

						// persist for later service worker cycles
						browser.storage.session.set({available_movies: availableMovies});

						return true;
					}
				}
			}
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
			&& ((rsp.items[item].original_release_year === movieReleaseYear - 1) || (rsp.items[item].original_release_year === movieReleaseYear + 1) || (movieReleaseYear === -1))) {
			for (let offer in rsp.items[item].offers) {
				if (!rsp.items[item].offers[offer].hasOwnProperty('monetization_type') || !rsp.items[item].offers[offer].hasOwnProperty('provider_id'))
					continue;

				if (rsp.items[item].offers[offer].monetization_type === 'flatrate' || rsp.items[item].offers[offer].monetization_type === 'free') {
					if (Number(rsp.items[item].offers[offer].provider_id) === providerId) {
						availableMovies[tabId].push(...letterboxdMovieId);

						// persist for later service worker cycles
						browser.storage.session.set({available_movies: availableMovies});
						
						return;
					}
				}
			}
			return;
		}
	}
}

/**
 * Returns the TMDb ID for a given English media title and a corresponding release year.
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

		browser.scripting.executeScript({
			target: {
				tabId: tabId,
				allFrames: true
			},
			files: [fileName]
		});
	});
}

browser.runtime.onInstalled.addListener(() => onStartUp());
browser.runtime.onStartup.addListener(() => onStartUp());

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	// load stored settings from localStorage
	browser.storage.local.get((items) => {
		parseSettings(items);
		// load cached variables from sessionStorage
		browser.storage.session.get((items) => {
			parseCache(items);
			handleMessage(request, sender, sendResponse);
		});
	});
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tabInfo) => {
	// load stored settings from localStorage
	browser.storage.local.get((items) => {
		parseSettings(items);
		// load cached variables from sessionStorage
		browser.storage.session.get((items) => {
			parseCache(items);

			checkLetterboxdForPageReload(tabId, changeInfo, tabInfo);
		});
	});
});

browser.storage.local.onChanged.addListener(_ => {
		// load stored settings from localStorage
		browser.storage.local.get((items) => {
			parseSettings(items);
			// load cached variables from sessionStorage
			browser.storage.session.get((items) => {
				parseCache(items);

				reloadMovieFilter();
		});
	});
});

browser.alarms.onAlarm.addListener(alarm => {
	if (alarm.name != "handleUnsolvedRequests")
		return;

	// load stored settings from localStorage
	browser.storage.local.get((items) => {
		parseSettings(items);
		// load cached variables from sessionStorage
		browser.storage.session.get((items) => {
			parseCache(items);

			var movies = JSON.parse(JSON.stringify(unsolvedRequests[tabId]));
			unsolvedRequests[tabId] = {};

			// persist for later service worker cycles
			browser.storage.session.set({unsolved_requests: unsolvedRequests});

			checkMovieAvailability(tabId, movies);
		});
	});
});

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
			
			reloadActive[tabId] = true;

			// persist for later service worker cycles
			browser.storage.session.set({reload_active: reloadActive});

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
 * Waits for a short delay and then calls checkForLetterboxd.
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} changeInfo - The changeInfo from the tabs.onUpdated event.
 * @param {object} tabInfo - The tabInfo from the tabs.onUpdated event.
 */
function checkLetterboxdForPageReload(tabId, changeInfo, tabInfo) {
	// short timeout, wait for the page to load all release years (and other movie info)
	// using timeouts is not recommended in combination with service workers acc. to Google, 
	// bc. the service workers may stop terminate during the timeout
	// (see https://developer.chrome.com/docs/extensions/mv3/migrating_to_service_workers/#alarms).
	// However, alarm API does not allow such short timeouts and it does not work without it
	setTimeout(function () {
		checkForLetterboxd(tabId, changeInfo, tabInfo);
	}, 500);
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

					// persist for later service worker cycles
					browser.storage.session.set({
						check_counter: checkCounter,
						available_movies: availableMovies,
						crawled_movies: crawledMovies,
						unsolved_requests: unsolvedRequests,
					});

					getFilmsFromLetterboxd(tabId);
				}
			}
		}
	} else {
		reloadActive[tabId] = false;

		// persist for later service worker cycles
		browser.storage.session.set({reload_active: reloadActive});
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

			// persist for later service worker cycles
			browser.storage.session.set({crawled_movies: crawledMovies});

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
			isIncluded(tabId, {
				title: movie,
				year: movies[movie].year,
				id: movies[movie].id
			});
		}
	} else {
		reloadActive[tabId] = false;

		// persist for later service worker cycles
		browser.storage.session.set({reload_active: reloadActive});
	}
}

/**
 * Inserts CSS and a corresponding content script in Letterboxd to add a new class and its style sheets.
 *
 * @param tabId - The tabId to operate in.
 */
function prepareLetterboxdForFading(tabId) {
	browser.scripting.insertCSS({
		files: ["./style/hideunstreamed.css"],
		target: {
			tabId: tabId,
			allFrames: false
		},
	}, 
	() => {
		let fileName = "./scripts/prepareLetterboxdForFading.js";

		browser.scripting.executeScript({
			target: {
				tabId: tabId,
				allFrames: false
			},
			files: [fileName]
		});
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

	function fadeOut(className, movieId) {
		filmposters = document.body.getElementsByClassName(className);
		filmposters[movieId].className += ' film-not-streamed';
	}

	for (let movie in movies) {
		for (let movie_id in movies[movie].id) {
			if (!availableMovies[tabId].includes(movies[movie].id[movie_id])) {
				browser.scripting.executeScript({
					target: {
						tabId: tabId,
						allFrames: false
					},
					func: fadeOut,
					args: [className, movies[movie].id[movie_id]],
				});
			}
		}
	}

	// if there are unsolved requests left: solve them
	if (Object.keys(unsolvedRequests[tabId]).length !== 0) {
		// but first wait for a delay to limit the traffic
		browser.alarms.create("handleUnsolvedRequests", {
			delayInMinutes: 1 
		});
	}

	reloadActive[tabId] = false;

	// persist for later service worker cycles
	browser.storage.session.set({reload_active: reloadActive});
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

		function unfade(className) {
			filmposters = document.body.getElementsByClassName(className);
			for(poster in filmposters) {
				filmposters[poster].className = filmposters[poster].className.replace(' film-not-streamed', '');
			}
		}

		browser.scripting.executeScript({
			target: {
				tabId: tabId,
				allFrames: false
			},
			func: unfade,
			args: [className],
		});
	});
}
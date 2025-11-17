"use strict";

// for compatibility reasons
var browser = chrome;

// settings
var countryCode = ''; // e.g. German: "DE", USA: "US"
var providerId = 0; // e.g. Netflix: 8, Amazon Prime Video: 9
var filterStatus = false;

// fetch options
var fetchOptions = {};

// cache
var providers = {};
var countries = {};

var availableMovies = {};
var crawledMovies = {};
var unsolvedRequests = {};

// contains the number of already checked movies per tab
var checkCounter = {};

var reloadActive = {};


/////////////////////////////////////////////////////////////////////////////////////
///////////////////////// STARTUP AND SETTINGS //////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

/**
 * Loads all information from JSON files for intern computations.
 * Requests the available countries and providers from TMDB.
 * Also loads the current settings.
 *
 * @returns {Promise<void>} - An empty Promise if the loadings worked correctly, else the Promise contains the respective errors.
 */
const onStartUp = async () => {
	// load TMDb token and set fetch options
	await loadJson("settings/api.json", function (json) {
		setFetchOptions(json.tmdb);

		// persist for later service worker cycles
		browser.storage.session.set({tmdb_token: json.tmdb});
	});

	// load stored settings from localStorage
	browser.storage.local.get(parseSettings);

	await requestRegions();

	await requestProviderList();

	async function requestRegions() {
		let url = "https://api.themoviedb.org/3/watch/providers/regions";
		let response = await fetch(url, fetchOptions);
		if (response.status == 200)	{
			let rsp =  await response.json();
			let str = ""
			for(const entry of rsp.results) {
				countries[entry.iso_3166_1] = {
					'code': entry.iso_3166_1,
					'name': entry.english_name
				};
				str += entry.english_name + ", "
			}

		console.log(str);
		}

		// persist for later service worker cycles
		browser.storage.session.set({countries: countries});
	}

	async function requestProviderList() {
		let url = "https://api.themoviedb.org/3/watch/providers/movie?language=en-US";
		let response = await fetch(url, fetchOptions);
		if (response.status == 200) {
			let rsp =  await response.json();
			for(const entry of rsp.results) {
				providers[entry.provider_id] = {
					'provider_id': entry.provider_id,
					'name': entry.provider_name.trim(),
					'display_priority': entry.display_priority,
					'countries': Object.keys(entry.display_priorities)
				};
			}
		}

		// persist for later service worker cycles
		browser.storage.session.set({providers: providers});
	}
};

function parseSettings(items) {
	let countryCodeSet = false;
	let providerSet = false;
	let statusSet = false;

	if (items.hasOwnProperty('country_code')) {
		countryCodeSet = true;
		countryCode = items.country_code;
	}
	if (items.hasOwnProperty('provider_id')) {
		providerSet = true;
		providerId = items.provider_id;
	}
	if (items.hasOwnProperty('filter_status')) {
		statusSet = true;
		filterStatus = items.filter_status;
	}

	if ((!countryCodeSet) || (!providerSet) || (!statusSet)) {
		loadDefaultSettings(countryCodeSet, providerSet, statusSet);
	}
}

function loadDefaultSettings(countryCodeSet, providerSet, statusSet) {
	// load default settings
	loadJson("settings/default.json", function (json) {
		// set the intern settings
		if (!countryCodeSet && json.hasOwnProperty('country_code')) {
			countryCode = json.country_code;
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
	let tmdbToken = items.hasOwnProperty('tmdb_token') ? items.tmdb_token : '';
	setFetchOptions(tmdbToken);

	checkCounter = items.hasOwnProperty('check_counter') ? items.check_counter : {};

	reloadActive = items.hasOwnProperty('reload_active') ? items.reload_active : {};
}

/////////////////////////////////////////////////////////////////////////////////////
/////////////////////////// EVENT LISTENER //////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

browser.runtime.onInstalled.addListener(() => onStartUp());
browser.runtime.onStartup.addListener(() => onStartUp());

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	// load stored settings from localStorage
	browser.storage.local.get((items) => {
		parseSettings(items);
		// load cached variables from sessionStorage
		browser.storage.session.get((items) => {
			parseCache(items);
			handleMessage(request, sender);
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
			// decrease the counter by the number of unsolved requests
			// we will try to solve them now
			checkCounter[tabId] = checkCounter[tabId] - Object.keys(unsolvedRequests[tabId]).length;
			unsolvedRequests[tabId] = {};

			// persist for later service worker cycles
			browser.storage.session.set({
				check_counter: checkCounter,
				unsolved_requests: unsolvedRequests
			});

			checkMovieAvailability(tabId, movies);
		});
	});
});

/////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////// RELOAD ///////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

/**
 * Called to force the filters to reload with the new provider ID.
 */
 function reloadMovieFilter() {
	browser.tabs.query({}, reloadFilterInTab);

	function reloadFilterInTab(tabs) {
		for (const tab of tabs) {
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

/////////////////////////////////////////////////////////////////////////////////////
/////////////////////////// MOVIE AVAILABILITY //////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

/**
 * Called from within the listener for new messages from the content script.
 * Triggers check for movie availability or re-initiates the whole process if no movies received.
 *
 * @param {{messageType: string, messageContent: object}} request - The message from the content script.
 * @param {object} sender - The sender from the runtime.onMessage event.
 */
 function handleMessage(request, sender) {
	var tabId;
	if (sender.hasOwnProperty('tab') && sender.tab.hasOwnProperty('id')) {
		tabId = sender.tab.id;
	} else {
		console.log("Error: missing tab ID");
	}
	if (request.hasOwnProperty('messageType') && request.hasOwnProperty('messageContent')) {
		if (request.messageType === 'movie-titles') {
			crawledMovies[tabId] = request.messageContent;

			// persist for later service worker cycles
			browser.storage.session.set({crawled_movies: crawledMovies});

			if (Object.keys(crawledMovies[tabId]).length === 0) {
				// we don't got any movies yet, let's try again
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
		for (const movie in movies) {
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
 * Checks if a movie is available and adds it to availableMovies[tabId].
 *
 * @param {object} toFind - An object, which contains the movie title, the release year and the Letterboxd-intern array id.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @returns {Promise<void>} - An empty Promise if the API calls worked correctly, else the Promise contains the respective errors.
 */
 async function isIncluded(tabId, toFind) {
	let englishTitle = toFind.title;
	let releaseYear = toFind.year;
	let letterboxdId = toFind.id;
	let titleSanitized = encodeURIComponent(englishTitle);

	let url = `https://api.themoviedb.org/3/search/multi?query=${titleSanitized}`;
	let response = await fetch(url, fetchOptions);

	if (response.status != 200) {
		// something went wrong during the request

		// if there are too many requests: try again later
		if (response.status == 429) {
			unsolvedRequests[tabId][englishTitle] = {
				year: releaseYear,
				id: letterboxdId
			};
			
			// persist for later service worker cycles
			browser.storage.session.set({unsolved_requests: unsolvedRequests});
		}

		increaseCheckCounter(tabId);
		return;
	}

	let rsp =  await response.json();
	let tmdbInfo = getIdWithReleaseYear(rsp.results, englishTitle, releaseYear);

	if (!tmdbInfo.matchFound) {
		// this time we are unlucky and don't find any match
		increaseCheckCounter(tabId);
		return;
	}

	// we have found what we are looking for
	// now check the provider availability
	url = `https://api.themoviedb.org/3/${tmdbInfo.mediaType}/${tmdbInfo.tmdbId}/watch/providers`;
	response = await fetch(url, fetchOptions);
	if (response.status != 200) {
		// something went wrong during the request

		// if there are too many requests: try again later
		if (response.status == 429) {
			unsolvedRequests[tabId][englishTitle] = {
				year: releaseYear,
				id: letterboxdId
			};
			
			// persist for later service worker cycles
			browser.storage.session.set({unsolved_requests: unsolvedRequests});
		}

		increaseCheckCounter(tabId);
		return;
	}
	
	rsp =  await response.json();
	addMovieIfFlatrate(rsp.results, tabId, letterboxdId);
	increaseCheckCounter(tabId);
}

 /**
 * Returns the TMDb ID for a given English media title and a corresponding release year.
 * If no exact match is found (i.e., title and release year do not match exactly),
 * this function tries to find a match with best effort: 
 * maybe the release year differs by 1 or is missing completely.
 *
 * @param {object} results - The results from the TMDB "Multi" request.
 * @param {string} titleEnglish - The English movie title.
 * @param {int} releaseYear - The media's release year.
 * @returns {{tmdbId: int, mediaType: string, matchFound: boolean}} - An object containing the TMDB movie ID, the media type and if this was a perfect match (titleEnglish and movie_release_year match up).
 */
function getIdWithReleaseYear(results, titleEnglish, releaseYear) {
	let candidate = {
		tmdbId: -1,
		mediaType: '',
		matchFound: false
	};

	for (let item in results) {
		if (!results[item].hasOwnProperty('media_type'))
			continue;

		let itemTitle = '';
		let itemReleaseDate = '';
		if (results[item].media_type == 'movie') {
			if (!results[item].hasOwnProperty('release_date') || !results[item].hasOwnProperty('title'))
				continue;

			itemTitle = results[item].title;
			itemReleaseDate = results[item].release_date;
		} else if (results[item].media_type == 'tv') {
			if (!results[item].hasOwnProperty('first_air_date') || !results[item].hasOwnProperty('name'))
				continue;

			itemTitle = results[item].name;
			itemReleaseDate = results[item].first_air_date;
		} else {
			continue;
		}

		let itemReleaseYear = new Date(itemReleaseDate).getFullYear();

		if (itemTitle.toLowerCase() == titleEnglish.toLowerCase()) {
			if (itemReleaseYear == releaseYear) {
				return {
					tmdbId: results[item].id,
					mediaType: results[item].media_type,
					matchFound: true
				};
			} else if (releaseYear == -1 || 
					   itemReleaseYear == releaseYear - 1 || 
					   itemReleaseYear == releaseYear + 1) {
				candidate = {
					tmdbId: results[item].id,
					mediaType: results[item].media_type,
					matchFound: true
				};
			}
		}
	}

	return candidate;
}

 /**
 * Adds the given letterboxd ID to the availableMovies 
 * if the selected provider includes the movie in its flatrate
 * 
 * @param {object} results - The results from the TMDB "Watch Providers" request.
 * @param {string} tabId - The tabId to operate in.
 * @param {int} letterboxdId - The intern ID from the array in letterboxd.com.
  */
function addMovieIfFlatrate(results, tabId, letterboxdId) {
	if (!(countryCode in results) || !results[countryCode].hasOwnProperty('flatrate')) {
		return;
	} 

	for (const offer of results[countryCode].flatrate) {
		if (!offer.hasOwnProperty('provider_id')) {
			continue;
		}

		if (offer.provider_id == providerId) {
			availableMovies[tabId].push(...letterboxdId);
			return;
		}
	}
}

/////////////////////////////////////////////////////////////////////////////////////
//////////////////////// GET MOVIES FROM LETTERBOXD /////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

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

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////////// FADING ////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

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
	var className = 'griditem';

	function fadeOut(className, movieId) {
		filmposters = document.body.getElementsByClassName(className);
		filmposters[movieId].className += ' film-not-streamed';
	}

	for (const movie in movies) {
		for (const movie_id of movies[movie].id) {
			if (!availableMovies[tabId].includes(movie_id)) {
				browser.scripting.executeScript({
					target: {
						tabId: tabId,
						allFrames: false
					},
					func: fadeOut,
					args: [className, movie_id],
				});
			}
		}
	}

	// if there are unsolved requests left: solve them
	if (Object.keys(unsolvedRequests[tabId]).length != 0) {
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

		var className = 'griditem';

		function unfade(className) {
			filmposters = document.body.getElementsByClassName(className);
			for(const poster in filmposters) {
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

/////////////////////////////////////////////////////////////////////////////////////
//////////////////////////// HELPERS ////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

/**
 * Returns the API access token for TMDb.
 *
 * @returns {string} - The API access token.
 */
function getApiToken() {
	return tmdbToken;
}

/**
 * Called to load a JSON file.
 *
 * @param {string} path - The path to the JSON file.
 * @param {function} callback - A callback function, which is called after loading the file successfully.
 */
 const loadJson = async (path, callback) => {
	let response = await fetch(path);

	if (response.status == 200) {
		callback(await response.json());
	}
};

function increaseCheckCounter(tabId) {
	checkCounter[tabId]++;

	// persist for later service worker cycles
	browser.storage.session.set({check_counter: checkCounter});

	if (checkCounter[tabId] == Object.keys(crawledMovies[tabId]).length) {
		fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
	}
}

function setFetchOptions(token) {
	fetchOptions = {
		method: 'GET',
		headers: {
			"Authorization": "Bearer " + token,
			"Accept": "application/json"
		}
	}
}

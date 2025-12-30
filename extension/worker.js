"use strict";

// for compatibility reasons
const browser = chrome;

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////// CONSTANTS /////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

const LETTERBOXD_PATTERNS = ['://letterboxd.com/', '://www.letterboxd.com/'];
const SUPPORTED_PAGES = ['/watchlist/', '/films/', '/likes/', '/list/'];
const CSS_CLASSES = {
	GRID_ITEM: 'griditem',
	POSTER_ITEM: 'posteritem',
	NOT_STREAMED: 'film-not-streamed'
};

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////// STATE MANAGEMENT //////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

// settings
let countryCode = ''; // e.g. German: "DE", USA: "US"
let providerId = 0; // e.g. Netflix: 8, Amazon Prime Video: 9
let filterStatus = false;

// fetch options
let fetchOptions = {};

// cache
let providers = {};
let countries = {};
let availableMovies = {};
let crawledMovies = {};
let unsolvedRequests = {};

// contains the number of already checked movies per tab
let checkCounter = {};

let settingsLoaded = false;
let cacheLoaded = false;

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
	const apiConfig = await loadJson("settings/api.json");
	if (apiConfig?.tmdb) {
		setFetchOptions(apiConfig.tmdb);
		// persist for later service worker cycles
		browser.storage.session.set({ tmdb_token: apiConfig.tmdb });
	}

	// load stored settings from localStorage
	const localItems = await browser.storage.local.get();
	await parseSettings(localItems);

	await Promise.all([requestRegions(), requestProviderList()]);
};

/**
 * Fetches available regions from TMDB API.
 */
async function requestRegions() {
	const url = "https://api.themoviedb.org/3/watch/providers/regions";

	try {
		const response = await fetch(url, fetchOptions);
		if (response.status !== 200) {
			return;
		}

		const rsp = await response.json();
		for (const entry of rsp.results) {
			countries[entry.iso_3166_1] = {
				code: entry.iso_3166_1,
				name: entry.english_name
			};
		}

		// persist for later service worker cycles
		browser.storage.session.set({ countries });
	} catch (error) {
		console.error("Failed to fetch regions:", error);
	}
}

/**
 * Fetches available streaming providers from TMDB API.
 */
async function requestProviderList() {
	const url = "https://api.themoviedb.org/3/watch/providers/movie?language=en-US";

	try {
		const response = await fetch(url, fetchOptions);
		if (response.status !== 200) {
			return;
		}

		const rsp = await response.json();
		for (const entry of rsp.results) {
			providers[entry.provider_id] = {
				provider_id: entry.provider_id,
				name: entry.provider_name.trim(),
				display_priority: entry.display_priority,
				countries: Object.keys(entry.display_priorities)
			};
		}

		// persist for later service worker cycles
		browser.storage.session.set({ providers });
	} catch (error) {
		console.error("Failed to fetch provider list:", error);
	}
}

/**
 * Parses settings from storage items.
 *
 * @param {object} items - Storage items containing settings.
 */
async function parseSettings(items) {
	const hasCountryCode = 'country_code' in items;
	const hasProvider = 'provider_id' in items;
	const hasStatus = 'filter_status' in items;

	if (hasCountryCode) {
		countryCode = items.country_code;
	}
	if (hasProvider) {
		providerId = items.provider_id;
	}
	if (hasStatus) {
		filterStatus = items.filter_status;
	}

	if (!hasCountryCode || !hasProvider || !hasStatus) {
		await loadDefaultSettings(!hasCountryCode, !hasProvider, !hasStatus);
	}

	settingsLoaded = true;
}

/**
 * Loads default settings from JSON file.
 *
 * @param {boolean} needCountryCode - Whether to load default country code.
 * @param {boolean} needProvider - Whether to load default provider.
 * @param {boolean} needStatus - Whether to load default filter status.
 */
async function loadDefaultSettings(needCountryCode, needProvider, needStatus) {
	const json = await loadJson("settings/default.json");
	if (!json) {
		return;
	}

	const toStore = {};

	if (needCountryCode && 'country_code' in json) {
		countryCode = json.country_code;
		toStore.country_code = countryCode;
	}
	if (needProvider && 'provider_id' in json) {
		providerId = json.provider_id;
		toStore.provider_id = providerId;
	}
	if (needStatus && 'filter_status' in json) {
		filterStatus = json.filter_status;
		toStore.filter_status = filterStatus;
	}

	if (Object.keys(toStore).length > 0) {
		browser.storage.local.set(toStore);
	}
}

/**
 * Parses cached data from session storage.
 *
 * @param {object} items - Session storage items.
 */
async function parseCache(items) {
	providers = items.providers ?? {};
	countries = items.countries ?? {};

	// If session storage was cleared, refetch from API
	const apiCalls = [];
	if (Object.keys(providers).length === 0) {
		apiCalls.push(requestProviderList());
	}
	if (Object.keys(countries).length === 0) {
		apiCalls.push(requestRegions());
	}
	if (apiCalls.length > 0) {
		await Promise.all(apiCalls);
	}

	availableMovies = items.available_movies ?? {};
	crawledMovies = items.crawled_movies ?? {};
	unsolvedRequests = items.unsolved_requests ?? {};
	checkCounter = items.check_counter ?? {};

	const tmdbToken = items.tmdb_token ?? '';
	setFetchOptions(tmdbToken);

	cacheLoaded = true;
}

/**
 * Loads settings and cache if not already loaded, then executes the callback function.
 *
 * @param {function} callback - The function to execute after settings and cache are loaded.
 */
async function loadSettingsAndExecute(callback) {
	if (!settingsLoaded || !cacheLoaded) {
		const [localItems, sessionItems] = await Promise.all([
			browser.storage.local.get(),
			browser.storage.session.get()
		]);
		await parseSettings(localItems);
		await parseCache(sessionItems);
	}
	callback();
}

/////////////////////////////////////////////////////////////////////////////////////
/////////////////////////// EVENT LISTENER //////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

browser.runtime.onInstalled.addListener(() => onStartUp());
browser.runtime.onStartup.addListener(() => onStartUp());

browser.runtime.onMessage.addListener((request, sender, _) => {
	loadSettingsAndExecute(() => handleMessage(request, sender));
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tabInfo) => {
	// Use status from changeInfo as tabInfo.status may not be updated yet when the event fires
	if (!isProcessableLetterboxdTab({ ...tabInfo, status: changeInfo?.status })) {
		return;
	}

	loadSettingsAndExecute(() => processLetterboxdTab(tabId));
});

browser.storage.local.onChanged.addListener(_ => {
	settingsLoaded = false;
	loadSettingsAndExecute(() => reloadMovieFilter());
});

browser.alarms.onAlarm.addListener(alarm => {
	if (alarm.name !== "handleUnsolvedRequests") {
		return;
	}
	loadSettingsAndExecute(() => handleUnsolvedRequests());
});

/////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////// RELOAD ///////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

/**
 * Called to force the filters to reload with the new provider ID.
 */
async function reloadMovieFilter() {
	const tabs = await browser.tabs.query({}) ?? [];

	for (const tab of tabs) {
		if (!isProcessableLetterboxdTab(tab)) {
			continue;
		}

		const tabId = tab.id;
		await unfadeAllMovies(tabId);
		processLetterboxdTab(tabId);
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
	const tabId = sender?.tab?.id;
	if (!tabId) {
		console.error("Error: missing tab ID");
		return;
	}

	if (request?.messageType !== 'movie-titles' || !request?.messageContent) {
		return;
	}

	crawledMovies[tabId] = request.messageContent;
	browser.storage.session.set({ crawled_movies: crawledMovies });

	if (Object.keys(crawledMovies[tabId]).length === 0) {
		// we don't got any movies yet, let's try again
		getFilmsFromLetterboxd(tabId);
	} else {
		checkMovieAvailability(tabId, crawledMovies[tabId]);
	}
}

/**
 * Calls the method for checking the movie availability for each movie in movies.
 *
 * @param {number} tabId - The tabId to operate in.
 * @param {object} movies - The crawled movies from Letterboxed.
 */
function checkMovieAvailability(tabId, movies) {
	if (!filterStatus) {
		return;
	}

	prepareLetterboxdForFading(tabId);

	for (const movie in movies) {
		isIncluded(tabId, {
			title: movie,
			year: movies[movie].year,
			id: movies[movie].id
		});
	}
}

/**
 * Checks if a movie is available and adds it to availableMovies[tabId].
 *
 * @param {number} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @param {object} toFind - An object containing the movie title, release year and Letterboxd-intern array id.
 * @returns {Promise<void>} - An empty Promise if the API calls worked correctly.
 */
async function isIncluded(tabId, toFind) {
	const { title: englishTitle, year: releaseYear, id: letterboxdId } = toFind;
	const titleSanitized = encodeURIComponent(englishTitle);

	// Search for the movie
	const searchUrl = `https://api.themoviedb.org/3/search/multi?query=${titleSanitized}`;
	const searchResponse = await fetch(searchUrl, fetchOptions);

	if (searchResponse.status !== 200) {
		handleRateLimitError(searchResponse.status, tabId, englishTitle, releaseYear, letterboxdId);
		increaseCheckCounter(tabId);
		return;
	}

	const searchData = await searchResponse.json();
	const tmdbInfo = getIdWithReleaseYear(searchData.results, englishTitle, releaseYear);

	if (!tmdbInfo.matchFound) {
		// this time we are unlucky and don't find any match
		increaseCheckCounter(tabId);
		return;
	}

	// Check provider availability
	const providerUrl = `https://api.themoviedb.org/3/${tmdbInfo.mediaType}/${tmdbInfo.tmdbId}/watch/providers`;
	const providerResponse = await fetch(providerUrl, fetchOptions);

	if (providerResponse.status !== 200) {
		handleRateLimitError(providerResponse.status, tabId, englishTitle, releaseYear, letterboxdId);
		increaseCheckCounter(tabId);
		return;
	}

	const providerData = await providerResponse.json();
	addMovieIfFlatrate(providerData.results, tabId, letterboxdId);
	increaseCheckCounter(tabId);
}

/**
 * Handles rate limit errors by storing the request for later retry.
 *
 * @param {number} status - HTTP status code.
 * @param {number} tabId - The tab ID.
 * @param {string} title - Movie title.
 * @param {number} year - Release year.
 * @param {Array} id - Letterboxd IDs.
 */
function handleRateLimitError(status, tabId, title, year, id) {
	if (status !== 429) {
		return;
	}

	unsolvedRequests[tabId][title] = { year, id };
	browser.storage.session.set({ unsolved_requests: unsolvedRequests });
}

/**
 * Returns the TMDb ID for a given English media title and a corresponding release year.
 * If no exact match is found (i.e., title and release year do not match exactly),
 * this function tries to find a match with best effort:
 * maybe the release year differs by 1 or is missing completely.
 *
 * @param {object[]} results - The results from the TMDB "Multi" request.
 * @param {string} titleEnglish - The English movie title.
 * @param {number} releaseYear - The media's release year.
 * @returns {{tmdbId: number, mediaType: string, matchFound: boolean}} - TMDb info object.
 */
function getIdWithReleaseYear(results, titleEnglish, releaseYear) {
	let candidate = { tmdbId: -1, mediaType: '', matchFound: false };
	const titleLower = titleEnglish.toLowerCase();

	for (const item of results) {
		const mediaType = item.media_type;
		if (!mediaType) {
			continue;
		}

		const { itemTitle, itemReleaseDate } = extractMediaInfo(item, mediaType);
		if (!itemTitle || !itemReleaseDate) {
			continue;
		}

		const itemReleaseYear = new Date(itemReleaseDate).getFullYear();

		if (itemTitle.toLowerCase() !== titleLower) {
			continue;
		}

		// Exact match - return immediately
		if (itemReleaseYear === releaseYear) {
			return { tmdbId: item.id, mediaType, matchFound: true };
		}

		// Fuzzy match - store as candidate
		if (releaseYear === -1 || Math.abs(itemReleaseYear - releaseYear) === 1) {
			candidate = { tmdbId: item.id, mediaType, matchFound: true };
		}
	}

	return candidate;
}

/**
 * Extracts title and release date from a TMDB result item.
 *
 * @param {object} item - TMDB result item.
 * @param {string} mediaType - Type of media ('movie' or 'tv').
 * @returns {{itemTitle: string|null, itemReleaseDate: string|null}} - Extracted info.
 */
function extractMediaInfo(item, mediaType) {
	if (mediaType === 'movie' && item.release_date && item.title) {
		return { itemTitle: item.title, itemReleaseDate: item.release_date };
	}
	if (mediaType === 'tv' && item.first_air_date && item.name) {
		return { itemTitle: item.name, itemReleaseDate: item.first_air_date };
	}
	return { itemTitle: null, itemReleaseDate: null };
}

/**
 * Adds the given letterboxd ID to the availableMovies
 * if the selected provider includes the movie in its flatrate.
 *
 * @param {object} results - The results from the TMDB "Watch Providers" request.
 * @param {number} tabId - The tabId to operate in.
 * @param {Array} letterboxdId - The intern ID from the array in letterboxd.com.
 */
function addMovieIfFlatrate(results, tabId, letterboxdId) {
	const countryData = results[countryCode];
	if (!countryData) {
		return;
	}

	const offersToCheck = [
		...(countryData.flatrate ?? []),
		...(countryData.free ?? [])
	];

	const hasProvider = offersToCheck.some(offer =>
		offer.provider_id && offer.provider_id === providerId
	);

	if (hasProvider) {
		availableMovies[tabId].push(...letterboxdId);
	}
}

/**
 * Handles unsolved requests by re-attempting to check their availability.
 */
async function handleUnsolvedRequests() {
	for (const tabId in unsolvedRequests) {
		const tabRequests = unsolvedRequests[tabId];
		if (!tabRequests || Object.keys(tabRequests).length === 0) {
			continue;
		}

		// Check if tab is still valid and processable
		let isValidTab = false;
		try {
			const tab = await browser.tabs.get(Number(tabId));
			isValidTab = isProcessableLetterboxdTab(tab);
		} catch (e) {
			// Tab no longer exists
		}

		if (!isValidTab) {
			// Tab is no longer valid, clean up its unsolved requests
			delete unsolvedRequests[tabId];
			browser.storage.session.set({ unsolved_requests: unsolvedRequests });
			continue;
		}

		const movies = { ...tabRequests };
		const requestCount = Object.keys(tabRequests).length;

		// Decrease the counter by the number of unsolved requests
		// We will try to solve them now
		checkCounter[tabId] = (checkCounter[tabId] || 0) - requestCount;
		unsolvedRequests[tabId] = {};

		// Persist for later service worker cycles
		browser.storage.session.set({
			check_counter: checkCounter,
			unsolved_requests: unsolvedRequests
		});

		checkMovieAvailability(tabId, movies);
	}
}

/////////////////////////////////////////////////////////////////////////////////////
//////////////////////// GET MOVIES FROM LETTERBOXD /////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

/**
 * Checks if a URL matches Letterboxd patterns.
 *
 * @param {string} url - URL to check.
 * @returns {boolean} - True if URL is a Letterboxd URL.
 */
function isLetterboxdUrl(url) {
	return url && LETTERBOXD_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * Checks if a URL is a supported Letterboxd page type.
 *
 * @param {string} url - URL to check.
 * @returns {boolean} - True if URL is a supported page.
 */
function isSupportedLetterboxdPage(url) {
	return url && SUPPORTED_PAGES.some(page => url.includes(page));
}

/**
 * Checks if a tab is ready to be processed (loaded, not discarded, and is a supported Letterboxd page).
 *
 * @param {object} tab - The tab object with url, status, and discarded properties.
 * @returns {boolean} - True if the tab can be processed.
 */
function isProcessableLetterboxdTab(tab) {
	if (tab.discarded || tab.status !== 'complete') {
		return false;
	}
	return isLetterboxdUrl(tab.url) && isSupportedLetterboxdPage(tab.url);
}

/**
 * Starts processing a Letterboxd tab by initializing state and crawling films.
 *
 * @param {number} tabId - The tabId to operate in.
 */
async function processLetterboxdTab(tabId) {
	if (!filterStatus) {
		return;
	}

	await initializeTabState(tabId);
	getFilmsFromLetterboxd(tabId);
}

/**
 * Initializes state for a tab.
 *
 * @param {number} tabId - The tab ID.
 */
async function initializeTabState(tabId) {
	checkCounter[tabId] = 0;
	availableMovies[tabId] = [];
	crawledMovies[tabId] = {};
	unsolvedRequests[tabId] = {};

	// Persist for later service worker cycles
	await browser.storage.session.set({
		check_counter: checkCounter,
		available_movies: availableMovies,
		crawled_movies: crawledMovies,
		unsolved_requests: unsolvedRequests,
	});
}

/**
 * Injects a content script into the Letterboxd web page to crawl the movie titles and release years.
 *
 * @param {number} tabId - The tabId to operate in.
 */
async function getFilmsFromLetterboxd(tabId) {
	await browser.scripting.executeScript({
		target: { tabId, allFrames: true },
		files: ["./scripts/getFilmsFromLetterboxd.js"]
	});
}

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////////// FADING ////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

/**
 * Inserts CSS and a corresponding content script in Letterboxd to add a new class and its style sheets.
 *
 * @param {number} tabId - The tabId to operate in.
 */
async function prepareLetterboxdForFading(tabId) {
	await browser.scripting.insertCSS({
		files: ["./style/hideunstreamed.css"],
		target: { tabId, allFrames: false },
	});

	browser.scripting.executeScript({
		target: { tabId, allFrames: false },
		files: ["./scripts/prepareLetterboxdForFading.js"]
	});
}

/**
 * Fades out movies that are not available on the selected streaming provider.
 *
 * @param {number} tabId - The tabId to operate in.
 * @param {object} movies - The crawled movies.
 */
function fadeUnstreamableMovies(tabId, movies) {
	// Collect all movie IDs that need to be faded
	const idsToFade = [];
	for (const movie in movies) {
		for (const movieId of movies[movie].id) {
			if (!availableMovies[tabId].includes(movieId)) {
				idsToFade.push(movieId);
			}
		}
	}

	// Batch fade all movies in a single script injection
	if (idsToFade.length > 0) {
		browser.scripting.executeScript({
			target: { tabId, allFrames: false },
			func: fadeOutMovies,
			args: [CSS_CLASSES.GRID_ITEM, CSS_CLASSES.POSTER_ITEM, CSS_CLASSES.NOT_STREAMED, idsToFade],
		});
	}

	// Handle unsolved requests
	if (Object.keys(unsolvedRequests[tabId] ?? {}).length > 0) {
		browser.alarms.create("handleUnsolvedRequests", { delayInMinutes: 0.5 });
	}
}

/**
 * Content script function to fade out multiple movies.
 * Injected into the page context.
 *
 * @param {string} className - Primary class name to search.
 * @param {string} fallbackClassName - Fallback class name.
 * @param {string} fadeClass - Class to add for fading.
 * @param {number[]} movieIds - Array of movie indices to fade.
 */
function fadeOutMovies(className, fallbackClassName, fadeClass, movieIds) {
	let filmposters = document.body.getElementsByClassName(className);
	if (filmposters.length === 0) {
		filmposters = document.body.getElementsByClassName(fallbackClassName);
	}

	for (const movieId of movieIds) {
		if (filmposters[movieId]) {
			filmposters[movieId].classList.add(fadeClass);
		}
	}
}

/**
 * Unfades all movies on Letterboxd.
 *
 * @param {number} tabId - The tabId to operate in.
 */
async function unfadeAllMovies(tabId) {
	await browser.scripting.executeScript({
		target: { tabId, allFrames: false },
		func: unfadeMovies,
		args: [CSS_CLASSES.GRID_ITEM, CSS_CLASSES.POSTER_ITEM, CSS_CLASSES.NOT_STREAMED],
	});
}

/**
 * Content script function to unfade all movies.
 * Injected into the page context.
 *
 * @param {string} className - Primary class name to search.
 * @param {string} fallbackClassName - Fallback class name.
 * @param {string} fadeClass - Class to remove.
 */
function unfadeMovies(className, fallbackClassName, fadeClass) {
	let filmposters = document.body.getElementsByClassName(className);
	if (filmposters.length === 0) {
		filmposters = document.body.getElementsByClassName(fallbackClassName);
	}

	for (const poster of filmposters) {
		poster.classList.remove(fadeClass);
	}
}

/////////////////////////////////////////////////////////////////////////////////////
//////////////////////////// HELPERS ////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

/**
 * Loads a JSON file.
 *
 * @param {string} path - The path to the JSON file.
 * @returns {Promise<object|null>} - The parsed JSON object, or null if loading failed.
 */
async function loadJson(path) {
	try {
		const response = await fetch(path);
		if (response.status === 200) {
			return await response.json();
		}
	} catch (error) {
		console.error(`Failed to load JSON from ${path}:`, error);
	}
	return null;
}

/**
 * Increases the check counter for a tab and triggers fading when all movies are checked.
 *
 * @param {number} tabId - The tab ID.
 */
function increaseCheckCounter(tabId) {
	checkCounter[tabId]++;
	browser.storage.session.set({ check_counter: checkCounter });

	const totalMovies = Object.keys(crawledMovies[tabId] ?? {}).length;
	if (checkCounter[tabId] === totalMovies) {
		fadeUnstreamableMovies(tabId, crawledMovies[tabId]);
	}
}

/**
 * Sets fetch options with the given API token.
 *
 * @param {string} token - The TMDB API token.
 */
function setFetchOptions(token) {
	fetchOptions = {
		method: 'GET',
		headers: {
			"Authorization": `Bearer ${token}`,
			"Accept": "application/json"
		}
	};
}

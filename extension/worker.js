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
const MAX_CRAWL_RETRIES = 3;

// persistent TMDb lookup cache, survives browser restarts
const TMDB_CACHE_STORAGE_KEY = 'tmdb_provider_cache';

// keep matches short-lived since there's no way to force-refresh a stale answer
const TMDB_CACHE_TTL_MATCH_FOUND_MS = 6 * 60 * 60 * 1000;
// misses expire sooner since a title can get indexed on TMDb shortly after being added
const TMDB_CACHE_TTL_NO_MATCH_MS = 60 * 60 * 1000;

// bounds storage.local usage without requesting the unlimitedStorage permission
const TMDB_CACHE_MAX_ENTRIES = 800;
// prune target when the cap is hit, so pruning doesn't re-run on almost every write
const TMDB_CACHE_PRUNE_TARGET = 700;

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
let crawlRetryCount = {};

// title+year -> resolved id/media type + per-country flatrate/free provider IDs
let tmdbCache = {};
// true between a cache mutation and the next flushTmdbCache write
let tmdbCacheDirty = false;

let settingsLoaded = false;
let cacheLoaded = false;
let tmdbCacheLoaded = false;

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
	await loadTmdbToken();

	// load stored settings from localStorage
	const localItems = await browser.storage.local.get();
	await parseSettings(localItems);
	parseTmdbCache(localItems);

	await Promise.all([requestRegions(), requestProviderList()]);
};

/**
 * Fetches available regions from TMDB API.
 */
async function requestRegions() {
	const url = "https://api.themoviedb.org/3/watch/providers/regions";

	const response = await safeFetchJson(url, fetchOptions, "TMDB regions request");
	if (response?.json == null) {
		return;
	}

	for (const entry of response.json.results) {
		countries[entry.iso_3166_1] = {
			code: entry.iso_3166_1,
			name: entry.english_name
		};
	}

	// persist for later service worker cycles
	browser.storage.session.set({ countries });
}

/**
 * Fetches available streaming providers from TMDB API.
 */
async function requestProviderList() {
	const url = "https://api.themoviedb.org/3/watch/providers/movie?language=en-US";

	const response = await safeFetchJson(url, fetchOptions, "TMDB providers request");
	if (response?.json == null) {
		return;
	}

	for (const entry of response.json.results) {
		providers[entry.provider_id] = {
			provider_id: entry.provider_id,
			name: entry.provider_name.trim(),
			display_priority: entry.display_priority,
			countries: Object.keys(entry.display_priorities)
		};
	}

	// persist for later service worker cycles
	browser.storage.session.set({ providers });
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
	const result = await safeFetchJson("settings/default.json", {}, "default settings");
	if (!result?.json) {
		return;
	}

	const toStore = {};

	if (needCountryCode && 'country_code' in result.json) {
		countryCode = result.json.country_code;
		toStore.country_code = countryCode;
	}
	if (needProvider && 'provider_id' in result.json) {
		providerId = result.json.provider_id;
		toStore.provider_id = providerId;
	}
	if (needStatus && 'filter_status' in result.json) {
		filterStatus = result.json.filter_status;
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

	await loadTmdbToken();

	cacheLoaded = true;
}

/**
 * Loads settings and cache if not already loaded, then executes the callback function.
 *
 * @param {function} callback - The function to execute after settings and cache are loaded.
 */
async function loadSettingsAndExecute(callback) {
	if (!settingsLoaded || !cacheLoaded || !tmdbCacheLoaded) {
		const [localItems, sessionItems] = await Promise.all([
			browser.storage.local.get(),
			browser.storage.session.get()
		]);
		await parseSettings(localItems);
		parseTmdbCache(localItems);
		await parseCache(sessionItems);
	}
	callback();
}

/**
 * Loads the persistent TMDb lookup cache from local storage, once per service worker lifetime.
 *
 * @param {object} items - Local storage items.
 */
function parseTmdbCache(items) {
	// only the worker writes this cache, so re-reading later would overwrite
	// in-memory entries added since the last flush with a stale snapshot
	if (tmdbCacheLoaded) {
		return;
	}

	tmdbCache = items[TMDB_CACHE_STORAGE_KEY] ?? {};
	tmdbCacheLoaded = true;
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

browser.storage.local.onChanged.addListener(changes => {
	// ignore our own TMDb cache writes so caching a lookup doesn't retrigger a full reload
	const changedKeys = Object.keys(changes ?? {});
	if (changedKeys.length > 0 && changedKeys.every(key => key === TMDB_CACHE_STORAGE_KEY)) {
		return;
	}

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
	if (typeof sender?.frameId === 'number' && sender.frameId !== 0) {
		return;
	}

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
		// we don't got any movies yet, let's try again if we haven't exceeded max retries
		crawlRetryCount[tabId] = (crawlRetryCount[tabId] ?? 0) + 1;
		if (crawlRetryCount[tabId] < MAX_CRAWL_RETRIES) {
			getFilmsFromLetterboxd(tabId);
		}
	} else {
		// Reset retry count on success
		crawlRetryCount[tabId] = 0;
		checkMovieAvailability(tabId, crawledMovies[tabId]);
	}
}

/**
 * Calls the method for checking the movie availability for each movie in movies.
 *
 * @param {number} tabId - The tabId to operate in.
 * @param {object} movies - The crawled movies from Letterboxed.
 */
async function checkMovieAvailability(tabId, movies) {
	if (!filterStatus) {
		return;
	}

	prepareLetterboxdForFading(tabId);

	const CONCURRENCY_LIMIT = 5;
	const entries = Object.entries(movies);
	for (let i = 0; i < entries.length; i += CONCURRENCY_LIMIT) {
		const batch = entries.slice(i, i + CONCURRENCY_LIMIT);
		await Promise.all(batch.map(([title, data]) =>
			checkMovieSafely(tabId, title, data.year, data.id)
		));

		// flush per batch, not per movie, to avoid rewriting the cache blob for every title
		flushTmdbCache();
	}

	fadeUnstreamableMovies(tabId, movies);
}

/**
 * Runs checkMovie and swallows any error, so one bad title doesn't abort the whole
 * Promise.all batch and skip fadeUnstreamableMovies for the rest.
 *
 * @param {number} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @param {string} title - The movie title.
 * @param {number} year - The release year.
 * @param {Array} letterboxdId - The Letterboxd-intern array id.
 * @returns {Promise<void>} - Always resolves.
 */
async function checkMovieSafely(tabId, title, year, letterboxdId) {
	try {
		await checkMovie(tabId, title, year, letterboxdId);
	} catch (error) {
		console.error(`Failed to check availability for '${title}' (${year}):`, error);
	}
}

/**
 * Checks if a movie is available and adds it to availableMovies[tabId].
 * Checks the persistent TMDb cache first, falling through to a TMDb fetch on a miss.
 *
 * @param {number} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @param {string} title - The movie title.
 * @param {number} year - The release year.
 * @param {Array} letterboxdId - The Letterboxd-intern array id.
 */
async function checkMovie(tabId, title, year, letterboxdId) {
	const cacheKey = buildTmdbCacheKey(title, year);
	const cachedEntry = getFreshTmdbCacheEntry(cacheKey);
	if (cachedEntry) {
		if (cachedEntry.matchFound) {
			addMovieIfProviderAvailable(cachedEntry.providerIds, tabId, letterboxdId);
		}
		// matchFound: false just means leave the movie out, same as an uncached miss
		return;
	}

	const titleSanitized = encodeURIComponent(title);

	// Search for the movie
	const searchUrl = `https://api.themoviedb.org/3/search/multi?query=${titleSanitized}`;
	const searchResult = await safeFetchJson(searchUrl, fetchOptions, `TMDB search for '${title}' (${year})`);
	if (searchResult?.json == null) {
		handleRateLimitError(searchResult?.status, tabId, title, year, letterboxdId);
		return;
	}
	const tmdbInfo = getIdWithReleaseYear(searchResult.json.results, title, year);

	if (!tmdbInfo.matchFound) {
		setTmdbCacheEntry(cacheKey, { tmdbId: -1, mediaType: '', matchFound: false, providerIds: {} });
		return;
	}

	// Check provider availability
	const providerUrl = `https://api.themoviedb.org/3/${tmdbInfo.mediaType}/${tmdbInfo.tmdbId}/watch/providers`;
	const providerResult = await safeFetchJson(providerUrl, fetchOptions, `TMDB providers for '${title}' (${year})`);
	if (providerResult?.json == null) {
		handleRateLimitError(providerResult?.status, tabId, title, year, letterboxdId);
		return;
	}

	const rawResults = providerResult.json.results;
	if (!rawResults || typeof rawResults !== 'object') {
		// don't cache a malformed payload, so it self-heals on the next lookup instead of sticking for a TTL
		console.error(`Unexpected TMDB watch/providers payload for '${title}' (${year})`);
		return;
	}

	// cache all per-country provider IDs, not a pre-filtered answer, so a country/provider switch is still free
	const providerIds = extractProviderIdsByCountry(rawResults);
	setTmdbCacheEntry(cacheKey, {
		tmdbId: tmdbInfo.tmdbId,
		mediaType: tmdbInfo.mediaType,
		matchFound: true,
		providerIds
	});
	addMovieIfProviderAvailable(providerIds, tabId, letterboxdId);
}

/**
 * Reduces a raw TMDb "Watch Providers" payload to `{[countryCode]: [providerId, ...]}`:
 * per country, the provider IDs offering the title on flatrate or for free. Countries with
 * neither are omitted.
 *
 * @param {object} results - The `results` object from the TMDB "Watch Providers" request.
 * @returns {object} - `{[countryCode]: [providerId, ...]}`.
 */
function extractProviderIdsByCountry(results) {
	const providerIdsByCountry = {};

	for (const [country, countryData] of Object.entries(results)) {
		const offers = [
			...(Array.isArray(countryData?.flatrate) ? countryData.flatrate : []),
			...(Array.isArray(countryData?.free) ? countryData.free : [])
		];

		const ids = [];
		for (const offer of offers) {
			if (offer?.provider_id && !ids.includes(offer.provider_id)) {
				ids.push(offer.provider_id);
			}
		}

		if (ids.length > 0) {
			providerIdsByCountry[country] = ids;
		}
	}

	return providerIdsByCountry;
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
 * Builds a stable TMDb cache key from a title and release year.
 *
 * @param {string} title - The movie title as scraped from Letterboxd.
 * @param {number} year - The release year, or -1 if unknown.
 * @returns {string} - The cache key.
 */
function buildTmdbCacheKey(title, year) {
	const normalizedTitle = title.trim().toLowerCase();
	const yearPart = year === -1 ? 'unknown-year' : String(year);
	return `${normalizedTitle}::${yearPart}`;
}

/**
 * Returns the cached TMDb lookup entry for the given key if present and not expired, else null.
 *
 * @param {string} cacheKey - The cache key from buildTmdbCacheKey.
 * @returns {{tmdbId: number, mediaType: string, matchFound: boolean, providerIds: object, cachedAt: number}|null} - The cached entry, or null.
 */
function getFreshTmdbCacheEntry(cacheKey) {
	const entry = tmdbCache[cacheKey];
	if (!entry) {
		return null;
	}

	// NaN cachedAt (corrupted entry) must not be treated as fresh forever
	const ttl = entry.matchFound ? TMDB_CACHE_TTL_MATCH_FOUND_MS : TMDB_CACHE_TTL_NO_MATCH_MS;
	if (!Number.isFinite(entry.cachedAt) || Date.now() - entry.cachedAt > ttl) {
		return null;
	}

	// a positive entry without its provider map is corrupted or an old format; treat as stale
	if (entry.matchFound && (!entry.providerIds || typeof entry.providerIds !== 'object')) {
		return null;
	}

	return entry;
}

/**
 * Stores a TMDb lookup result in the in-memory cache and prunes it if needed.
 * Not written to storage.local here; see flushTmdbCache.
 *
 * @param {string} cacheKey - The cache key from buildTmdbCacheKey.
 * @param {{tmdbId: number, mediaType: string, matchFound: boolean, providerIds: object}} entry - The result to cache.
 */
function setTmdbCacheEntry(cacheKey, entry) {
	tmdbCache[cacheKey] = { ...entry, cachedAt: Date.now() };
	pruneTmdbCacheIfNeeded();
	tmdbCacheDirty = true;
}

/**
 * Persists the in-memory TMDb cache to storage.local if it changed since the last flush.
 * Called from synchronous checkpoints rather than a timer, since an MV3 worker can be
 * killed before a deferred flush fires.
 */
function flushTmdbCache() {
	if (!tmdbCacheDirty) {
		return;
	}

	tmdbCacheDirty = false;
	browser.storage.local.set({ [TMDB_CACHE_STORAGE_KEY]: tmdbCache })
		.catch(error => console.error("Failed to persist TMDb lookup cache:", error));
}

/**
 * Prunes the oldest cache entries once the cache exceeds TMDB_CACHE_MAX_ENTRIES.
 */
function pruneTmdbCacheIfNeeded() {
	const keys = Object.keys(tmdbCache);
	if (keys.length <= TMDB_CACHE_MAX_ENTRIES) {
		return;
	}

	keys.sort((a, b) => (tmdbCache[a]?.cachedAt ?? 0) - (tmdbCache[b]?.cachedAt ?? 0));

	const removeCount = keys.length - TMDB_CACHE_PRUNE_TARGET;
	for (let i = 0; i < removeCount; i++) {
		delete tmdbCache[keys[i]];
	}
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

		// TMDb release dates are plain `YYYY-MM-DD` strings. `new Date(...)` would parse
		// them as UTC midnight but `getFullYear()` reads them back in the host machine's
		// local timezone, so e.g. "2021-01-01" yields 2020 anywhere west of UTC. Slicing
		// the year straight out of the string keeps matching timezone-independent.
		const itemReleaseYear = Number(itemReleaseDate.slice(0, 4));

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
 * Adds the given letterboxd ID to availableMovies if the selected provider offers
 * the movie in the selected country on flatrate or for free.
 *
 * @param {object} providerIdsByCountry - `{[countryCode]: [providerId, ...]}` from extractProviderIdsByCountry.
 * @param {number} tabId - The tabId to operate in.
 * @param {Array} letterboxdId - The intern ID from the array in letterboxd.com.
 */
function addMovieIfProviderAvailable(providerIdsByCountry, tabId, letterboxdId) {
	const countryProviderIds = providerIdsByCountry?.[countryCode];
	if (!Array.isArray(countryProviderIds) || !countryProviderIds.includes(providerId)) {
		return;
	}

	availableMovies[tabId].push(...letterboxdId);
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
			delete unsolvedRequests[tabId];
			browser.storage.session.set({ unsolved_requests: unsolvedRequests });
			continue;
		}

		// Clear unsolved requests for this tab before retrying
		const moviesToRetry = { ...tabRequests };
		unsolvedRequests[tabId] = {};
		browser.storage.session.set({ unsolved_requests: unsolvedRequests });

		// Retry all failed movies and wait for completion
		const retryPromises = Object.entries(moviesToRetry).map(([title, data]) =>
			checkMovieSafely(Number(tabId), title, data.year, data.id)
		);
		await Promise.all(retryPromises);

		// Persist whatever the retries resolved, in one write (see flushTmdbCache)
		flushTmdbCache();

		// Re-apply fading with updated availableMovies
		fadeUnstreamableMovies(Number(tabId), crawledMovies[tabId]);
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
	return Boolean(url) && LETTERBOXD_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * Checks if a URL is a supported Letterboxd page type.
 *
 * @param {string} url - URL to check.
 * @returns {boolean} - True if URL is a supported page.
 */
function isSupportedLetterboxdPage(url) {
	return Boolean(url) && SUPPORTED_PAGES.some(page => url.includes(page));
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
	availableMovies[tabId] = [];
	crawledMovies[tabId] = {};
	unsolvedRequests[tabId] = {};
	crawlRetryCount[tabId] = 0;

	// Persist for later service worker cycles
	await browser.storage.session.set({
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
		target: { tabId, allFrames: false },
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
 * Decodes an XOR+base64 obfuscated token using a hex nonce as key.
 *
 * @param {string} obfuscated - The base64-encoded XOR'd token.
 * @param {string} nonceHex - The per-build nonce used during obfuscation.
 * @returns {Promise<string>} - The decoded token.
 */
async function decodeToken(obfuscated, nonceHex) {
	const pepper = 'LSP::tmdb::v1';
	const keyMaterial = `${pepper}${nonceHex}`;
	const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyMaterial));
	const keyBytes = new Uint8Array(hashBuffer);
	const bytes = Uint8Array.from(atob(obfuscated), c => c.charCodeAt(0));
	return Array.from(bytes).map((b, i) => String.fromCharCode(b ^ keyBytes[i % keyBytes.length])).join('');
}

/**
 * Loads the TMDB token from the bundled config and updates fetch options.
 *
 * @returns {Promise<void>} - Resolves once fetch options are configured.
 */
async function loadTmdbToken() {
	const apiConfig = await safeFetchJson("settings/api.json", {}, "API config");
	if (!apiConfig?.json?.tmdb) {
		return;
	}

	const raw = apiConfig.json;
	const token = (raw.debug || !raw.nonce) ? raw.tmdb : await decodeToken(raw.tmdb, raw.nonce);
	setFetchOptions(token);
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

/**
 * Safely fetches a URL and parses JSON, with error handling.
 * @param {string} url - The URL to fetch.
 * @param {object} options - Fetch options.
 * @param {string} context - Context string for error messages.
 * @returns {Promise<{json: any, status: number}|null>} - Object with json and status, or null on error.
 */
async function safeFetchJson(url, options, context) {
	let response;

	try {
		response = await fetch(url, options);
	} catch (error) {
		console.error(`Failed to fetch ${context}:`, error);
		return null;
	}

	if (!response || response.status !== 200) {
		// Still return status for further error handling
		return { json: null, status: response?.status };
	}

	try {
		const json = await response.json();
		return { json, status: response.status };
	} catch (error) {
		console.error(`Failed to parse JSON for ${context}:`, error);
		return null;
	}
}

/////////////////////////////////////////////////////////////////////////////////////
//////////////////////////// NODE TEST EXPORTS //////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

// Exposes the pure/testable functions (plus the mutable settings and the
// `availableMovies` cache, so tests can seed/inspect them) to Node's built-in
// test runner via CommonJS `require()`. `module` is not a global in a real
// browser extension context (Chrome or Firefox), so this block never executes
// there and has no effect on production behavior.
//
// The state below is exposed through getters rather than plain properties
// because these module-level bindings get *reassigned* (e.g. `parseCache` does
// `availableMovies = items.available_movies ?? {}`). A plain shorthand property
// would only capture the value as it was at require time and silently detach
// from the live binding afterwards.
if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		getIdWithReleaseYear,
		extractMediaInfo,
		addMovieIfFlatrate,
		parseSettings,
		isLetterboxdUrl,
		isSupportedLetterboxdPage,
		isProcessableLetterboxdTab,
		get availableMovies() { return availableMovies; },
		get countryCode() { return countryCode; },
		get providerId() { return providerId; },
		get filterStatus() { return filterStatus; },
	};
}

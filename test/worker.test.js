"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////// EXTENSION API MOCK /////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

// worker.js is a Manifest V3 service worker: its top-level code does
// `const browser = chrome;` and immediately registers listeners on
// `browser.runtime`, `browser.tabs`, `browser.storage.local` and `browser.alarms`.
// So `chrome` has to exist as a global *before* worker.js is required. The stub
// below mirrors exactly the surface worker.js touches, with recording `set`
// implementations so tests can assert what the worker persisted.

const storageLocalSetCalls = [];

globalThis.chrome = {
	runtime: {
		onInstalled: { addListener() {} },
		onStartup: { addListener() {} },
		onMessage: { addListener() {} },
	},
	tabs: {
		onUpdated: { addListener() {} },
	},
	alarms: {
		onAlarm: { addListener() {} },
	},
	storage: {
		local: {
			get: async () => ({}),
			set: async (items) => { storageLocalSetCalls.push(items); },
			onChanged: { addListener() {} },
		},
		session: {
			get: async () => ({}),
			set: async () => {},
		},
	},
};

const worker = require(path.join(__dirname, '..', 'extension', 'worker.js'));

/**
 * Runs `fn` with `process.env.TZ` temporarily set to `tz`, restoring it afterwards.
 * Node re-reads the timezone on every `process.env.TZ` assignment, so this changes
 * how `Date` behaves for the duration of the call.
 */
function withTimeZone(tz, fn) {
	const previousTz = process.env.TZ;
	process.env.TZ = tz;
	try {
		return fn();
	} finally {
		if (previousTz === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = previousTz;
		}
	}
}

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////// isLetterboxdUrl ////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

test('isLetterboxdUrl', async (t) => {
	await t.test('matches bare letterboxd.com URLs', () => {
		assert.strictEqual(worker.isLetterboxdUrl('https://letterboxd.com/film/inception/'), true);
	});

	await t.test('matches www.letterboxd.com URLs', () => {
		assert.strictEqual(worker.isLetterboxdUrl('https://www.letterboxd.com/someone/watchlist/'), true);
	});

	await t.test('rejects unrelated domains, even ones mentioning letterboxd.com in the path', () => {
		assert.strictEqual(worker.isLetterboxdUrl('https://example.com/letterboxd.com/'), false);
	});

	await t.test('returns a strict boolean for a missing or empty url', () => {
		assert.strictEqual(worker.isLetterboxdUrl(undefined), false);
		assert.strictEqual(worker.isLetterboxdUrl(''), false);
		assert.strictEqual(worker.isLetterboxdUrl(null), false);
	});
});

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////// isSupportedLetterboxdPage //////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

test('isSupportedLetterboxdPage', async (t) => {
	await t.test('accepts watchlist, films, likes and list pages', () => {
		assert.strictEqual(worker.isSupportedLetterboxdPage('https://letterboxd.com/user/watchlist/'), true);
		assert.strictEqual(worker.isSupportedLetterboxdPage('https://letterboxd.com/films/popular/'), true);
		assert.strictEqual(worker.isSupportedLetterboxdPage('https://letterboxd.com/user/likes/films/'), true);
		assert.strictEqual(worker.isSupportedLetterboxdPage('https://letterboxd.com/user/list/some-list/'), true);
	});

	await t.test('rejects a page type that is not in the supported list (e.g. a single film page)', () => {
		assert.strictEqual(worker.isSupportedLetterboxdPage('https://letterboxd.com/film/inception/'), false);
	});

	await t.test('returns a strict boolean for a missing or empty url', () => {
		assert.strictEqual(worker.isSupportedLetterboxdPage(undefined), false);
		assert.strictEqual(worker.isSupportedLetterboxdPage(''), false);
		assert.strictEqual(worker.isSupportedLetterboxdPage(null), false);
	});
});

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////// isProcessableLetterboxdTab /////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

test('isProcessableLetterboxdTab', async (t) => {
	const baseTab = { url: 'https://letterboxd.com/user/watchlist/', status: 'complete', discarded: false };

	await t.test('accepts a fully loaded, non-discarded tab on a supported page', () => {
		assert.strictEqual(worker.isProcessableLetterboxdTab(baseTab), true);
	});

	await t.test('rejects a discarded tab', () => {
		assert.strictEqual(worker.isProcessableLetterboxdTab({ ...baseTab, discarded: true }), false);
	});

	await t.test('rejects a tab that has not finished loading', () => {
		assert.strictEqual(worker.isProcessableLetterboxdTab({ ...baseTab, status: 'loading' }), false);
	});

	await t.test('rejects a tab on an unsupported letterboxd page', () => {
		assert.strictEqual(
			worker.isProcessableLetterboxdTab({ ...baseTab, url: 'https://letterboxd.com/film/inception/' }),
			false
		);
	});

	await t.test('rejects a tab on an unrelated domain', () => {
		assert.strictEqual(
			worker.isProcessableLetterboxdTab({ ...baseTab, url: 'https://example.com/watchlist/' }),
			false
		);
	});

	await t.test('returns a strict boolean for a tab with no url at all', () => {
		assert.strictEqual(worker.isProcessableLetterboxdTab({ status: 'complete', discarded: false }), false);
	});
});

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////// extractMediaInfo ///////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

test('extractMediaInfo', async (t) => {
	await t.test('extracts title/release_date for a movie', () => {
		const item = { title: 'Inception', release_date: '2010-07-16' };
		assert.deepStrictEqual(worker.extractMediaInfo(item, 'movie'), {
			itemTitle: 'Inception',
			itemReleaseDate: '2010-07-16',
		});
	});

	await t.test('extracts name/first_air_date for a tv show', () => {
		const item = { name: 'Chernobyl', first_air_date: '2019-05-06' };
		assert.deepStrictEqual(worker.extractMediaInfo(item, 'tv'), {
			itemTitle: 'Chernobyl',
			itemReleaseDate: '2019-05-06',
		});
	});

	await t.test('returns nulls when a movie is missing release_date', () => {
		const item = { title: 'Inception' };
		assert.deepStrictEqual(worker.extractMediaInfo(item, 'movie'), { itemTitle: null, itemReleaseDate: null });
	});

	await t.test('returns nulls when a movie is missing title', () => {
		const item = { release_date: '2010-07-16' };
		assert.deepStrictEqual(worker.extractMediaInfo(item, 'movie'), { itemTitle: null, itemReleaseDate: null });
	});

	await t.test('returns nulls when a tv show is missing name', () => {
		const item = { first_air_date: '2019-05-06' };
		assert.deepStrictEqual(worker.extractMediaInfo(item, 'tv'), { itemTitle: null, itemReleaseDate: null });
	});

	await t.test('does not cross-match movie fields against a tv media type', () => {
		const item = { title: 'Inception', release_date: '2010-07-16' };
		assert.deepStrictEqual(worker.extractMediaInfo(item, 'tv'), { itemTitle: null, itemReleaseDate: null });
	});

	await t.test('returns nulls for an unrecognized media type', () => {
		const item = { title: 'Inception', release_date: '2010-07-16', name: 'Inception' };
		assert.deepStrictEqual(worker.extractMediaInfo(item, 'person'), { itemTitle: null, itemReleaseDate: null });
	});
});

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////// getIdWithReleaseYear ///////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

test('getIdWithReleaseYear', async (t) => {
	await t.test('returns an exact title+year match', () => {
		const results = [{ media_type: 'movie', id: 20, title: 'Dune', release_date: '2021-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'Dune', 2021), {
			tmdbId: 20,
			mediaType: 'movie',
			matchFound: true,
		});
	});

	await t.test('prefers an exact match over an earlier fuzzy (+-1 year) candidate', () => {
		const results = [
			{ media_type: 'movie', id: 10, title: 'Dune', release_date: '2020-06-15' }, // off by 1 year, seen first
			{ media_type: 'movie', id: 20, title: 'Dune', release_date: '2021-06-15' }, // exact
		];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'Dune', 2021), {
			tmdbId: 20,
			mediaType: 'movie',
			matchFound: true,
		});
	});

	await t.test('short-circuits on an exact match, so a LATER fuzzy candidate cannot overwrite it', () => {
		// Ordering matters here: the exact match comes FIRST and a +-1 year candidate for a
		// different entry comes LATER. Only an implementation that returns immediately on an
		// exact match survives this; one that merely records the exact match as a candidate
		// would let id 30 overwrite it and return the wrong film.
		const results = [
			{ media_type: 'movie', id: 20, title: 'Dune', release_date: '2021-06-15' }, // exact, seen first
			{ media_type: 'movie', id: 30, title: 'Dune', release_date: '2022-06-15' }, // off by 1, seen later
		];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'Dune', 2021), {
			tmdbId: 20,
			mediaType: 'movie',
			matchFound: true,
		});
	});

	await t.test('falls back to a +-1 year fuzzy match when no exact match exists', () => {
		const results = [{ media_type: 'movie', id: 5, title: 'Nope', release_date: '2022-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'Nope', 2021), {
			tmdbId: 5,
			mediaType: 'movie',
			matchFound: true,
		});
	});

	await t.test('does not match when the year is off by exactly 2 (the fuzzy window is +-1 only)', () => {
		// A 2-year gap is the boundary case that pins the window: it must not match either
		// direction, so widening `Math.abs(...) === 1` to `<= 2` is caught here.
		const earlier = [{ media_type: 'movie', id: 5, title: 'Gap Two', release_date: '2019-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(earlier, 'Gap Two', 2021), {
			tmdbId: -1,
			mediaType: '',
			matchFound: false,
		});

		const later = [{ media_type: 'movie', id: 6, title: 'Gap Two', release_date: '2023-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(later, 'Gap Two', 2021), {
			tmdbId: -1,
			mediaType: '',
			matchFound: false,
		});
	});

	await t.test('does not match when the year differs by more than 1', () => {
		const results = [{ media_type: 'movie', id: 5, title: 'Old Movie', release_date: '2015-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'Old Movie', 2021), {
			tmdbId: -1,
			mediaType: '',
			matchFound: false,
		});
	});

	await t.test('matches titles case-insensitively', () => {
		const results = [{ media_type: 'movie', id: 7, title: 'DUNE', release_date: '2021-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'dune', 2021), {
			tmdbId: 7,
			mediaType: 'movie',
			matchFound: true,
		});
	});

	await t.test('requires exact title equality, not a substring relationship', () => {
		// 'Dune' and 'Dune: Part Two' are different films; neither direction of a substring
		// check may be treated as a match, in either argument order.
		const sequelResult = [{ media_type: 'movie', id: 60, title: 'Dune: Part Two', release_date: '2021-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(sequelResult, 'Dune', 2021), {
			tmdbId: -1,
			mediaType: '',
			matchFound: false,
		});

		const baseResult = [{ media_type: 'movie', id: 61, title: 'Dune', release_date: '2021-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(baseResult, 'Dune: Part Two', 2021), {
			tmdbId: -1,
			mediaType: '',
			matchFound: false,
		});
	});

	await t.test('matches a tv show via name/first_air_date', () => {
		const results = [{ media_type: 'tv', id: 42, name: 'Chernobyl', first_air_date: '2019-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'Chernobyl', 2019), {
			tmdbId: 42,
			mediaType: 'tv',
			matchFound: true,
		});
	});

	await t.test('does not match a tv result against a movie release_date field', () => {
		// item is tv media_type but only carries movie-shaped fields; extractMediaInfo
		// should reject it, so no match should be produced even though titles align.
		const results = [{ media_type: 'tv', id: 42, title: 'Chernobyl', release_date: '2019-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'Chernobyl', 2019), {
			tmdbId: -1,
			mediaType: '',
			matchFound: false,
		});
	});

	await t.test('returns no match for an empty result set', () => {
		assert.deepStrictEqual(worker.getIdWithReleaseYear([], 'Anything', 2021), {
			tmdbId: -1,
			mediaType: '',
			matchFound: false,
		});
	});

	await t.test('treats releaseYear -1 ("no known year") as an automatic fuzzy candidate', () => {
		const results = [{ media_type: 'movie', id: 99, title: 'Timeless', release_date: '1999-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'Timeless', -1), {
			tmdbId: 99,
			mediaType: 'movie',
			matchFound: true,
		});
	});

	await t.test('skips items with no media_type at all', () => {
		const results = [
			{ id: 1, title: 'No Type', release_date: '2021-06-15' }, // no media_type -> skipped
			{ media_type: 'movie', id: 2, title: 'No Type', release_date: '2021-06-15' },
		];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'No Type', 2021), {
			tmdbId: 2,
			mediaType: 'movie',
			matchFound: true,
		});
	});

	await t.test('ignores items whose title does not match', () => {
		const results = [{ media_type: 'movie', id: 1, title: 'Completely Different', release_date: '2021-06-15' }];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'Dune', 2021), {
			tmdbId: -1,
			mediaType: '',
			matchFound: false,
		});
	});

	await t.test('keeps the last qualifying fuzzy candidate when several are found', () => {
		const results = [
			{ media_type: 'movie', id: 1, title: 'Dune', release_date: '2020-06-15' }, // off by 1
			{ media_type: 'movie', id: 2, title: 'Dune', release_date: '2022-06-15' }, // off by 1, seen later
		];
		assert.deepStrictEqual(worker.getIdWithReleaseYear(results, 'Dune', 2021), {
			tmdbId: 2,
			mediaType: 'movie',
			matchFound: true,
		});
	});

	/////////////////////////////////////////////////////////////////////////////////
	// Timezone independence.
	//
	// TMDb release dates are plain `YYYY-MM-DD` strings. Reading the year back via
	// `new Date(dateString).getFullYear()` parses the string as UTC midnight but
	// formats it in the host machine's LOCAL timezone, so west of UTC (all of the
	// Americas) a January 1st date reads as the PREVIOUS year. Matching must not
	// depend on where the user's browser happens to be.
	/////////////////////////////////////////////////////////////////////////////////

	const TIMEZONES = ['UTC', 'America/Los_Angeles', 'Pacific/Auckland'];

	// Sanity check on the harness itself: if the runtime ignored a mid-process TZ
	// change, every timezone case below would pass vacuously.
	await t.test('the TZ override used by the timezone tests actually takes effect', () => {
		withTimeZone('America/Los_Angeles', () => {
			assert.strictEqual(new Date('2021-01-01').getFullYear(), 2020);
		});
		withTimeZone('UTC', () => {
			assert.strictEqual(new Date('2021-01-01').getFullYear(), 2021);
		});
	});

	await t.test('is not fooled by a January 1st release date west of UTC', () => {
		const results = [
			// Wrong film, released 2021-01-01, listed first by TMDb.
			{ media_type: 'movie', id: 999, title: 'Ghost', release_date: '2021-01-01' },
			// The actually-correct 2020 film.
			{ media_type: 'movie', id: 111, title: 'Ghost', release_date: '2020-06-15' },
		];

		for (const tz of TIMEZONES) {
			withTimeZone(tz, () => {
				assert.deepStrictEqual(
					worker.getIdWithReleaseYear(results, 'Ghost', 2020),
					{ tmdbId: 111, mediaType: 'movie', matchFound: true },
					`wrong match under TZ=${tz}`
				);
			});
		}
	});

	await t.test('does not turn a January 1st release date into a spurious fuzzy match', () => {
		// The same drift in the other direction: a 2021-01-01 film is two years away from
		// a 2019 search and must not match, but a local-timezone year read makes it look
		// like a 2020 film (off by one) west of UTC, i.e. a bogus fuzzy candidate.
		const results = [{ media_type: 'movie', id: 555, title: 'Newyear', release_date: '2021-01-01' }];

		for (const tz of TIMEZONES) {
			withTimeZone(tz, () => {
				assert.deepStrictEqual(
					worker.getIdWithReleaseYear(results, 'Newyear', 2019),
					{ tmdbId: -1, mediaType: '', matchFound: false },
					`spurious match under TZ=${tz}`
				);
			});
		}
	});

	await t.test('reads the year of a December 31st release date consistently in every timezone', () => {
		const results = [
			{ media_type: 'movie', id: 888, title: 'Spirit', release_date: '2020-12-31' },
			{ media_type: 'movie', id: 777, title: 'Spirit', release_date: '2021-06-15' },
		];

		for (const tz of TIMEZONES) {
			withTimeZone(tz, () => {
				assert.deepStrictEqual(
					worker.getIdWithReleaseYear(results, 'Spirit', 2020),
					{ tmdbId: 888, mediaType: 'movie', matchFound: true },
					`wrong match under TZ=${tz}`
				);
			});
		}
	});
});

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////// addMovieIfFlatrate //////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

test('addMovieIfFlatrate', async (t) => {
	// addMovieIfFlatrate reads module-level countryCode/providerId, which parseSettings
	// sets synchronously (no fetch is triggered when all three settings keys are given).
	t.beforeEach(async () => {
		await worker.parseSettings({ country_code: 'DE', provider_id: 8, filter_status: true });
	});

	await t.test('adds letterboxd ids when the provider is present in flatrate', () => {
		worker.availableMovies[1] = [];
		const results = { DE: { flatrate: [{ provider_id: 8 }], free: [] } };
		worker.addMovieIfFlatrate(results, 1, [100, 101]);
		assert.deepStrictEqual(worker.availableMovies[1], [100, 101]);
	});

	await t.test('adds letterboxd ids when the provider is only present in free (flatrate empty)', () => {
		worker.availableMovies[2] = [];
		const results = { DE: { flatrate: [], free: [{ provider_id: 8 }] } };
		worker.addMovieIfFlatrate(results, 2, [200]);
		assert.deepStrictEqual(worker.availableMovies[2], [200]);
	});

	await t.test('does nothing when the provider is absent from both flatrate and free', () => {
		worker.availableMovies[3] = [];
		const results = { DE: { flatrate: [{ provider_id: 9 }], free: [{ provider_id: 10 }] } };
		worker.addMovieIfFlatrate(results, 3, [300]);
		assert.deepStrictEqual(worker.availableMovies[3], []);
	});

	await t.test('does nothing when the configured country is absent from the results', () => {
		worker.availableMovies[4] = [];
		// configured country is DE (see beforeEach), but only US data is present
		const results = { US: { flatrate: [{ provider_id: 8 }] } };
		worker.addMovieIfFlatrate(results, 4, [400]);
		assert.deepStrictEqual(worker.availableMovies[4], []);
	});

	await t.test('handles a country entry with no flatrate/free arrays at all', () => {
		worker.availableMovies[5] = [];
		const results = { DE: {} };
		assert.doesNotThrow(() => worker.addMovieIfFlatrate(results, 5, [500]));
		assert.deepStrictEqual(worker.availableMovies[5], []);
	});

	await t.test('appends across multiple calls rather than overwriting prior entries', () => {
		worker.availableMovies[6] = [1];
		const results = { DE: { flatrate: [{ provider_id: 8 }] } };
		worker.addMovieIfFlatrate(results, 6, [2, 3]);
		assert.deepStrictEqual(worker.availableMovies[6], [1, 2, 3]);
	});

	await t.test('currently throws when availableMovies has no entry for the tab yet', () => {
		// Documents (rather than endorses) today's behavior: addMovieIfFlatrate assumes
		// initializeTabState already seeded availableMovies[tabId] and does no defensive
		// check, so a match for an unseeded tab throws instead of being ignored.
		assert.strictEqual(worker.availableMovies[9999], undefined);
		const results = { DE: { flatrate: [{ provider_id: 8 }] } };
		assert.throws(() => worker.addMovieIfFlatrate(results, 9999, [900]), TypeError);
	});
});

/////////////////////////////////////////////////////////////////////////////////////
///////////////////////// parseSettings ///////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////

test('parseSettings', async (t) => {
	await t.test('applies fully-specified settings synchronously, without calling fetch', async () => {
		const originalFetch = global.fetch;
		let fetchCalled = false;
		global.fetch = async (...args) => {
			fetchCalled = true;
			return originalFetch ? originalFetch(...args) : undefined;
		};

		try {
			await worker.parseSettings({ country_code: 'US', provider_id: 9, filter_status: false });
		} finally {
			global.fetch = originalFetch;
		}

		assert.strictEqual(fetchCalled, false, 'fetch should not be called when all settings are already present');

		assert.strictEqual(worker.countryCode, 'US');
		assert.strictEqual(worker.providerId, 9);

		// Confirm the values actually took effect, via the observable behavior of addMovieIfFlatrate.
		worker.availableMovies[900] = [];
		worker.addMovieIfFlatrate({ US: { flatrate: [{ provider_id: 9 }] } }, 900, [1]);
		assert.deepStrictEqual(worker.availableMovies[900], [1]);
	});

	await t.test('applies filter_status in both directions', async () => {
		// Asserted in both directions on purpose: with only a single false-to-false or
		// true-to-true assertion, dropping the `filterStatus = items.filter_status`
		// assignment entirely would still leave the observed value "correct".
		await worker.parseSettings({ country_code: 'US', provider_id: 9, filter_status: true });
		assert.strictEqual(worker.filterStatus, true);

		await worker.parseSettings({ country_code: 'US', provider_id: 9, filter_status: false });
		assert.strictEqual(worker.filterStatus, false);
	});

	await t.test('loads, applies and persists default settings when stored settings are incomplete', async () => {
		// Seed a state that differs from every default value, so each assertion below can
		// only pass if the default really was read, applied and persisted.
		await worker.parseSettings({ country_code: 'DE', provider_id: 9, filter_status: true });

		const defaults = { country_code: 'US', provider_id: 8, filter_status: false };
		const originalFetch = global.fetch;
		let requestedUrl = null;
		storageLocalSetCalls.length = 0;
		global.fetch = async (url) => {
			requestedUrl = url;
			return { status: 200, json: async () => ({ ...defaults }) };
		};

		try {
			await worker.parseSettings({});
		} finally {
			global.fetch = originalFetch;
		}

		assert.match(String(requestedUrl), /default\.json/);

		// Defaults were applied in memory ...
		assert.strictEqual(worker.countryCode, 'US');
		assert.strictEqual(worker.providerId, 8);
		assert.strictEqual(worker.filterStatus, false);

		// ... and persisted back to extension storage.
		assert.deepStrictEqual(storageLocalSetCalls, [defaults]);
	});

	await t.test('only loads the defaults that are actually missing', async () => {
		await worker.parseSettings({ country_code: 'DE', provider_id: 9, filter_status: true });

		const originalFetch = global.fetch;
		storageLocalSetCalls.length = 0;
		global.fetch = async () => ({
			status: 200,
			json: async () => ({ country_code: 'US', provider_id: 8, filter_status: false }),
		});

		try {
			// Only provider_id is missing, so the stored country code and filter status must survive.
			await worker.parseSettings({ country_code: 'DE', filter_status: true });
		} finally {
			global.fetch = originalFetch;
		}

		assert.strictEqual(worker.countryCode, 'DE');
		assert.strictEqual(worker.providerId, 8);
		assert.strictEqual(worker.filterStatus, true);
		assert.deepStrictEqual(storageLocalSetCalls, [{ provider_id: 8 }]);
	});

	await t.test('persists nothing when default.json carries no usable keys', async () => {
		const originalFetch = global.fetch;
		storageLocalSetCalls.length = 0;
		global.fetch = async () => ({ status: 200, json: async () => ({}) });

		try {
			await assert.doesNotReject(worker.parseSettings({}));
		} finally {
			global.fetch = originalFetch;
		}

		assert.deepStrictEqual(storageLocalSetCalls, []);
	});

	await t.test('does not throw or persist when the fallback fetch itself fails (e.g. network error)', async () => {
		const originalFetch = global.fetch;
		const originalConsoleError = console.error;
		console.error = () => {};
		storageLocalSetCalls.length = 0;
		global.fetch = async () => {
			throw new Error('network down');
		};

		try {
			// country_code is present but provider_id/filter_status are missing, so the
			// (failing) default-settings fetch path is exercised.
			await assert.doesNotReject(worker.parseSettings({ country_code: 'DE' }));
		} finally {
			global.fetch = originalFetch;
			console.error = originalConsoleError;
		}

		assert.deepStrictEqual(storageLocalSetCalls, []);
	});
});

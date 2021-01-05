/*!
 *
 *     Copyright (c) 2019 Christian Zei
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

var provider_id; // e.g. Netflix: 8, Amazon Prime Video: 9

var providers;

var countries;

var justWatchCountryCode; // e.g. German: "de_DE", USA: "en_US"
var tmdbCountryCode; // e.g. German: "de-DE", USA: "en-US"

var availableMovies = {};
var crawledMovies = {};
var unsolvedRequests = {};
var unsolvedRequestsDelay = {};
var tmdb_key;

var checkCounter = {};

var filterStatus;

/**
 * Loads all information from JSON files for intern computations. Also loads the current settings.
 *
 * @returns {Promise<void>} - An empty Promise if the loadings worked correctly, else the Promise contains the respective errors.
 */
const onStartUp = async () => {
  // load stored settings from localStorage
  browser.storage.local.get(parseSettings);

  function parseSettings(item) {
    let version = 0;
    let countrySet = false;
    let languageSet = false;
    let providerSet = false;
    let statusSet = false;

    if(item.hasOwnProperty('version')) {
      version = item.version;
    }
    if(item.hasOwnProperty('justwatch_country_code')) {
      countrySet = true;
      setJustWatchCountryCode(item.justwatch_country_code);
    }
    if(item.hasOwnProperty('tmdb_country_code')) {
      languageSet = true;
      setTMDBCountryCode(item.tmdb_country_code);
    }
    if (item.hasOwnProperty('provider_id')) {
      providerSet = true;
      setProviderId(item.provider_id);
    }
    if (item.hasOwnProperty('filterStatus')) {
      statusSet = true;
      setFilterStatus(item.filterStatus);
    }

    if (version < 2) {
      if(item.hasOwnProperty('country_code')) {
        countrySet = true;
        setJustWatchCountryCode(item.country_code);
        browser.storage.local.remove('country_code');
      }

      if (countrySet) {
        estimateTMDBCountryCode(justWatchCountryCode);
        browser.storage.local.remove('iso31661');
        languageSet = true;
      }
    }

    if((!countrySet) || (!languageSet) || (!providerSet) || (!statusSet)) {
      loadDefaultSettings(countrySet, languageSet, providerSet, statusSet);
    }
  }

  function estimateTMDBCountryCode(code) {
    loadJSON("streaming-providers/countries.json", function (response) {
      response = JSON.parse(response);
      for(let country in response) {
        if (!response[country].hasOwnProperty('justwatch_country_code') || !response[country].hasOwnProperty('tmdb_country_code'))
          continue;

        if (response[country].justwatch_country_code === code) {
          setTMDBCountryCode(response[country].tmdb_country_code);
          return;
        }
      }
      loadDefaultSettings(true, false, true, true)
    });
  }

  function loadDefaultSettings(countrySet, languageSet, providerSet, statusSet) {
    // load default settings
    loadJSON("settings/default.json", function (response) {
      // Parse JSON string into object
      response = JSON.parse(response);
      // set the intern settings
      if(!countrySet && response.hasOwnProperty('justwatch_country_code')) {
        setJustWatchCountryCode(response.justwatch_country_code);
      }
      if(!languageSet && response.hasOwnProperty('tmdb_country_code')) {
        setTMDBCountryCode(response.tmdb_country_code);
      }
      if(!providerSet && response.hasOwnProperty('provider_id')) {
        setProviderId(response.provider_id);
      }
      if(!statusSet && response.hasOwnProperty('filterStatus')) {
        setFilterStatus(response.filterStatus);
      }
    });
  }

  // load TMDb key
  loadJSON("settings/api.json", function (response) {
    // Parse JSON string into object
    response = JSON.parse(response);
    tmdb_key = response.tmdb;
  });

  // load provider list
  loadJSON("streaming-providers/providers.json", function (response) {
    // Parse JSON string into object
    providers = JSON.parse(response);
  });

  // load country list
  loadJSON("streaming-providers/countries.json", function (response) {
    // Parse JSON string into object
    countries = JSON.parse(response);
  });
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
 * @param {string} tmdbCountryCode - The currently set TMDB country code to store.
 * @param {int} provider_id - The currently set provider id to store.
 * @param {boolean} filterStatus - The currently set filter status to store.
 */
function storeSettings(justWatchCountryCode, tmdbCountryCode, provider_id, filterStatus) {
  let version = 2;

  browser.storage.local.set({
    version: version,
    justwatch_country_code: justWatchCountryCode,
    tmdb_country_code: tmdbCountryCode,
    provider_id: provider_id,
    filterStatus: filterStatus
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
  var eng_title = toFind.title;
  var movie_release_year = toFind.year;
  var movie_letterboxd_id = toFind.id;

  if (isNaN(movie_release_year)) {
    movie_release_year = -1;
  }

  if (typeof movie_release_year === 'string') {
    movie_release_year = parseInt(movie_release_year);
  }

  var title_sanitized = encodeURIComponent(eng_title);
  var tmdb_rsp = '';
  var justwatch_rsp = '';
  var tmdb_id = -1;
  var media_type = '';
  var localized_title = '';
  var found_match = false;

  var xhttp = new XMLHttpRequest();
  
  let justwatchRequest = {
    page: 1,
    page_size: 30,
    query: title_sanitized,
  };

  xhttp.open('GET', "https://apis.justwatch.com/content/titles/" + justWatchCountryCode + "/popular?body=" + JSON.stringify(justwatchRequest), true);
  xhttp.send();

  xhttp.onreadystatechange = function () {
    if (xhttp.readyState === 4 && xhttp.status === 200) {
      justwatch_rsp = JSON.parse(xhttp.response);
      found_match = getOffersWithReleaseYear(tabId, justwatch_rsp, movie_letterboxd_id, eng_title, movie_release_year);

      if (found_match) {
        checkCounter[tabId]++;

        if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
          fadeUnstreamedMovies(tabId, crawledMovies[tabId]);
        }
      } else {
        found_match = false;

        xhttp.open('GET', "https://api.themoviedb.org/3/search/multi?api_key=" + getAPIKey() + "&query=" + title_sanitized, true);
        xhttp.send();

        xhttp.onreadystatechange = function () {
          if (xhttp.readyState === 4 && xhttp.status === 200) {
            tmdb_rsp = JSON.parse(xhttp.response);

            var rslt = getIdWithReleaseYear(tabId, tmdb_rsp, eng_title, movie_release_year);
            found_match = rslt.found_perfect_match;

            if (found_match) {
              tmdb_id = rslt.tmdb_id;
              media_type = rslt.media_type;
            } else {
              rslt = getIdWithoutExactReleaseYear(tabId, tmdb_rsp, eng_title, movie_release_year);
              tmdb_id = rslt.tmdb_id;
              media_type = rslt.media_type;
              found_match = rslt.found_match;
            }

            if (found_match) {
              found_match = false;

              xhttp.open('GET', "https://api.themoviedb.org/3/" + media_type + "/" + tmdb_id + "?api_key=" + getAPIKey() + "&language=" + tmdbCountryCode, true); // todo escape
              xhttp.send();

              xhttp.onreadystatechange = function () {
                if (xhttp.readyState === 4 && xhttp.status === 200) {
                  tmdb_rsp = JSON.parse(xhttp.response);

                  localized_title = eng_title;

                  if (media_type === 'movie') {
                    if (tmdb_rsp.hasOwnProperty('title')) {
                      localized_title = tmdb_rsp.title;
                    } else {
                      if (tmdb_rsp.hasOwnProperty('original_title'))
                        localized_title = tmdb_rsp.original_title;
                    }
                  } else if (media_type === 'tv') {
                    if (tmdb_rsp.hasOwnProperty('name')) {
                      localized_title = tmdb_rsp.name;
                    } else {
                      if (tmdb_rsp.hasOwnProperty('original_name'))
                        localized_title = tmdb_rsp.original_name;
                    }
                  }

                  found_match = getOffersWithReleaseYear(tabId, justwatch_rsp, movie_letterboxd_id, localized_title, movie_release_year);

                  if (!found_match) {
                    getOffersWithoutExactReleaseYear(tabId, justwatch_rsp, movie_letterboxd_id, localized_title, movie_release_year);
                  }

                  checkCounter[tabId]++;

                  if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
                    fadeUnstreamedMovies(tabId, crawledMovies[tabId]);
                  }
                } else if (xhttp.readyState === 4 && xhttp.status !== 200) {
                  checkCounter[tabId]++;
                  if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
                    fadeUnstreamedMovies(tabId, crawledMovies[tabId]);
                  }
                }
              };
            }
            else {
              checkCounter[tabId]++;
              if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
                fadeUnstreamedMovies(tabId, crawledMovies[tabId]);
              }
            }
          } else if (xhttp.readyState === 4 && xhttp.status === 429) {
            checkCounter[tabId]++;
            unsolvedRequests[tabId][toFind.title] = {
              year: toFind.year,
              id: toFind.id
            };
            unsolvedRequestsDelay = parseInt(xhttp.getResponseHeader('Retry-After'));

            if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
              fadeUnstreamedMovies(tabId, crawledMovies[tabId]);
            }
          } else if (xhttp.readyState === 4 && xhttp.status !== 200 && xhttp.status !== 429) {
            checkCounter[tabId]++;
            if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
              fadeUnstreamedMovies(tabId, crawledMovies[tabId]);
            }
          }
        };
      }
    } else if (xhttp.readyState === 4 && xhttp.status !== 200) {
      checkCounter[tabId]++;
      if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
        fadeUnstreamedMovies(tabId, crawledMovies[tabId]);
      }
    }
  };
}

/**
 * Checks if the streaming provider offers a flatrate for the given movie released in movie_release_year.
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} rsp - The response from the ajax request.
 * @param {int} movie_letterboxd_id - The intern ID from the array in letterboxd.com.
 * @param {string} title - The movie title.
 * @param {int} movie_release_year - The movie's release year.
 * @returns {boolean} - Returns true if the searched movie is found unter the given conditions, returns false else.
 */
function getOffersWithReleaseYear(tabId, rsp, movie_letterboxd_id, title, movie_release_year) {
  for (let item in rsp.items) {
    if (rsp.items[item].title.toLowerCase() === title.toLowerCase() && rsp.items[item].original_release_year == movie_release_year) {
      for (let offer in rsp.items[item].offers) {
        if (rsp.items[item].offers[offer].monetization_type === 'flatrate' && Number(rsp.items[item].offers[offer].provider_id) === provider_id) {
          availableMovies[tabId].push(...movie_letterboxd_id);
          break;
        }
      }
      return true;
    }
  }
  return false;
}

/**
 * Checks if the streaming provider offers a flatrate for the given movie released in movie_release_year-1 or movie_release_year+1 or if the movie_release_year is invalid (=-1).
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} rsp - The response from the ajax request.
 * @param {int} movie_letterboxd_id - The intern ID from the array in letterboxd.com.
 * @param {string} title - The movie title.
 * @param {int} movie_release_year - The movie's release year.
 */
function getOffersWithoutExactReleaseYear(tabId, rsp, movie_letterboxd_id, title, movie_release_year) {
  for (let item in rsp.items) {
    // TODO cast the years correctly before comparison (check if needed at all??)
    if (rsp.items[item].title.toLowerCase() === title.toLowerCase() &&
      ((rsp.items[item].original_release_year == movie_release_year - 1)) || (rsp.items[item].original_release_year == movie_release_year + 1) || (movie_release_year === -1)) {
      for (let offer in rsp.items[item].offers) {
        if (rsp.items[item].offers[offer].monetization_type === 'flatrate' && Number(rsp.items[item].offers[offer].provider_id) === provider_id) {
          availableMovies[tabId].push(...movie_letterboxd_id);
          break;
        }
      }
      break;
    }
  }
}

/**
 * Returns the TMDB ID for a given English media title and a corresponding release year.
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} tmdb_rsp - The response from the ajax request.
 * @param {string} eng_title - The English movie title.
 * @param {int} release_year - The media's release year.
 * @returns {{tmdb_id: int, media_type: string, found_perfect_match: boolean}} - An object containing the TMDB movie ID, the media type and if this was a perfect match (eng_title and movie_release_year match up).
 */
function getIdWithReleaseYear(tabId, tmdb_rsp, eng_title, release_year) {
  if (release_year !== -1) {
    for (let item in tmdb_rsp.results) {
      if (!tmdb_rsp.results[item].hasOwnProperty('media_type'))
        continue;

      let item_title = '';
      let item_release_date = '';
      if (tmdb_rsp.results[item].media_type === 'movie') {
        if (!tmdb_rsp.results[item].hasOwnProperty('release_date') || !tmdb_rsp.results[item].hasOwnProperty('title'))
          continue;

        item_title = tmdb_rsp.results[item].title;
        item_release_date = tmdb_rsp.results[item].release_date;
      } else if (tmdb_rsp.results[item].media_type === 'tv') {
        if (!tmdb_rsp.results[item].hasOwnProperty('first_air_date') || !tmdb_rsp.results[item].hasOwnProperty('name'))
          continue;

        item_title = tmdb_rsp.results[item].name;
        item_release_date = tmdb_rsp.results[item].first_air_date;
      } else {
        continue;
      }

      let item_release_year = item_release_date.split('-')[0];
      if (typeof item_release_year === 'string') {
        item_release_year = parseInt(item_release_year);
      }

      if (item_title.toLowerCase() === eng_title.toLowerCase() && item_release_year === release_year) {
        return {
          tmdb_id: tmdb_rsp.results[item].id,
          media_type: tmdb_rsp.results[item].media_type,
          found_perfect_match: true
        };
      }
    }
  }

  return {
    movie_id: -1,
    found_perfect_match: false
  };
}

/**
 * Returns the TMDB ID for a given English media title and a for the given movie released in release_year-1 or release_year+1 or if the release_year is invalid (=-1).
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} tmdb_rsp - The response from the ajax request.
 * @param {string} eng_title - The English movie title.
 * @param {int} release_year - The media's release year.
 * @returns {{tmdb_id: int, media_type: string, found_match: boolean}} - An object containing the TMDB movie ID, the media type and if a match was found.
 */
function getIdWithoutExactReleaseYear(tabId, tmdb_rsp, eng_title, release_year) {
  for (let item in tmdb_rsp.results) {
    if (!tmdb_rsp.results[item].hasOwnProperty('media_type'))
      continue;

    let item_title = '';
    let item_release_date = '';
    if (tmdb_rsp.results[item].media_type === 'movie') {
      if (!tmdb_rsp.results[item].hasOwnProperty('release_date') || !tmdb_rsp.results[item].hasOwnProperty('title'))
        continue; // TODO maybe find best candidate if this happens?

      item_title = tmdb_rsp.results[item].title;
      item_release_date = tmdb_rsp.results[item].release_date;
    } else if (tmdb_rsp.results[item].media_type === 'tv') {
      if (!tmdb_rsp.results[item].hasOwnProperty('first_air_date') || !tmdb_rsp.results[item].hasOwnProperty('name'))
        continue; // TODO maybe find best candidate if this happens?

      item_title = tmdb_rsp.results[item].name;
      item_release_date = tmdb_rsp.results[item].first_air_date;
    } else {
      continue;
    }

    let item_release_year = item_release_date.split('-')[0];
    if (typeof item_release_year === 'string') {
      item_release_year = parseInt(item_release_year);
    }

    if (item_title.toLowerCase() === eng_title.toLowerCase()
      && ((release_year === -1) || (item_release_year === release_year - 1) || (item_release_year === release_year + 1))) {
      return {
        tmdb_id: tmdb_rsp.results[item].id,
        media_type: tmdb_rsp.results[item].media_type,
        found_match: true
      };
    }
  }

  return {
    tmdb_id: '',
    media_type: -1,
    found_match: false
  };
}

/**
 * Injects a content script into the Letterboxd web page to crawl the movie titles and release years.
 *
 * @param tabId - The tabId to operate in.
 */
function getFilmsFromLetterboxd(tabId) {
  browser.tabs.get(tabId, (tab) => {
    var fileName = '';
    if (tab.url.includes('watchlist')) {
      fileName = "./scripts/getFilmsFromLetterboxdWatchlist.js";
    } else {
      fileName = "./scripts/getFilmsFromLetterboxd.js";
    }

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
  return provider_id;
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
 * Returns the currently set ISO-3166-1 code
 *
 * @returns {string} - The currently set ISO-3166-1 code
 */
function getTMDBCountryCode() {
  return tmdbCountryCode;
}

/**
 * To change the provider_id out of the popup.
 *
 * @param {int} id - The new provider_id.
 */
function setProviderId(id) {
  provider_id = Number(id);
  storeSettings(justWatchCountryCode, tmdbCountryCode, provider_id, filterStatus);
  reloadMovieFilter();
}

/**
 * Returns all supported providers.
 *
 * @returns {object} - The providers loaded from providers.json.
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
 * Sets the status of the filter.
 *
 * @param {boolean} status - True if the filter should be enabled and false else.
 */
function setFilterStatus(status) {
  filterStatus = status;
  storeSettings(justWatchCountryCode, tmdbCountryCode, provider_id, filterStatus);
  reloadMovieFilter();
}

/**
 * To change the JustWatch country code out of the settings.
 *
 * @param {string} code - The new JustWatch country code.
 */
function setJustWatchCountryCode(code) {
  justWatchCountryCode = code;
  storeSettings(justWatchCountryCode, tmdbCountryCode, provider_id, filterStatus);
  reloadMovieFilter();
}

/**
 * To change the TMDB country code out of the settings.
 *
 * @param {string} code - The new TMDB country code.
 */
function setTMDBCountryCode(code) {
  tmdbCountryCode = code;
  storeSettings(justWatchCountryCode, tmdbCountryCode, provider_id, filterStatus);
}

/**
 * Called to force the filters to reload with the new provider_id.
 */
function reloadMovieFilter() {
  browser.tabs.query({}, reloadFilterInTab);

  function reloadFilterInTab(tabs) {
    for (let tab of tabs) {
      let tabId = tab.id;
      let changeInfo = {
        status: 'complete'
      };
      let tabInfo = {
        url: tab.url
      };

      unfadeUnstreamedMovies(tabId, crawledMovies[tabId]);
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
  return tmdb_key;
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
      var url = tabInfo.url;
      if (url.includes("://letterboxd.com/") || url.includes("://www.letterboxd.com/")) {
        if (url.includes('watchlist') || url.includes('films') || url.includes('likes')) { // || url === "https://letterboxd.com/" || url === 'https://www.letterboxd.com/'
          checkCounter[tabId] = 0;
          availableMovies[tabId] = [];
          crawledMovies[tabId] = {};
          unsolvedRequests[tabId] = {};
          unsolvedRequestsDelay[tabId] = 0;
          getFilmsFromLetterboxd(tabId);
        }
      }
    }
  }
}

/**
 * Called from within the listener for new messages from the content script.
 *
 * @param {{message_type: string, message_content: object}} request - The message from the content script.
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
  if (request.hasOwnProperty('message_type')) {
    if (request.message_type === 'movie-titles') {
      crawledMovies[tabId] = request.message_content;
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
    code: "document.body.className = document.body.className + ' hide-films-unstreamed';",
    allFrames: false
  });
}

/**
 * Inserts a content script for unfading all unavailable movies,
 *
 * @param tabId - The tabId to operate in.
 * @param movies - The crawled movies.
 */
function fadeUnstreamedMovies(tabId, movies) {
  browser.tabs.get(tabId, (tab) => {
    unfadeAllMovies(tabId);

    var className = '';
    if (tab.url.includes('watchlist')) {
      className = 'poster-container';
    } else {
      className = 'film-poster';
    }

    for (let movie in movies) {
      for (let movie_id in movies[movie].id) {
        if (!availableMovies[tabId].includes(movies[movie].id[movie_id])) {
          browser.tabs.executeScript(tabId, {
            code: "filmposters = document.body.getElementsByClassName('" + className + "'); \n" +
              "filmposters[" + movies[movie].id[movie_id] + "].className = filmposters[" + movies[movie].id[movie_id] + "].className + ' film-not-streamed';",
            allFrames: false
          });
        }
      }
    }

    // short delay for the overview page, needs to reload intern javascript
    if (tab.url.includes('letterboxd.com/films/')) {
      setTimeout(function () {
        fadeUnstreamedMovies(tabId, movies);
      }, 500);
    }

    // if there are unsolved requests left: solve them
    if (Object.keys(unsolvedRequests[tabId]).length !== 0) {
      if (isNaN(unsolvedRequestsDelay)) {
        unsolvedRequestsDelay = 10000;
      }

      // but first wait for a delay to limit the traffic
      setTimeout(function () {
        var movies = JSON.parse(JSON.stringify(unsolvedRequests[tabId]));
        unsolvedRequests[tabId] = {};
        checkMovieAvailability(tabId, movies);
      }, unsolvedRequestsDelay);
    }
  });
}

/**
 * Inserts a content script to unfade all movies on Letterboxd.
 *
 * @param tabId - The tabId to operate in.
 */
function unfadeAllMovies(tabId) {
  browser.tabs.get(tabId, (tab) => {
    var className = '';
    if (tab.url.includes('watchlist')) {
      className = 'poster-container';
    } else {
      className = 'film-poster';
    }

    browser.tabs.executeScript(tabId, {
      code: "filmposters = document.body.getElementsByClassName('" + className + "'); \n" +
        "for(poster in filmposters) { \n" +
        "  if(filmposters[poster].hasOwnProperty('className')) { \n" +
        "    filmposters[poster].className = filmposters[poster].className.replace(' film-not-streamed', ''); \n" +
        "  } \n" +
        "}",
      allFrames: false
    });
  });
}

/**
 * Inserts a content script to unfade all currently faded movies in Letterboxd.
 *
 * @param tabId - The tabId to operate in.
 * @param movies - The crawled movies.
 */
function unfadeUnstreamedMovies(tabId, movies) {
  browser.tabs.get(tabId, (tab) => {
    var className = '';
    if (tab.url.includes('watchlist')) {
      className = 'poster-container';
    } else {
      className = 'film-poster';
    }
    for (let movie in movies) {
      for (let movie_id in movies[movie].id) {
        if (!availableMovies[tabId].includes(movies[movie].id[movie_id])) {
          browser.tabs.executeScript(tabId, {
            code: "filmposters = document.body.getElementsByClassName('" + className + "'); \n" +
              "filmposters[" + movies[movie].id[movie_id] + "].className = filmposters[" + movies[movie].id[movie_id] + "].className.replace(' film-not-streamed', '');",
            allFrames: false
          });
        }
      }
    }
  });
}
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

"use-strict";

// for compatibility reasons
var browser = chrome;

var provider_id; // e.g. Netflix: 8, Amazon Prime Video: 9

var providers;

var countries;

var country_code; // e.g. German: "de_DE", USA: "en_US"

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
    let countrySet = false;
    let providerSet = false;
    let statusSet = false;

    if(item.hasOwnProperty('country_code')) {
      countrySet = true;
      setCountryCode(item.country_code);
    }
    if(item.hasOwnProperty('provider_id')) {
      providerSet = true;
      setProviderId(item.provider_id);
    }
    if(item.hasOwnProperty('filterStatus')) {
      statusSet = true;
      setFilterStatus(item.filterStatus);
    }

    if((!countrySet) || (!providerSet) || (!statusSet)) {
      loadDefaultSettings(countrySet, providerSet, statusSet);
    }
  }

  function loadDefaultSettings(countrySet, providerSet, statusSet) {
    // load default settings
    loadJSON("settings/default.json", function (response) {
      // Parse JSON string into object
      response = JSON.parse(response);
      // set the intern settings
      if(!providerSet) {
        setProviderId(response.provider_id);
      }
      if(!countrySet) {
        setCountryCode(response.country_code);
      }
      if(!statusSet) {
        setFilterStatus(response.filterStatus);
      }
    });
  }

  // load TMDb key
  loadJSON("settings/api.json", function(response) {
    // Parse JSON string into object
    response = JSON.parse(response);
    tmdb_key = response.tmdb;
  });

  // load provider list
  loadJSON("streaming-providers/providers.json", function(response) {
    // Parse JSON string into object
    providers = JSON.parse(response);
  });

  // load country list
  loadJSON("streaming-providers/countries.json", function(response) {
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
    if (xobj.readyState == 4 && xobj.status == "200") {
      // Required use of an anonymous callback as .open will NOT return a value but simply returns undefined in asynchronous mode
      callback(xobj.responseText);
    }
  };
  xobj.send(null);
};

/**
 * Stores the settings in localStorage.
 *
 * @param {string} country_code - The currently set country code to store.
 * @param {int} provider_id - The currently set provider id to store.
 */
function storeSettings(country_code, provider_id, filterStatus) {
  browser.storage.local.set({
    country_code: country_code,
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

  var param = eng_title.replace(' ', '+');
  var title_rsp = '';
  var rsp = "";
  var original_title = '';
  var found_perfect_match = false;

  var xhttp = new XMLHttpRequest();

  xhttp.open('GET', "https://apis.justwatch.com/content/titles/" + country_code + "/popular?body=%7B%22age_certifications%22:null,%22content_types%22:null,%22genres%22:null,%22languages%22:null,%22max_price%22:null,%22min_price%22:null,%22page%22:1,%22page_size%22:30,%22presentation_types%22:null,%22providers%22:null,%22query%22:%22" + param + "%22,%22release_year_from%22:null,%22release_year_until%22:null,%22scoring_filter_types%22:null,%22timeline_type%22:null%7D", true);

  xhttp.send();

  xhttp.onreadystatechange = function () {
    if (xhttp.readyState === 4 && xhttp.status === 200) {
      rsp = JSON.parse(xhttp.response);
      found_perfect_match = getOffersWithReleaseYear(tabId, rsp, movie_letterboxd_id, eng_title, movie_release_year);

      if (found_perfect_match) {
        checkCounter[tabId]++;

        if (checkCounter[tabId] === Object.keys(crawledMovies[tabId]).length) {
          fadeUnstreamedMovies(tabId, crawledMovies[tabId]);
        }
      } else {
        found_perfect_match = false;
        param = eng_title.replace(' ', '%20');

        xhttp.open('GET', "https://api.themoviedb.org/3/search/movie?api_key=" + getAPIKey() + "&query=" + param, true);

        xhttp.send();

        xhttp.onreadystatechange = function () {
          if (xhttp.readyState === 4 && xhttp.status === 200) {
            title_rsp = JSON.parse(xhttp.response);

            var rslt = getOriginalTitleWithReleaseYear(tabId, title_rsp, eng_title, movie_release_year);
            found_perfect_match = rslt.found_perfect_match;

            if(found_perfect_match) {
              original_title = rslt.original_title;
            }

            if (!found_perfect_match) {
              original_title = getOriginalTitleWithoutExactReleaseYear(tabId, title_rsp, eng_title, movie_release_year);
            }

            found_perfect_match = false;

            param = eng_title.replace(' ', '+');

            xhttp = new XMLHttpRequest();

            xhttp.open('GET', "https://apis.justwatch.com/content/titles/" + country_code + "/popular?body=%7B%22age_certifications%22:null,%22content_types%22:null,%22genres%22:null,%22languages%22:null,%22max_price%22:null,%22min_price%22:null,%22page%22:1,%22page_size%22:30,%22presentation_types%22:null,%22providers%22:null,%22query%22:%22" + param + "%22,%22release_year_from%22:null,%22release_year_until%22:null,%22scoring_filter_types%22:null,%22timeline_type%22:null%7D", true);

            xhttp.send();

            xhttp.onreadystatechange = function () {
              if (xhttp.readyState === 4 && xhttp.status === 200) {
                rsp = JSON.parse(xhttp.response);
                found_perfect_match = getOffersWithReleaseYear(tabId, rsp, movie_letterboxd_id, original_title, movie_release_year);

                if (!found_perfect_match) {
                  getOffersWithoutExactReleaseYear(tabId, rsp, movie_letterboxd_id, original_title, movie_release_year);
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
    if (rsp.items[item].original_title.toLowerCase() === title.toLowerCase() && rsp.items[item].original_release_year == movie_release_year) {
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
    if (rsp.items[item].original_title.toLowerCase() === title.toLowerCase() &&
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
 * Returns the original movie title for a given English one and a corresponding release year.
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} title_rsp - The response from the ajax request.
 * @param {string} eng_title - The English movie title.
 * @param {int} movie_release_year - The movie's release year.
 * @returns {{original_title: string, found_perfect_match: boolean}} - An object containing the original title and if this was a perfect match (eng_title and movie_release_year match up).
 */
function getOriginalTitleWithReleaseYear(tabId, title_rsp, eng_title, movie_release_year) {
  for (let item in title_rsp.results) {
    if (title_rsp.results[item].title.toLowerCase() === eng_title.toLowerCase() && title_rsp.results[item].release_date.includes(movie_release_year)) {
      return {
        original_title: title_rsp.results[item].original_title,
        found_perfect_match: true
      };
    }
  }

  return {
    original_title: "",
    found_perfect_match: false
  };
}

/**
 * Returns the original movie title for a given English one and a for the given movie released in movie_release_year-1 or movie_release_year+1 or if the movie_release_year is invalid (=-1).
 *
 * @param {int} tabId - The tabId to operate in.
 * @param {object} title_rsp - The response from the ajax request.
 * @param {string} eng_title - The English movie title.
 * @param {int} movie_release_year - The movie's release year.
 * @returns {string} - The original movie title (if found) or an empty string if not.
 */
function getOriginalTitleWithoutExactReleaseYear(tabId, title_rsp, eng_title, movie_release_year) {
  for (let item in title_rsp.results) {
    if (title_rsp.results[item].title.toLowerCase() === eng_title.toLowerCase()
      && ((movie_release_year === -1) || (title_rsp.results[item].release_date.includes(movie_release_year - 1)) || (title_rsp.results[item].release_date.includes(movie_release_year + 1)))) {
      return title_rsp.results[item].original_title;
    }
  }

  return "";
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
function getCountryCode() {
  return country_code;
}

/**
 * To change the provider_id out of the popup.
 *
 * @param {int} id - The new provider_id.
 */
function setProviderId(id) {
  provider_id = Number(id);
  storeSettings(country_code, provider_id, filterStatus);
  //reloadMovieFilter();
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
  storeSettings(country_code, provider_id, filterStatus);
}

/**
 * To change the country_code out of the settings.
 *
 * @param {string} code - The new country_code.
 */
function setCountryCode(code) {
  country_code = code;
  storeSettings(country_code, provider_id, filterStatus);
  //reloadMovieFilter();
}

/**
 * Called to force the filters to reload with the new provider_id.
 */
function reloadMovieFilter() {
  browser.tabs.query({}, reloadFilterInTab);

  function reloadFilterInTab(tabs) {
    for (let tab of tabs) {
      tabId = tab.id;
      changeInfo = {
        status: 'complete'
      };
      tabInfo = {
        url: tab.url
      };

      //unfadeUnstreamedMovies(tabId, crawledMovies[tabId]);
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
  if(filterStatus) {
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
    if(request.message_type === 'movie-titles') {
      crawledMovies[tabId] = request.message_content;
      if(Object.keys(crawledMovies[tabId]).length === 0) {
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
  if(filterStatus) {
    prepareLetterboxdForFading(tabId);
    for(let movie in movies) {
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
    if(tab.url.includes('watchlist')) {
      className = 'poster-container';
    } else {
      className = 'film-poster';
    }

    for(let movie in movies) {
      for (let movie_id in movies[movie].id) {
        if(!availableMovies[tabId].includes(movies[movie].id[movie_id])) {
          browser.tabs.executeScript(tabId, {
            code: "filmposters = document.body.getElementsByClassName('" + className + "'); \n" +
              "filmposters[" + movies[movie].id[movie_id] + "].className = filmposters[" + movies[movie].id[movie_id] + "].className + ' film-not-streamed';",
            allFrames: false
          });
        }
      }
    }

    // short delay for the overview page, needs to reload intern javascript
    if(tab.url.includes('letterboxd.com/films/')) {
      setTimeout(function () {
        fadeUnstreamedMovies(tabId, movies);
      }, 500);
    }

    // if there are unsolved requests left: solve them
    if(Object.keys(unsolvedRequests[tabId]).length !== 0) {
      if(isNaN(unsolvedRequestsDelay)) {
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
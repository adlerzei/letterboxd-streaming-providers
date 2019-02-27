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

//for compatibility reasons
var browser = chrome;

var provider_id = 8; //netflix: 8, amazon prime: 9

var providers;

var countries;

var country_code = "de_DE";

var availableMovies = {};
var crawledMovies = {};
var unsolvedRequests = {};
var unsolvedRequestsDelay = {};

var checkCounter = {};

const onStartUp = async () => {
  loadJSON("streaming-providers/providers.json", function(response) {
    // Parse JSON string into object
    providers = JSON.parse(response);
  });

  loadJSON("streaming-providers/countries.json", function(response) {
    // Parse JSON string into object
    countries = JSON.parse(response);
  });
};

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

onStartUp();

/**
 * Checks if a movie is available and adds it to availableMovies[tabId]
 *
 * @param {object} toFind - An object, which contains the movie title, the release year and the Letterboxd-intern array id.
 * @param {int} tabId - The tabId of the tab, in which Letterboxd should be filtered.
 * @returns {Promise<void>} - An empty Promise if the API calls worked correctly, else the Promise contains the respective errors.
 * @author Christian Zei
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

        xhttp.open('GET', "https://api.themoviedb.org/3/search/movie?api_key=***REMOVED***&query=" + param, true);

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

function getOffersWithReleaseYear(tabId, rsp, movie_letterboxd_id, title, movie_release_year) {
  for (let item in rsp.items) {
    if (rsp.items[item].original_title.toLowerCase() === title.toLowerCase() && rsp.items[item].original_release_year == movie_release_year) {
      for (let offer in rsp.items[item].offers) {
        if (rsp.items[item].offers[offer].monetization_type === 'flatrate' && rsp.items[item].offers[offer].provider_id === provider_id) {
          availableMovies[tabId].push(movie_letterboxd_id);
          break;
        }
      }
      return true;
    }
  }
  return false;
}

function getOffersWithoutExactReleaseYear(tabId, rsp, movie_letterboxd_id, title, movie_release_year) {
  for (let item in rsp.items) {
    if (rsp.items[item].original_title.toLowerCase() === title.toLowerCase() &&
      ((rsp.items[item].original_release_year == movie_release_year - 1)) || (rsp.items[item].original_release_year == movie_release_year + 1) || (movie_release_year === -1)) {
      for (let offer in rsp.items[item].offers) {
        if (rsp.items[item].offers[offer].monetization_type === 'flatrate' && rsp.items[item].offers[offer].provider_id === provider_id) {
          availableMovies[tabId].push(movie_letterboxd_id);
          break;
        }
      }
      break;
    }
  }
}


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

function getOriginalTitleWithoutExactReleaseYear(tabId, title_rsp, eng_title, movie_release_year) {
  for (let item in title_rsp.results) {
    if (title_rsp.results[item].title.toLowerCase() === eng_title.toLowerCase()
      && ((movie_release_year === -1) || (title_rsp.results[item].release_date.includes(movie_release_year - 1)) || (title_rsp.results[item].release_date.includes(movie_release_year + 1)))) {
      return title_rsp.results[item].original_title;
    }
  }

  return "";
}

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
 * To change the provider_id out of the popup
 *
 * @param {int} id - the new provider_id
 */
function setProviderId(id) {
  provider_id = id;
}

/**
 * To change the country_code out of the settings
 *
 * @param {string} code - the new country_code
 */
function setCountryCode(code) {
  country_code = code;
}

/**
 * Called from inside the popup to force the filters to reload with the new provider_id
 */
function reloadMovieFilter() {
  var querying = browser.tabs.query({});

  function reloadFilterInTab(tabs) {
    for (let tab of tabs) {
      tabId = tab.id;
      changeInfo = {
        status: 'complete'
      };
      tabInfo = {
        url: tab.url
      };

      unfadeUnstreamedMovies(tabId, crawledMovies[tabId]);
      checkForLetterboxd(tabId, changeInfo, tabInfo);
    }
  }

  function onError(error) {
    console.log(`Error: ${error}`);
  }

  querying.then(reloadFilterInTab, onError);
}

function checkForLetterboxd(tabId, changeInfo, tabInfo) {
  if(changeInfo.hasOwnProperty('status') && changeInfo.status === 'complete') {
    var url = tabInfo.url;
    if(url.includes("://letterboxd.com/") || url.includes("://www.letterboxd.com/") ) {
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

function checkMovieAvailability(tabId, movies) {
  prepareLetterboxdForFading(tabId);
  for(let movie in movies) {
    var inc = isIncluded(tabId, {
      title: movie,
      year: movies[movie].year,
      id: movies[movie].id
    });
  }
}

function prepareLetterboxdForFading(tabId) {
  browser.tabs.insertCSS(tabId, {
      file: "./style/hideunstreamed.css"
  });

  browser.tabs.executeScript(tabId, {
      code: "document.body.className = document.body.className + ' hide-films-unstreamed';",
      allFrames: false
  });
}

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
      if(!availableMovies[tabId].includes(movies[movie].id)) {
        browser.tabs.executeScript(tabId, {
          code: "filmposters = document.body.getElementsByClassName('" + className + "'); \n" +
            "filmposters[" + movies[movie].id + "].className = filmposters[" + movies[movie].id + "].className + ' film-not-streamed';",
          allFrames: false
        });
      }
    }

    if(Object.keys(unsolvedRequests[tabId]).length !== 0) {
      if(isNaN(unsolvedRequestsDelay)) {
        unsolvedRequestsDelay = 10000;
      }

      setTimeout(function () {
        var movies = unsolvedRequests[tabId].clone();
        unsolvedRequests[tabId] = {};
        checkMovieAvailability(tabId, movies);
      }, unsolvedRequestsDelay);
    }
  });
}

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

function unfadeUnstreamedMovies(tabId, movies) {
  browser.tabs.get(tabId, (tab) => {
    var className = '';
    if (tab.url.includes('watchlist')) {
      className = 'poster-container';
    } else {
      className = 'film-poster';
    }
    for (let movie in movies) {
      if (!availableMovies[tabId].includes(movies[movie].id)) {
        browser.tabs.executeScript(tabId, {
          code: "filmposters = document.body.getElementsByClassName('" + className + "'); \n" +
            "filmposters[" + movies[movie].id + "].className = filmposters[" + movies[movie].id + "].className.replace(' film-not-streamed', '');",
          allFrames: false
        });
      }
    }
  });
}
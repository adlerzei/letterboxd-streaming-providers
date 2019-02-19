"use-strict";

//for compatibility reasons
var browser = chrome;

var provider_id = 8; //netflix: 8, amazon prime: 9

var providers;

var availableMovies = [];

const onStartUp = async () => {
  loadJSON("streaming-services/services.json", function(response) {
    // Parse JSON string into object
    providers = JSON.parse(response);
  });
};

const loadJSON = (path, callback) => {
  var xobj = new XMLHttpRequest();
  xobj.overrideMimeType("application/json");
  xobj.open('GET', path, true); // Replace 'my_data' with the path to your file
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
 * Checks if a movie is available and adds it to availableMovies
 *
 * @param {string} toFind - The name of the movie, for which the database should be queried.
 * @returns {Promise<void>} - An empty Promise if the API calls worked correctly, else the Promise contains the respective errors.
 * @author Christian Zei
 */
async function isIncluded(toFind) {
  //e.g. toFind = 'Suck me Shakespeer'
  var eng_title = toFind.title;
  var movie_release_year = toFind.year;

  var param = eng_title.replace(' ', '%20');

  var title_rsp = '';
  var rsp = "";
  var original_title = '';

  var xhttp = new XMLHttpRequest();

  xhttp.open('GET', "https://api.themoviedb.org/3/search/movie?api_key=***REMOVED***&query=" + param, true);

  xhttp.send();

  xhttp.onreadystatechange = function () {
    if (xhttp.readyState === 4 && xhttp.status === 200) {
      title_rsp = JSON.parse(xhttp.response);

      for (let item in title_rsp.results) {
        if (title_rsp.results[item].title.toLowerCase() === eng_title.toLowerCase()) {
          original_title = title_rsp.results[item].original_title
        }
      }

      param = toFind.replace(' ', '+');

      xhttp = new XMLHttpRequest();

      xhttp.open('GET', "https://apis.justwatch.com/content/titles/de_DE/popular?body=%7B%22age_certifications%22:null,%22content_types%22:null,%22genres%22:null,%22languages%22:null,%22max_price%22:null,%22min_price%22:null,%22page%22:1,%22page_size%22:30,%22presentation_types%22:null,%22providers%22:null,%22query%22:%22" + param + "%22,%22release_year_from%22:null,%22release_year_until%22:null,%22scoring_filter_types%22:null,%22timeline_type%22:null%7D", true);

      xhttp.send();

      xhttp.onreadystatechange = function () {
        if (xhttp.readyState === 4 && xhttp.status === 200) {
          rsp = JSON.parse(xhttp.response);

          for (let item in rsp.items) {
            if (rsp.items[item].original_title.toLowerCase() === original_title.toLowerCase()) {
              for (let offer in rsp.items[item].offers) {
                if (rsp.items[item].offers[offer].monetization_type === 'flatrate' && rsp.items[item].offers[offer].provider_id === provider_id) {
                  availableMovies.push(toFind);
                }
              }
            }
          }
        }
      }
    }
  }
}

function getFilmsFromLetterboxd() {
  browser.tabs.executeScript({
    file: "scripts/getFilmsFromLetterboxd.js",
    allFrames: false
  })
}

browser.runtime.onMessage.addListener(handleMessage);

function handleMessage(request, sender, sendResponse) {
  if (request.hasOwnProperty('message_type')) {
    if(request.message_type === 'movie-titles') {
      checkMovieAvailability(request.message_content);
    }
  }
}

function checkMovieAvailability(movies) {
  for(let movie in movies) {
    var inc = isIncluded({
      title: movie,
      year: movies[movie]
    })
  }
}



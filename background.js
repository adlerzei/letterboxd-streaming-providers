"use strict";

//for compatibility reasons
var browser = chrome;

/**
 * Returns a
 *
 * @param {string} toFind - The name of the movie, for which the database should be queried.
 * @returns {Promise<void>} - An empty Promise if the API calls worked correctly, else the Promise contains the respective errors.
 * @author Christian Zei
 */
async function isIncluded(toFind) {
  //e.g. toFind = 'Suck me Shakespeer'
  var eng_title = toFind;

  var param = eng_title.replace(' ', '%20');

  var title_rsp = '';
  var rsp = "";
  var original_title = '';

  var xhttp = new XMLHttpRequest();

  xhttp.open('GET', "https://api.themoviedb.org/3/search/movie?api_key=0264d085d68e6041e7166f04e6c6115e&query=" + param, true);

  xhttp.send();

  xhttp.onreadystatechange = function () {
    if(xhttp.readyState === 4 && xhttp.status === 200) {
      title_rsp = JSON.parse(xhttp.response);

      for(let item in title_rsp.results) {
        if(title_rsp.results[item].title.toLowerCase() === eng_title.toLowerCase()) {
          original_title = title_rsp.results[item].original_title
        }
      }

      param = toFind.replace(' ', '+');

      xhttp = new XMLHttpRequest();

      xhttp.open('GET', "https://apis.justwatch.com/content/titles/de_DE/popular?body=%7B%22age_certifications%22:null,%22content_types%22:null,%22genres%22:null,%22languages%22:null,%22max_price%22:null,%22min_price%22:null,%22page%22:1,%22page_size%22:30,%22presentation_types%22:null,%22providers%22:null,%22query%22:%22" + param + "%22,%22release_year_from%22:null,%22release_year_until%22:null,%22scoring_filter_types%22:null,%22timeline_type%22:null%7D", true);

      xhttp.send();

      xhttp.onreadystatechange = function () {
        if(xhttp.readyState === 4 && xhttp.status === 200) {
          rsp = JSON.parse(xhttp.response);

          for(let item in rsp.items) {
            if(rsp.items[item].original_title.toLowerCase() === original_title.toLowerCase()) {
              for (let offer in rsp.items[item].offers) {
                console.log(rsp.items[item].offers[offer]);
              }
            }
          }
        }
      }
    }
  }
}



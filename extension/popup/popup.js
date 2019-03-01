"use strict";

//for compatibility reasons
var browser = chrome;

var background = browser.extension.getBackgroundPage();

var countries = background.getCountries();
var providers = background.getProviders();
var provider_id = background.getProviderId();
var country_code = background.getCountryCode();

var country_list = document.getElementById('CountryList');
var fragment = document.createDocumentFragment();
var keys = Object.keys(countries).sort(function (a, b) {
  return ('' + countries[a].name).localeCompare(countries[b].name);
});
for(let country in keys) {
  country = keys[country];
  var opt = document.createElement('option');
  opt.innerHTML=country;
  opt.value=country;
  opt.label=countries[country].name;
  if(countries[country].code === country_code) {
    opt.selected="selected";
  }
  fragment.appendChild(opt);
}
country_list.appendChild(fragment);

var provider_list = document.getElementById('ProviderList');

function appendOptionsToProviderList() {
  provider_list.options.length = 0;
  fragment = document.createDocumentFragment();
  var keys = Object.keys(providers).sort(function (a, b) {
    return ('' + providers[a].name).localeCompare(providers[b].name);
  });
  for (let provider in keys) {
    provider = keys[provider];
    var country = country_list.options[country_list.selectedIndex].value;
    if (providers[provider].countries.includes(country)) {
      var opt = document.createElement('option');
      opt.innerHTML = provider;
      opt.value = provider;
      opt.label = providers[provider].name;
      if (providers[provider].provider_id === provider_id) {
        opt.selected = "selected";
      }
      fragment.appendChild(opt);
    }
  }
  provider_list.appendChild(fragment);
}

appendOptionsToProviderList();

provider_list.addEventListener("change", changeProviderId);

function changeProviderId() {
  let id = provider_list.options[provider_list.selectedIndex].value;
  if(typeof providers !== 'undefined' && providers.hasOwnProperty(id) && providers[id].hasOwnProperty('provider_id')) {
    provider_id = providers[id].provider_id;
    background.setProviderId(provider_id);
  }
}

country_list.addEventListener("change", changeCountryCode);

function changeCountryCode() {
  let code = country_list.options[country_list.selectedIndex].value;
  if(typeof countries !== 'undefined' && countries.hasOwnProperty(code) && countries[code].hasOwnProperty('code')) {
    country_code = countries[code].code;
    background.setCountryCode(country_code);
    appendOptionsToProviderList();
  }
}

document.addEventListener('DOMContentLoaded', function () {
  var links = document.getElementsByTagName("a");
  for (var i = 0; i < links.length; i++) {
    (function () {
      var ln = links[i];
      var location = ln.href;
      ln.onclick = function () {
        chrome.tabs.create({active: true, url: location});
      };
    })();
  }
});
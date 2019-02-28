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
for(let country in countries) {
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
  for (let provider in providers) {
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


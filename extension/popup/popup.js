/*!
 *
 *     Copyright (c) 2021 Christian Zei
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

//for compatibility reasons
var browser = chrome;

var background = browser.extension.getBackgroundPage();

var countries = background.getCountries();
var providers = background.getProviders();
var providerId = background.getProviderId();
var justWatchCountryCode = background.getJustWatchCountryCode();
var tmdbCountryCode = background.getTMDBCountryCode();

var countryList = document.getElementById('CountryList');
appendOptionsToCountryList();

var providerList = document.getElementById('ProviderList');
appendOptionsToProviderList();

var filterSwitch = document.getElementById("filterSwitch");
filterSwitch.checked = background.getFilterStatus();

filterSwitch.addEventListener("change", changeFilterSwitch);
providerList.addEventListener("change", changeProviderId);
countryList.addEventListener("change", changeCountryCodes);

/**
 * Appends all countries as option to the countryList select tag.
 */
function appendOptionsToCountryList() {
	var fragment = document.createDocumentFragment();
	var keys = Object.keys(countries).sort(function (a, b) {
		return ('' + countries[a].name).localeCompare(countries[b].name);
	});
	for (let country in keys) {
		country = keys[country];
		if (!countries[country].hasOwnProperty('name') || !countries[country].hasOwnProperty('justwatch_country_code'))
			continue;

		let opt = document.createElement('option');
		opt.innerHTML = countries[country].name; // TODO escape
		opt.value = country;
		opt.label = countries[country].name;
		if (countries[country].justwatch_country_code === justWatchCountryCode) {
			opt.selected = "selected";
		}
		fragment.appendChild(opt);
	}
	countryList.appendChild(fragment);
}

/**
 * Appends all providers from the selected country as option to the providerList select tag.
 *
 * param {string} [defaultProviderName] - The (optional) name of the provider which is selected by default.
 */
function appendOptionsToProviderList(defaultProviderName) {
	providerList.options.length = 0;
	var fragment = document.createDocumentFragment();
	var keys = Object.keys(providers).sort(function (a, b) {
		return ('' + providers[a].name).localeCompare(providers[b].name);
	});
	for (let provider in keys) {
		provider = keys[provider];
		if (!providers[provider].hasOwnProperty('name') || !providers[provider].hasOwnProperty('provider_id'))
			continue;

		var country = countryList.options[countryList.selectedIndex].value;
		if (providers[provider].countries.includes(country)) {
			var opt = document.createElement('option');
			opt.innerHTML = providers[provider].name; // TODO escape
			opt.value = provider;
			opt.label = providers[provider].name;
			if (typeof defaultProviderName === 'undefined') {
				if (providers[provider].provider_id === providerId) {
					opt.selected = "selected";
				}
			} else {
				if (providers[provider].name === defaultProviderName) {
					opt.selected = "selected";
				}
			}
			fragment.appendChild(opt);
		}
	}
	providerList.appendChild(fragment);
}

/**
 * Changes the filter status in the background page.
 */
function changeFilterSwitch() {
	// enable or disable filtering
	background.setFilterStatus(filterSwitch.checked);
	providerList.disabled = (!filterSwitch.checked);
	countryList.disabled = (!filterSwitch.checked);
}

/**
 * Called when the selected item in providerList is changed. Changes the provider_id in the background page.
 */
function changeProviderId() {
	let id = providerList.options[providerList.selectedIndex].value;
	if (typeof providers !== 'undefined' && providers.hasOwnProperty(id) && providers[id].hasOwnProperty('provider_id')) {
		providerId = providers[id].provider_id;
		background.setProviderId(providerId);
	}
}

/**
 * Called when the selected item in countryList is changed. Changes the country codes in the background page and forces the options in providerList to reload.
 */
function changeCountryCodes() {
	let code = countryList.options[countryList.selectedIndex].value;
	if (typeof countries !== 'undefined' && countries.hasOwnProperty(code) && countries[code].hasOwnProperty('justwatch_country_code') && countries[code].hasOwnProperty('tmdb_country_code')) {
		justWatchCountryCode = countries[code].justwatch_country_code;
		tmdbCountryCode = countries[code].tmdb_country_code;
		background.setJustWatchCountryCode(justWatchCountryCode);
		background.setTMDBCountryCode(tmdbCountryCode);
		let defaultProviderId = providerList.options[providerList.selectedIndex].label;
		appendOptionsToProviderList(defaultProviderId);
		changeProviderId();
	}
}

/**
 * Returns the current browser name.
 *
 * @returns {string} - The browser's name.
 */
function getBrowser() {
	// Opera 8.0+
	let isOpera = (!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;

	// Firefox 1.0+
	let isFirefox = typeof InstallTrigger !== 'undefined';

	// Chrome 1 - 71
	let isChrome = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);

	return isOpera ? 'Opera' :
		isFirefox ? 'Firefox' :
			isChrome ? 'Chrome' :
				"Don't know";
}

if (getBrowser() !== 'Firefox') {
	// for opening the hyperlink in the popup in a new tab
	document.addEventListener('DOMContentLoaded', function () {
		var links = document.getElementsByTagName("a");
		for (var i = 0; i < links.length; i++) {
			(function () {
				var ln = links[i];
				var location = ln.href;
				ln.onclick = function () {
					browser.tabs.create({
						active: true,
						url: location
					});
				};
			})();
		}
	});
}
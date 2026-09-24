"use strict";

//for compatibility reasons
var browser = chrome;

var countries = {};
var providers = {};
var selectedProviderIds = [];
var countryCode = '';
var filterStatus = false;

var countryList = document.getElementById('CountryList');
var providerList = document.getElementById('ProviderList');
var filterSwitch = document.getElementById("filterSwitch");

// load stored settings from localStorage
browser.storage.local.get((items) => {
	parseSettings(items);

	// load cached variables from sessionStorage
	browser.storage.session.get((items) => {
		parseCache(items);
		
		appendOptionsToCountryList();
		
		appendOptionsToProviderList();
		
		filterSwitch.checked = filterStatus;
		
		// Set initial disabled state for selects
		countryList.disabled = !filterStatus;
		providerList.disabled = !filterStatus;
		
		filterSwitch.addEventListener("change", changeFilterSwitch);
		providerList.addEventListener("change", changeSelectedProviderIds);
		countryList.addEventListener("change", changeCountryCode);
	});
});

/**
 * Appends all countries as option to the countryList select tag.
 */
function appendOptionsToCountryList() {
	var fragment = document.createDocumentFragment();
	var keys = Object.keys(countries).sort(function (a, b) {
		return ('' + countries[a].name).localeCompare(countries[b].name);
	});
	for (const country of keys) {
		if (!countries[country].hasOwnProperty('name') || !countries[country].hasOwnProperty('code'))
			continue;

		let opt = document.createElement('option');
		opt.textContent = countries[country].name;
		opt.value = country;
		opt.label = countries[country].name;
		if (countries[country].code === countryCode) {
			opt.selected = "selected";
		}
		fragment.appendChild(opt);
	}
	countryList.appendChild(fragment);
}

/**
 * Appends all providers from the selected country as option to the providerList select tag.
 * A provider is pre-selected if its provider_id is part of the currently selected provider IDs,
 * so selections carry over across a country change as long as the provider is offered there too.
 */
function appendOptionsToProviderList() {
	providerList.options.length = 0;
	let fragment = document.createDocumentFragment();
	let keys = Object.keys(providers).sort(function (a, b) {
		return ('' + providers[a].name).localeCompare(providers[b].name);
	});
	for (const provider of keys) {
		if (!providers[provider].hasOwnProperty('name') || !providers[provider].hasOwnProperty('provider_id'))
			continue;

		let country = countryList.options[countryList.selectedIndex].value;
		if (providers[provider].countries.includes(country)) {
			let opt = document.createElement('option');
			opt.textContent = providers[provider].name;
			opt.value = provider;
			opt.label = providers[provider].name;
			if (selectedProviderIds.includes(providers[provider].provider_id)) {
				opt.selected = "selected";
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
	filterStatus = filterSwitch.checked;
	browser.storage.local.set({filter_status: filterSwitch.checked});
	providerList.disabled = (!filterSwitch.checked);
	countryList.disabled = (!filterSwitch.checked);
}

/**
 * Called when the selection in providerList is changed. Stores the newly selected provider IDs.
 * Does nothing if the list has no options yet (e.g. the provider cache hasn't loaded),
 * so we never overwrite a stored selection with an empty one.
 */
function changeSelectedProviderIds() {
	if (providerList.options.length === 0) {
		return;
	}

	let newSelectedProviderIds = [];
	if (typeof providers !== 'undefined') {
		var opt;
		var id;
		for (var i = 0; i < providerList.options.length; i++) {
			opt = providerList.options[i];
			id = opt.value;
			if (opt.selected && providers.hasOwnProperty(id) && providers[id].hasOwnProperty('provider_id')) {
				newSelectedProviderIds.push(providers[id].provider_id);
			}
		}
	}
	selectedProviderIds = newSelectedProviderIds;
	browser.storage.local.set({selected_provider_ids: selectedProviderIds});
}

/**
 * Called when the selected item in countryList is changed.
 * Changes the country code in the background page and forces the options in providerList to reload.
 */
function changeCountryCode() {
	let code = countryList.options[countryList.selectedIndex].value;
	if (typeof countries !== 'undefined' && countries.hasOwnProperty(code)
		&& countries[code].hasOwnProperty('code')) {
		countryCode = countries[code].code;

		browser.storage.local.set({
			country_code: countryCode
		});

		appendOptionsToProviderList();
		changeSelectedProviderIds();
	}
}

/**
 * Parses settings from storage items.
 * Falls back to the legacy single `provider_id` setting if `selected_provider_ids` hasn't been
 * migrated yet; the worker performs the actual migration write.
 *
 * @param {object} items - Storage items containing settings.
 */
function parseSettings(items) {
	countryCode = items.hasOwnProperty('country_code') ? items.country_code : 'US';
	if (items.hasOwnProperty('selected_provider_ids')) {
		selectedProviderIds = items.selected_provider_ids;
	} else if (items.hasOwnProperty('provider_id')) {
		selectedProviderIds = [items.provider_id];
	} else {
		selectedProviderIds = [8];
	}
	filterStatus = items.hasOwnProperty('filter_status') ? items.filter_status : false;
}

function parseCache(items) {
	providers = items.hasOwnProperty('providers') ? items.providers : {};
	countries = items.hasOwnProperty('countries') ? items.countries : {};
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

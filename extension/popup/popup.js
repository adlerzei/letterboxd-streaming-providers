"use strict";

//for compatibility reasons
var browser = chrome;

var countries = {};
var providers = {};
var selectedProviderIds = [];
var countryCode = '';
var filterStatus = false;

var countryList = document.getElementById('CountryList');
var providerBox = document.getElementById('ProviderBox');
var providerList = document.getElementById('ProviderList');
var providerSearch = document.getElementById('ProviderSearch');
var selectionCount = document.getElementById('SelectionCount');
var clearSelectionButton = document.getElementById('ClearSelection');
var filterSwitch = document.getElementById("filterSwitch");

// load stored settings from localStorage; only these keys, to skip deserializing the TMDb cache blob
browser.storage.local.get(['country_code', 'selected_provider_ids', 'provider_id', 'filter_status', 'providers', 'countries'], (items) => {
	parseSettings(items);

	// load cached variables from sessionStorage
	browser.storage.session.get((items) => {
		parseCache(items);
		
		appendOptionsToCountryList();
		
		appendOptionsToProviderList();
		
		filterSwitch.checked = filterStatus;

		// Set initial disabled state for the country select and the provider picker
		setControlsDisabled(!filterStatus);

		filterSwitch.addEventListener("change", changeFilterSwitch);
		providerList.addEventListener("click", onProviderListClick);
		providerList.addEventListener("keydown", onProviderListKeydown);
		providerSearch.addEventListener("input", applyProviderSearch);
		clearSelectionButton.addEventListener("click", clearSelectedProviderIds);
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
		if (!Object.prototype.hasOwnProperty.call(countries[country], 'name') || !Object.prototype.hasOwnProperty.call(countries[country], 'code'))
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
 * Fills the providerList with one row per provider offered in the selected country.
 * A row is marked selected if its provider_id is part of the currently selected provider IDs.
 * Selections of providers not offered in this country are kept in storage, so they come back
 * when switching back to a country that offers them.
 */
function appendOptionsToProviderList() {
	providerList.replaceChildren();
	let fragment = document.createDocumentFragment();
	let keys = Object.keys(providers).sort(function (a, b) {
		return ('' + providers[a].name).localeCompare(providers[b].name);
	});
	let country = countryList.selectedIndex >= 0 ? countryList.options[countryList.selectedIndex].value : '';
	for (const provider of keys) {
		if (!Object.prototype.hasOwnProperty.call(providers[provider], 'name') || !Object.prototype.hasOwnProperty.call(providers[provider], 'provider_id'))
			continue;

		if (providers[provider].countries.includes(country)) {
			let row = document.createElement('div');
			row.className = 'provider-row';
			row.setAttribute('role', 'option');
			row.textContent = providers[provider].name;
			row.dataset.providerId = providers[provider].provider_id;
			row.setAttribute('aria-selected', String(selectedProviderIds.includes(providers[provider].provider_id)));
			row.tabIndex = filterStatus ? 0 : -1;
			fragment.appendChild(row);
		}
	}

	let empty = document.createElement('div');
	empty.className = 'provider-empty';
	empty.textContent = 'No matches';
	empty.hidden = true;
	fragment.appendChild(empty);

	providerList.appendChild(fragment);
	applyProviderSearch();
}

/**
 * Selects or deselects a provider and stores the new selection.
 *
 * @param {HTMLElement} row - The providerList row that was toggled.
 */
function toggleProvider(row) {
	let id = Number(row.dataset.providerId);
	if (selectedProviderIds.includes(id)) {
		selectedProviderIds = selectedProviderIds.filter(selectedId => selectedId !== id);
	} else {
		selectedProviderIds = [...selectedProviderIds, id];
	}

	row.setAttribute('aria-selected', String(selectedProviderIds.includes(id)));
	browser.storage.local.set({selected_provider_ids: selectedProviderIds});
	updateSelectionCount();
}

function onProviderListClick(event) {
	let row = event.target.closest('.provider-row');
	if (row && filterStatus) {
		toggleProvider(row);
	}
}

function onProviderListKeydown(event) {
	let row = event.target.closest('.provider-row');
	if (row && filterStatus && (event.key === ' ' || event.key === 'Enter')) {
		event.preventDefault();
		toggleProvider(row);
	}
}

/**
 * Hides the providerList rows that don't match the search text.
 * Only changes what is shown; the selection stays as it is.
 */
function applyProviderSearch() {
	let query = providerSearch.value.trim().toLowerCase();
	let anyVisible = false;
	for (const row of providerList.querySelectorAll('.provider-row')) {
		row.hidden = !row.textContent.toLowerCase().includes(query);
		anyVisible = anyVisible || !row.hidden;
	}

	let empty = providerList.querySelector('.provider-empty');
	if (empty) {
		empty.hidden = anyVisible;
	}
	updateSelectionCount();
}

/**
 * Shows how many of the providers offered in the selected country are selected,
 * including rows hidden by the search.
 */
function updateSelectionCount() {
	let count = providerList.querySelectorAll('.provider-row[aria-selected="true"]').length;
	selectionCount.textContent = count + ' selected';
	clearSelectionButton.disabled = !filterStatus || selectedProviderIds.length === 0;
}

/**
 * Deselects all providers and stores the empty selection.
 */
function clearSelectedProviderIds() {
	selectedProviderIds = [];
	browser.storage.local.set({selected_provider_ids: selectedProviderIds});
	for (const row of providerList.querySelectorAll('.provider-row')) {
		row.setAttribute('aria-selected', 'false');
	}
	updateSelectionCount();
}

/**
 * Enables or disables the country select and the provider picker.
 *
 * @param {boolean} disabled - Whether the controls should be disabled.
 */
function setControlsDisabled(disabled) {
	countryList.disabled = disabled;
	providerSearch.disabled = disabled;
	providerBox.classList.toggle('disabled', disabled);
	providerList.setAttribute('aria-disabled', String(disabled));
	for (const row of providerList.querySelectorAll('.provider-row')) {
		row.tabIndex = disabled ? -1 : 0;
	}
	updateSelectionCount();
}

/**
 * Changes the filter status in the background page.
 */
function changeFilterSwitch() {
	// enable or disable filtering
	filterStatus = filterSwitch.checked;
	browser.storage.local.set({filter_status: filterSwitch.checked});
	setControlsDisabled(!filterSwitch.checked);
}

/**
 * Called when the selected item in countryList is changed.
 * Changes the country code in the background page and forces the rows in providerList to reload.
 */
function changeCountryCode() {
	let code = countryList.options[countryList.selectedIndex].value;
	if (typeof countries !== 'undefined' && Object.prototype.hasOwnProperty.call(countries, code)
		&& Object.prototype.hasOwnProperty.call(countries[code], 'code')) {
		countryCode = countries[code].code;

		browser.storage.local.set({
			country_code: countryCode
		});

		appendOptionsToProviderList();
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
	countryCode = Object.prototype.hasOwnProperty.call(items, 'country_code') ? items.country_code : 'US';
	if (Object.prototype.hasOwnProperty.call(items, 'selected_provider_ids')) {
		selectedProviderIds = items.selected_provider_ids;
	} else if (Object.prototype.hasOwnProperty.call(items, 'provider_id')) {
		selectedProviderIds = [items.provider_id];
	} else {
		selectedProviderIds = [8];
	}
	filterStatus = Object.prototype.hasOwnProperty.call(items, 'filter_status') ? items.filter_status : false;
}

function parseCache(items) {
	providers = Object.prototype.hasOwnProperty.call(items, 'providers') ? items.providers : {};
	countries = Object.prototype.hasOwnProperty.call(items, 'countries') ? items.countries : {};
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

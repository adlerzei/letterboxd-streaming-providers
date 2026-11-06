"use strict";

//for compatibility reasons
const browser = chrome;

let countries = {};
let providers = {};
let selectedProviderIds = [];
let countryCode = '';
let filterStatus = false;

const filterSwitch = document.getElementById('filterSwitch');
const countryList = document.getElementById('CountryList');
const providerBox = document.getElementById('ProviderBox');
const providerList = document.getElementById('ProviderList');
const providerSearch = document.getElementById('ProviderSearch');
const selectionCount = document.getElementById('SelectionCount');
const clearSelectionButton = document.getElementById('ClearSelection');

// load stored settings from localStorage; only these keys, to skip deserializing the TMDb cache blob
browser.storage.local.get(['country_code', 'selected_provider_ids', 'provider_id', 'filter_status'], (items) => {
	parseSettings(items);

	// load cached variables from sessionStorage
	browser.storage.session.get(['providers', 'countries'], (items) => {
		providers = items.providers ?? {};
		countries = items.countries ?? {};

		appendOptionsToCountryList();
		appendOptionsToProviderList();

		filterSwitch.checked = filterStatus;
		setControlsDisabled(!filterStatus);

		filterSwitch.addEventListener('change', changeFilterSwitch);
		countryList.addEventListener('change', changeCountryCode);
		providerList.addEventListener('click', onProviderListClick);
		providerList.addEventListener('keydown', onProviderListKeydown);
		providerSearch.addEventListener('input', applyProviderSearch);
		clearSelectionButton.addEventListener('click', clearSelectedProviderIds);
	});
});

/**
 * Parses settings from storage items.
 * Falls back to the legacy single `provider_id` setting if `selected_provider_ids` hasn't been
 * migrated yet; the worker performs the actual migration write.
 *
 * @param {object} items - Storage items containing settings.
 */
function parseSettings(items) {
	countryCode = items.country_code ?? 'US';
	if (Object.hasOwn(items, 'selected_provider_ids')) {
		selectedProviderIds = items.selected_provider_ids;
	} else if (Object.hasOwn(items, 'provider_id')) {
		selectedProviderIds = [items.provider_id];
	} else {
		selectedProviderIds = [8];
	}
	filterStatus = items.filter_status ?? false;
}

/**
 * Returns the keys of the given object, sorted by the `name` of their values.
 *
 * @param {object} entries - Countries or providers, keyed by code or ID.
 * @returns {string[]} - The sorted keys.
 */
function keysSortedByName(entries) {
	return Object.keys(entries).sort((a, b) => String(entries[a].name).localeCompare(entries[b].name));
}

/**
 * Fills the countryList select with all countries and selects the stored one.
 */
function appendOptionsToCountryList() {
	const fragment = document.createDocumentFragment();
	for (const key of keysSortedByName(countries)) {
		const country = countries[key];
		if (!country.name || !country.code)
			continue;

		const opt = document.createElement('option');
		opt.textContent = country.name;
		opt.value = key;
		opt.selected = country.code === countryCode;
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
	const fragment = document.createDocumentFragment();
	const country = countryList.value;
	for (const key of keysSortedByName(providers)) {
		const provider = providers[key];
		if (!provider.name || provider.provider_id == null || !provider.countries?.includes(country))
			continue;

		const row = document.createElement('div');
		row.className = 'provider-row';
		row.setAttribute('role', 'option');
		row.textContent = provider.name;
		row.dataset.providerId = provider.provider_id;
		row.setAttribute('aria-selected', String(selectedProviderIds.includes(provider.provider_id)));
		row.tabIndex = filterStatus ? 0 : -1;
		fragment.appendChild(row);
	}

	const empty = document.createElement('div');
	empty.className = 'provider-empty';
	// No rows at all means the provider cache hasn't been filled yet (or the country has none)
	empty.textContent = fragment.childElementCount > 0 ? 'No matches' : 'No streaming services available';
	fragment.appendChild(empty);

	providerList.replaceChildren(fragment);
	applyProviderSearch();
}

/**
 * Returns all rows of the providerList, including those hidden by the search.
 *
 * @returns {NodeListOf<HTMLElement>} - The provider rows.
 */
function getProviderRows() {
	return providerList.querySelectorAll('.provider-row');
}

/**
 * Selects or deselects a provider and stores the new selection.
 *
 * @param {HTMLElement} row - The providerList row that was toggled.
 */
function toggleProvider(row) {
	const id = Number(row.dataset.providerId);
	const selected = !selectedProviderIds.includes(id);
	selectedProviderIds = selected
		? [...selectedProviderIds, id]
		: selectedProviderIds.filter(selectedId => selectedId !== id);

	row.setAttribute('aria-selected', String(selected));
	browser.storage.local.set({selected_provider_ids: selectedProviderIds});
	updateSelectionCount();
}

function onProviderListClick(event) {
	const row = event.target.closest('.provider-row');
	if (row && filterStatus) {
		toggleProvider(row);
	}
}

function onProviderListKeydown(event) {
	const row = event.target.closest('.provider-row');
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
	const query = providerSearch.value.trim().toLowerCase();
	let anyVisible = false;
	for (const row of getProviderRows()) {
		row.hidden = !row.textContent.toLowerCase().includes(query);
		anyVisible ||= !row.hidden;
	}
	providerList.querySelector('.provider-empty').hidden = anyVisible;
	updateSelectionCount();
}

/**
 * Shows how many of the providers offered in the selected country are selected,
 * including rows hidden by the search.
 */
function updateSelectionCount() {
	const count = providerList.querySelectorAll('.provider-row[aria-selected="true"]').length;
	selectionCount.textContent = count + ' selected';
	clearSelectionButton.disabled = !filterStatus || count === 0;
}

/**
 * Deselects all providers offered in the selected country (including rows hidden by the search)
 * and stores the new selection. Selections for other countries are kept, like on a country change.
 */
function clearSelectedProviderIds() {
	const rows = getProviderRows();
	const shownIds = new Set(Array.from(rows, row => Number(row.dataset.providerId)));
	selectedProviderIds = selectedProviderIds.filter(id => !shownIds.has(id));
	browser.storage.local.set({selected_provider_ids: selectedProviderIds});
	for (const row of rows) {
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
	for (const row of getProviderRows()) {
		row.tabIndex = disabled ? -1 : 0;
	}
	updateSelectionCount();
}

/**
 * Called when the filter switch is toggled. Stores the new filter status.
 */
function changeFilterSwitch() {
	filterStatus = filterSwitch.checked;
	browser.storage.local.set({filter_status: filterStatus});
	setControlsDisabled(!filterStatus);
}

/**
 * Called when the selected item in countryList is changed.
 * Stores the new country code and reloads the rows in providerList.
 */
function changeCountryCode() {
	const code = countries[countryList.value]?.code;
	if (!code) {
		return;
	}

	countryCode = code;
	browser.storage.local.set({country_code: countryCode});
	appendOptionsToProviderList();
}

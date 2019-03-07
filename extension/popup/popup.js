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

"use strict";

//for compatibility reasons
var browser = chrome;

var background = browser.extension.getBackgroundPage();

var countries = background.getCountries();
var providers = background.getProviders();
var provider_ids = background.getProviderIds();
var country_code = background.getCountryCode();

var country_list = document.getElementById('country-list');
appendOptionsToCountryList();

var provider_list = document.getElementById('provider-list');
appendOptionsToProviderList();
const choices = new Choices(provider_list, { 
  removeItemButton: true,
  position: 'bottom',
  placeholder: false
});

var filterSwitch = document.getElementById("filterSwitch");
filterSwitch.checked = background.getFilterStatus();

filterSwitch.addEventListener("change", changeFilterSwitch);
provider_list.addEventListener("change", changeProviderId);
country_list.addEventListener("change", changeCountryCode);

/**
 * Appends all countries as option to the country_list select tag.
 */
function appendOptionsToCountryList() {
  let fragment = document.createDocumentFragment();
  const keys = Object.keys(countries).sort(function (a, b) {
    return ('' + countries[a].name).localeCompare(countries[b].name);
  });
  for (const countryId in keys) {
    const country = keys[countryId];

    let opt = document.createElement('option');
    opt.innerHTML = countries[country].name;
    opt.value = country;
    opt.label = countries[country].name;
    if (countries[country].code === country_code) {
      opt.selected = "selected";
    }
    fragment.appendChild(opt);
  }
  country_list.appendChild(fragment);
}

/**
 * Appends all providers from the selected country as option to the provider_list select tag.
 *
 * param {string} [defaultProviderName] - The (optional) name of the provider which is selected by default.
 */
function appendOptionsToProviderList(defaultProviderName) {
  provider_list.options.length = 0;
  let fragment = document.createDocumentFragment();
  const keys = Object.keys(providers).sort(function (a, b) {
    return ('' + providers[a].name).localeCompare(providers[b].name);
  });

  for (const providerKey in keys) {
    let provider = keys[providerKey];

    const country = country_list.options[country_list.selectedIndex].value;
    if (providers[provider].countries.includes(country)) {
      let opt = document.createElement('option');
      opt.innerHTML = providers[provider].name;
      opt.value = provider;
      opt.label = providers[provider].name;
      if (typeof defaultProviderName === 'undefined') {
        if (provider_ids.includes(providers[provider].provider_id)) {
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
  provider_list.appendChild(fragment);
}

/**
 * Changes the filter status in the background page.
 */
function changeFilterSwitch() {
  // enable or disable filtering
  background.setFilterStatus(filterSwitch.checked);
  provider_list.disabled = (!filterSwitch.checked);
  country_list.disabled = (!filterSwitch.checked);
}

/**
 * Called when the selected item in provider_list is changed. Changes the provider_id in the background page.
 */
function changeProviderId() {
  if (typeof providers !== 'undefined') {
    const checkedProviders = Array.from(provider_list.querySelectorAll('option:checked')).map(el => el.value);
    let providerIds = [];

    for (const providerId in checkedProviders) {
      const provider = checkedProviders[providerId];
      if (providers.hasOwnProperty(provider) && providers[provider].hasOwnProperty('provider_id')) {
        providerIds.push(providers[provider].provider_id);
      }
    }

    provider_ids = providerIds;
    background.setProviderIds(provider_ids);
  }
}

/**
 * Called when the selected item in country_list is changed. Changes the country_code in the background page and forces the options in provider_list to reload.
 */
function changeCountryCode() {
  const code = country_list.options[country_list.selectedIndex].value;
  if (typeof countries !== 'undefined' && countries.hasOwnProperty(code) && countries[code].hasOwnProperty('code')) {
    country_code = countries[code].code;
    background.setCountryCode(country_code);
    const defaultProviderId = provider_list.options[provider_list.selectedIndex].label;
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
  const isOpera = (!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;

  // Firefox 1.0+
  const isFirefox = typeof InstallTrigger !== 'undefined';

  // Chrome 1 - 71
  const isChrome = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);

  const returnString =
    isOpera ? 'Opera' :
      isFirefox ? 'Firefox' :
        isChrome ? 'Chrome' :
          "Don't know";

  return returnString;
}

if (getBrowser() !== 'Firefox') {
  // for opening the hyperlink in the popup in a new tab
  document.addEventListener('DOMContentLoaded', function () {
    const links = document.getElementsByTagName("a");
    for (let i = 0; i < links.length; i++) {
      (function () {
        const ln = links[i];
        const location = ln.href;
        ln.onclick = function () {
          chrome.tabs.create({
            active: true,
            url: location
          });
        };
      })();
    }
  });
}
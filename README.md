# Letterboxd Streaming Providers ![Logo](./extension/icons/logo_final_48.png) 

## What?
This is a extension for common web browsers coded using the WebExtensions API.

## Main Features
This extension adds a filter for some streaming providers (e.g., Netflix, Amazon Prime Video) to [Letterboxd](https://letterboxd.com/), to make it possible for you to see, which movies are included in your streaming flat rate.

### How?
The extension uses the TMDb API to access the streaming information that is provided by JustWatch.

### Which browser to use?
The extension can be added into Chrome, Firefox and Opera.

#### Chrome Web Store
[Letterboxd Streaming Providers at the Chrome Web Store](https://chrome.google.com/webstore/detail/letterboxd-streaming-prov/egmanfnfgmljjmdncfoeghfmflhlmhpj)

#### Firefox Add-ons (AMO)
[Letterboxd Streaming Providers at AMO](https://addons.mozilla.org/en-US/firefox/addon/letterboxd-streaming-providers/)

### Which countries are supported?
All countries supported by JustWatch are also supported by this extension. At the time of writing, these are:
Andorra, United Arab Emirates, Antigua and Barbuda, Albania, Angola, Argentina, Austria, Australia, Azerbaijan, Bosnia and Herzegovina, Barbados, Belgium, Burkina Faso, Bulgaria, Bahrain, Bermuda, Bolivia, Brazil, Bahamas, Belarus, Belize, Canada, Congo, Switzerland, Cote D'Ivoire, Chile, Cameroon, Colombia, Costa Rica, Cuba, Cape Verde, Cyprus, Czech Republic, Germany, Denmark, Dominican Republic, Algeria, Ecuador, Estonia, Egypt, Spain, Finland, Fiji, France, United Kingdom, French Guiana, Ghana, Gibraltar, Guadaloupe, Equatorial Guinea, Greece, Guatemala, Guyana, Hong Kong, Honduras, Croatia, Hungary, Indonesia, Ireland, Israel, India, Iraq, Iceland, Italy, Jamaica, Jordan, Japan, Kenya, South Korea, Kuwait, Lebanon, St. Lucia, Liechtenstein, Lithuania, Luxembourg, Latvia, Libyan Arab Jamahiriya, Morocco, Monaco, Moldova, Montenegro, Madagascar, Macedonia, Mali, Malta, Mauritius, Malawi, Mexico, Malaysia, Mozambique, Niger, Nigeria, Nicaragua, Netherlands, Norway, New Zealand, Oman, Panama, Peru, French Polynesia, Papua New Guinea, Philippines, Pakistan, Poland, Palestinian Territory, Portugal, Paraguay, Qatar, Romania, Serbia, Russia, Saudi Arabia, Seychelles, Sweden, Singapore, Slovenia, Slovakia, San Marino, Senegal, El Salvador, Turks and Caicos Islands, Chad, Thailand, Tunisia, Turkey, Trinidad and Tobago, Taiwan, Tanzania, Ukraine, Uganda, United States of America, Uruguay, Holy See, Venezuela, Kosovo, Yemen, South Africa, Zambia, Zimbabwe

### Important Notice
This is a third party extension and is not related to the Letterboxd developer team in any way. This product uses the TMDb API but is not endorsed or certified by TMDb. The extension also uses information provided by JustWatch but is not endorsed or certified by JustWatch.

## Contributing

### Developing
- `npm install` - Installs all dependencies.
- `npm run build` - Builds the Firefox (.xpi) and the Chrome/Opera (.zip) builds.

For the extension to work, you need to edit `./settings/api.json` and insert your TMDB API key. If you don't have one, you can request one [here](https://www.themoviedb.org/documentation/api).

### How to test?
1. Run `npm install` once at the beginning of your development.
2. Load the extension in your browser.

In Chrome: 
- go to `chrome://extensions`
- activate developer mode 
- then
    - click `load unpacked extension` 
    - load the `/extension` folder 
- or
    - drag & drop the Chrome build file from `/builds` into the tab.
    
In Firefox:
- go to `about:debugging`
- then
    - load `extension/manifest.json`
- or
    - load the Firefox build file from `/builds`.

### Donations
If you like my work, you can support me via [PayPal](https://www.paypal.me/ChristianZei/5). Thank you!

## Acknowledgements
Thanks to everyone using, supporting and contributing to the extension. Philipp Emmer is especially mentioned for the idea behind this extension.

## Contributors
<a href="https://github.com/adlerzei/letterboxd-streaming-providers/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=adlerzei/letterboxd-streaming-providers" />
</a>

Made with [contributors-img](https://contributors-img.web.app).

## What's new?

##### v1.0
- Filter `/watchlist`, `/films` and `/likes` of Letterboxd for your favorite streaming providers
- Choose between streaming providers from Austria, Canada, France, Germany, Japan, Mexico, Spain, Switzerland, USA and United Kingdom

##### v1.1
- TMDb API key renewed
- Fixed bug, that caused the JustWatch request failing on special characters
- Fixed bug, now all existing providers can be used
- Minor bugfixes
- Minor backend changes

##### v1.2
- Fixed bug, that some movies weren't resolved correctly due to changes in the JustWatch API
- Added support for TV shows that are present on Letterboxd (e.g. "The Queen's Gambit")
- Added hot reload when settings are changed in the popup
- Add filtering of Letterboxd lists, that can be found under `/list`

##### v1.3
- Fixed broken filtering for United Kingdom
- Fix buggy hot reloading
- Added temporary fix for broken movie title localization for Austria and Switzerland
- Minor bugfixes

##### v1.4
- Added clean fix for broken movie title localization for Austria and Switzerland
- Small backend changes
- Minor bug fixes
- Added all streaming providers that are available on JustWatch and offer free/flatrate access
- Added support for the following countries: Brazil, Argentina, Australia

##### v1.5
- Upgraded to Manifest v3
- Added support for Italy

##### v1.6
- Added support for all countries available on JustWatch
- Fix bug that prevented correct resolving of currently unresolved requests due to status code 429
- Removed usage of the JustWatch API
- Use TMDb API to request the streaming information provided by JustWatch
- Add JustWatch logo to the popup window for attribution
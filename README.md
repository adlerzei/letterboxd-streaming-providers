# Letterboxd Streaming Providers ![Logo](./extension/icons/logo_final_48.png) 

[![Project status: active – The project has reached a stable, usable state and is being actively developed.](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)
[![Project releases](https://img.shields.io/github/release/adlerzei/letterboxd-streaming-providers)](https://github.com/adlerzei/letterboxd-streaming-providers/releases)
[![Project contributors](https://img.shields.io/github/contributors/adlerzei/letterboxd-streaming-providers)](https://github.com/adlerzei/letterboxd-streaming-providers/graphs/contributors)
[![Project license](https://img.shields.io/github/license/adlerzei/letterboxd-streaming-providers)](https://github.com/adlerzei/letterboxd-streaming-providers/blob/main/LICENSE)

## What?
This is a extension for common web browsers coded using the WebExtensions API.

## Main Features
This extension adds a filter for streaming providers (e.g., Netflix, Amazon Prime Video) to [Letterboxd](https://letterboxd.com/), to make it possible for you to see, which movies are included in your streaming flat rate.

### How?
The extension uses the TMDb API to access the streaming information that is provided by JustWatch.

### Which browser to use?
The extension can be added into Chrome, Firefox and Opera.

#### Chrome Web Store
[Letterboxd Streaming Providers at the Chrome Web Store](https://chrome.google.com/webstore/detail/letterboxd-streaming-prov/egmanfnfgmljjmdncfoeghfmflhlmhpj)

#### Firefox Add-ons (AMO)
[Letterboxd Streaming Providers at AMO](https://addons.mozilla.org/en-US/firefox/addon/letterboxd-streaming-providers/)

### Which countries are supported?
All countries supported by JustWatch are also supported by this extension. 

At the time of writing, these are:<br>
Andorra, United Arab Emirates, Antigua and Barbuda, Albania, Angola, Argentina, Austria, Australia, Azerbaijan, Bosnia and Herzegovina, Barbados, Belgium, Burkina Faso, Bulgaria, Bahrain, Bermuda, Bolivia, Brazil, Bahamas, Belarus, Belize, Canada, Congo, Switzerland, Cote D'Ivoire, Chile, Cameroon, Colombia, Costa Rica, Cuba, Cape Verde, Cyprus, Czech Republic, Germany, Denmark, Dominican Republic, Algeria, Ecuador, Estonia, Egypt, Spain, Finland, Fiji, France, United Kingdom, French Guiana, Ghana, Gibraltar, Guadaloupe, Equatorial Guinea, Greece, Guatemala, Guyana, Hong Kong, Honduras, Croatia, Hungary, Indonesia, Ireland, Israel, India, Iraq, Iceland, Italy, Jamaica, Jordan, Japan, Kenya, South Korea, Kuwait, Lebanon, St. Lucia, Liechtenstein, Lithuania, Luxembourg, Latvia, Libyan Arab Jamahiriya, Morocco, Monaco, Moldova, Montenegro, Madagascar, Macedonia, Mali, Malta, Mauritius, Malawi, Mexico, Malaysia, Mozambique, Niger, Nigeria, Nicaragua, Netherlands, Norway, New Zealand, Oman, Panama, Peru, French Polynesia, Papua New Guinea, Philippines, Pakistan, Poland, Palestinian Territory, Portugal, Paraguay, Qatar, Romania, Serbia, Russia, Saudi Arabia, Seychelles, Sweden, Singapore, Slovenia, Slovakia, San Marino, Senegal, El Salvador, Turks and Caicos Islands, Chad, Thailand, Tunisia, Turkey, Trinidad and Tobago, Taiwan, Tanzania, Ukraine, Uganda, United States of America, Uruguay, Holy See, Venezuela, Kosovo, Yemen, South Africa, Zambia, Zimbabwe

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

## Credits
Thanks to everyone using, supporting and contributing to the extension. Philipp Emmer is especially mentioned for the idea behind this extension.

<p align="center">
  <a href="https://www.themoviedb.org/"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg" alt="TMDB Logo" height="50"></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.justwatch.com/"><img src="https://www.justwatch.com/appassets/img/logo/JustWatch-logo-large.webp" alt="JustWatch Logo" height="50"></a>
</p>

This is a third party extension and is not related to the Letterboxd developer team in any way. This product uses the TMDb API but is not endorsed or certified by TMDb. The extension also uses information provided by JustWatch but is not endorsed or certified by JustWatch.

## Contributors
<a href="https://github.com/adlerzei/letterboxd-streaming-providers/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=adlerzei/letterboxd-streaming-providers" />
</a>

Made with [contributors-img](https://contributors-img.web.app).

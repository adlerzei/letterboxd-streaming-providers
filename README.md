# Letterboxd Streaming Providers ![Logo](./extension/icons/logo_final_48.png) 

## What?
This is a extension for common web browsers coded using the WebExtensions API.

## Main Features
This extension adds a filter for some streaming providers (e.g. Netflix, Amazon Prime Video) to [Letterboxd](https://letterboxd.com/), to make it possible for you to see, which movies are included in your streaming flat rate.

### How?
The extension uses the TMDb API for assigning the original movie titles to the English ones. Furthermore, the JustWatch API is used to provide the streaming information.

### Which browser to use?
The extension can be added into Chrome, Firefox and Opera.

#### Chrome Web Store
[Letterboxd Streaming Providers at the Chrome Web Store](https://chrome.google.com/webstore/detail/letterboxd-streaming-prov/egmanfnfgmljjmdncfoeghfmflhlmhpj)

#### Firefox Add-ons (AMO)
[Letterboxd Streaming Providers at AMO](https://addons.mozilla.org/en-US/firefox/addon/letterboxd-streaming-providers/)

### Which countries are supported?
Actually streaming providers of the following countries are supported: Austria, Canada, France, Germany, Japan, Mexico, Spain, Switzerland, USA, United Kingdom. 

Coming soon: Australia, India, Ireland, Italy, Russia, Netherlands, Norway, Sweden.

### Important Notice
This is a third party extension and is not related to the Letterboxd developer team in any way. This product uses the TMDb API but is not endorsed or certified by TMDb. The extension also uses the JustWatch API but is not endorsed or certified by JustWatch.

## Contributing

### Developing
- `npm install` - Installs all dependencies.
- `npm run dev` - Builds the Firefox (.xpi) and the Chrome/Opera (.zip) builds.

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

## What's new?

##### v1.0
- Filter `/watchlist`, `/films` and `/likes` of Letterboxd for your favorite streaming providers.
- Choose between streaming providers from Austria, Canada, France, Germany, Japan, Mexico, Spain, Switzerland, USA and United Kingdom.

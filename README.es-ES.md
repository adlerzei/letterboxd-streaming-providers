

# Proveedores de Streaming para Letterboxd ![Logo](./extension/icons/logo_final_48.png) 

[![Project status: active – The project has reached a stable, usable state and is being actively developed.](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)
[![CI](https://github.com/adlerzei/letterboxd-streaming-providers/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/adlerzei/letterboxd-streaming-providers/actions/workflows/ci.yml)
[![Project releases](https://img.shields.io/github/release/adlerzei/letterboxd-streaming-providers)](https://github.com/adlerzei/letterboxd-streaming-providers/releases)
[![Project contributors](https://img.shields.io/github/contributors/adlerzei/letterboxd-streaming-providers)](https://github.com/adlerzei/letterboxd-streaming-providers/graphs/contributors)
[![Project license](https://img.shields.io/github/license/adlerzei/letterboxd-streaming-providers)](https://github.com/adlerzei/letterboxd-streaming-providers/blob/main/LICENSE)

## ¿Qué es esto?
Esta es una extensión para navegadores web comunes, desarrollada utilizando la API WebExtensions.

## Características principales
Esta extensión añade un filtro para servicios de streaming (por ejemplo, Netflix, Amazon Prime Video) a [Letterboxd](https://letterboxd.com/), lo que te permite ver qué películas están incluidas en tu tarifa plana de streaming.

### ¿Cómo funciona?
La extensión utiliza la API de TMDb para acceder a la información de streaming que proporciona JustWatch.

### ¿Qué navegador usar?
La extensión se puede añadir a todos los navegadores basados en Chromium (Chrome, Edge, Opera, Brave, etc.) y Firefox.

#### Chrome Web Store
[Letterboxd Streaming Providers en Chrome Web Store](https://chrome.google.com/webstore/detail/letterboxd-streaming-prov/egmanfnfgmljjmdncfoeghfmflhlmhpj)

#### Complementos para Firefox (AMO)
[Letterboxd Streaming Providers en AMO](https://addons.mozilla.org/en-US/firefox/addon/letterboxd-streaming-providers/)

### ¿Qué países son compatibles?
Todos los países compatibles con JustWatch también son compatibles con esta extensión. 

En el momento de escribir esto, son:<br>
Andorra, Emiratos Árabes Unidos, Antigua y Barbuda, Albania, Angola, Argentina, Austria, Australia, Azerbaiyán, Bosnia y Herzegovina, Barbados, Bélgica, Burkina Faso, Bulgaria, Baréin, Bermudas, Bolivia, Brasil, Bahamas, Bielorrusia, Belice, Canadá, Congo, Suiza, Costa de Marfil, Chile, Camerún, Colombia, Costa Rica, Cuba, Cabo Verde, Chipre, República Checa, Alemania, Dinamarca, República Dominicana, Argelia, Ecuador, Estonia, Egipto, España, Finlandia, Fiyi, Francia, Reino Unido, Guayana Francesa, Ghana, Gibraltar, Guadalupe, Guinea Ecuatorial, Grecia, Guatemala, Guyana, Hong Kong, Honduras, Croacia, Hungría, Indonesia, Irlanda, Israel, India, Irak, Islandia, Italia, Jamaica, Jordania, Japón, Kenia, Corea del Sur, Kuwait, Líbano, Santa Lucía, Liechtenstein, Lituania, Luxemburgo, Letonia, Jamahiriya Árabe Libia, Marruecos, Mónaco, Moldavia, Montenegro, Madagascar, Macedonia, Malí, Malta, Mauricio, Malaui, México, Malasia, Mozambique, Níger, Nigeria, Nicaragua, Países Bajos, Noruega, Nueva Zelanda, Omán, Panamá, Perú, Polinesia Francesa, Papúa Nueva Guinea, Filipinas, Pakistán, Polonia, Territorio Palestino, Portugal, Paraguay, Catar, Rumania, Serbia, Rusia, Arabia Saudita, Seychelles, Suecia, Singapur, Eslovenia, Eslovaquia, San Marino, Senegal, El Salvador, Islas Turcas y Caicos, Chad, Tailandia, Túnez, Turquía, Trinidad y Tobago, Taiwán, Tanzania, Ucrania, Uganda, Estados Unidos de América, Uruguay, Santa Sede, Venezuela, Kosovo, Yemen, Sudáfrica, Zambia, Zimbabue

## Contribuir

### Desarrollo
- `npm install` - Instala todas las dependencias.
- `npm run build` - Genera las compilaciones para Firefox (.xpi) y Chrome/Opera (.zip).

Para el desarrollo local, edita `extension/settings/api.json` e inserta tu token de la API de TMDB en modo de depuración. Si no tienes uno, puedes solicitarlo [aquí](https://www.themoviedb.org/documentation/api).

```json
{
  "tmdb": "YOUR_TMDB_TOKEN_HERE",
  "debug": true
}
```

Para evitar confirmar accidentalmente cambios locales del token, marca el archivo como skip-worktree:

```bash
git update-index --skip-worktree extension/settings/api.json
```

Para compilaciones de CI y lanzamiento, GitHub Actions escribe un token ofuscado en `api.json` utilizando el secreto del repositorio `TMDB_TOKEN` y un nonce por compilación.

Crea el secreto en tu repositorio aquí:
Configuración -> Secretos y variables -> Acciones -> Nuevo secreto de repositorio

- Nombre: `TMDB_TOKEN`
- Valor: tu token de TMDB sin procesar

### ¿Cómo probarlo?
1. Ejecuta `npm install` una vez al principio de tu desarrollo.
2. Carga la extensión en tu navegador.

En Chrome: 
- Ve a `chrome://extensions`
- Activa el modo desarrollador 
- Luego
    - Haz clic en `load unpacked extension` 
    - Carga la carpeta `/extension` 
- O
    - Arrastra y suelta el archivo de compilación de Chrome desde `/builds` en la pestaña.

Para los artefactos de GitHub Actions, ten en cuenta que el artefacto descargado es un archivo contenedor de GitHub. Extráelo primero para obtener el archivo de compilación `.zip` o `.xpi` real dentro.
    
En Firefox:
- Ve a `about:debugging`
- Luego
    - Carga `extension/manifest.json`
- O
    - Carga el archivo de compilación de Firefox desde `/builds`.

### Donaciones
Si te gusta mi trabajo, puedes apoyarme a través de [PayPal](https://www.paypal.me/ChristianZei/5). ¡Gracias!

## Créditos
Gracias a todos los que usan, apoyan y contribuyen a la extensión. Se menciona especialmente a Philipp Emmer por la idea detrás de esta extensión.

<p align="center">
  <a href="https://www.themoviedb.org/"><img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_1-5bdc75aaebeb75dc7ae79426ddd9be3b2be1e342510f8202baf6bffa71d7f5c4.svg" alt="TMDB Logo" height="50"></a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.justwatch.com/"><img src="https://www.justwatch.com/appassets/img/logo/JustWatch-logo-large.webp" alt="JustWatch Logo" height="50"></a>
</p>

Esta es una extensión de terceros y no está relacionada de ninguna manera con el equipo de desarrollo de Letterboxd. Este producto utiliza la API de TMDb pero no está avalado ni certificado por TMDb. La extensión también utiliza información proporcionada por JustWatch pero no está avalada ni certificada por JustWatch.

## Colaboradores
<a href="https://github.com/adlerzei/letterboxd-streaming-providers/graphs/contributors">
  <img src="https://contributors-img.web.app/image?repo=adlerzei/letterboxd-streaming-providers" />
</a>

Realizado con [contributors-img](https://contributors-img.web.app).

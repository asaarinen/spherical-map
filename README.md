Google Earth-style maps in JavaScript 
===

This project is an experiment to render [TileMill](https://github.com/mapbox/tilemill) projects into tiles, and display those tiles as a 3D globe using pure JavaScript and CSS in a browser. 

The development was made on Chrome and on iPhone and iPad browsers. It should work on all other major browsers as well, but your mileage may vary as it has not really been tested extensively.

Right now the project is experimental so any and all early feedback and ideas where this could be useful, are greatly appreciated. Especially if you would like to use this in your project and would like to act as an early developer partner, please contact the author.

## Demo

For the demo, the [Geography Class](http://tiles.mapbox.com/mapbox/map/geography-class#4.00/0.00/0.00) example project from [TileMill](https://github.com/mapbox/tilemill) was prerendered and is served statically from S3.

This is what it looks like, best experienced in a Chrome / iPhone / iPad browser (click image to open link):

[![Screen shot](http://spherical-test.s3-website-us-west-1.amazonaws.com/spherical-map-screenshot.png)](http://spherical-test.s3-website-us-west-1.amazonaws.com/)

### Known Issues

* in Chrome, if you open the demo and leave it running for a long time, it will stop displaying correctly. Refreshing the page does not help, but restarting the browser does. I suspect this is some kind of issue in Chrome.
* on some zoom levels, small "cracks" between the tiles can be seen. This could be mitigated by choosing a higher zoom level, but would also result in many more tiles having to be displayed by the browser.

## How It Works

There are two parts in this project: a JavaScript UI which displays the map, and a Node.js server that renders the tiles. 

### JavaScript UI

The UI creates a DOM structure inside the HTML page that allows for 3D view. Each tile is transformed using CSS transform directives, and rotated in real time using JavaScript according to user actions (pan, zoom, etc.).

The tiles used are not exactly similar to the tiles used regularly by web maps. The tile subdivision model is different, and therefore also the rendered tiles look different. For example:

![Example Tile](http://spherical-test.s3-website-us-west-1.amazonaws.com/tiles-1/2-5.png)
![Example Tile](http://spherical-test.s3-website-us-west-1.amazonaws.com/tiles-1/1-5.png)
![Example Tile](http://spherical-test.s3-website-us-west-1.amazonaws.com/tiles-1/0-0.png)

These tiles are fitted precisely next to each other in the JavaScript UI to form an illusion of a round globe. The map component chooses the zoom level used based on viewer distance from ground. 

The JavaScript side of things actually includes quite a bit of vector math in order to construct the camera, set the CSS transforms accordingly and it also maintains the connection between the 3D coordinate system and the map view. This allows the application developer to, for example, place a \<canvas\> element on top of the map view, transform any WGS84 latitude, longitude coordinates into the view coordinates and then render points or lines in geographically correct positions.

### Tile renderer 

Right now the tile server is only able to render TileMill projects, and only shapefiles within them. During development, OpenStreetMap was also rendered from a PostGIS database, so adding that support is close.

The tile rendering server can be run as follows:

1. use [TileMill](https://github.com/mapbox/tilemill) to design your map
2. install [Carto](https://github.com/mapbox/carto) and [MillStone](https://github.com/mapbox/millstone)
3. use Carto to process your TileMill project from CartoCSS MML to Cascadenik MML, for example

        carto project.mml

    Carto outputs the XML, together with some [millstone] log into standard output, so you may want to store it into a file like this:

        carto project.mml | grep -v "[millstone]" > project.xml

4. run tileserver.js as follows to generate the tiles:

        node tileserver.js project.xml 1

    This will render all tiles for zoomlevel 1 and store them in a directory "tiles-1"

    Alternatively, you may just run

        node tileserver.js project.xml

    which will run the tile server in an on-demand mode, serving the tiles over HTTP and rendering any requested tiles that cannot be found in the file system.

The tile server in its current form is not really ready to be used for production tile rendering or serving. It was just needed to be able to develop and test the tile rendering process for this experiment.

## Next Steps

The next steps in the development of this project are:

* wrap the UI as a JavaScript component with a documented API, probably similar to [Modest Maps](https://github.com/modestmaps/modestmaps-js)
* more extensive support for all Cascadenik MML features and data sources OR preferably, a way to hack [Mapnik](https://github.com/mapnik/mapnik) into rendering the tiles in the projection used by this
* more efficient tile rendering. Right now is too slow for practical use, as all rendering is done in the node.js process using [node-canvas](https://github.com/LearnBoost/node-canvas)
* ability to package rendered tiles in MBTiles or similar format for easier hosting
* more extensive testing with all different browsers

## Contact

Please contact the author for any feedback, ideas, or use cases that you have for this project. 

The original author of this experiment is Antti Saarinen (antti.saarinen@whatamap.com). The copyright owner of this work is Whatamap.com Ltd. 

## License

(The MIT License)

Copyright (c) 2012 Whatamap.com Ltd.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
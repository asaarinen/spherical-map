//
// general WGS84 related functions, and functions constructing the spherical tile division
//
function WGS84() {

    // for node.js use
    if( typeof exports !== 'undefined' )
	var vecm = require('./math.js').VecMath();
    else
	var vecm = VecMath();

    // constants, in kilometer units
    var A = 6378137.0/1000;
    var B = A; // 6356752.3142/1000;
    //var S = 10000;
    var R = (A + B)/2;
    var AE = Math.acos( B / A );

    var tilescalefactor = 1.00;

    // returns radius of the WGS84 ellipsoid used, in km
    function getRadius() {
	return A;
    }

    // returns the amount of vertical steps on a given zoom level
    // each "step" is one tile from north pole to equator, so if there are 3 steps,
    // there is a tile for north pole, a tile for equator and one tile in between.
    function getTileSteps(zoomlevel) {
	var steps = 3; // 3, 5, 9, 17, 33, 65, 
	while( zoomlevel > 0 ) {
	    steps = 2 * steps -  1;
	    zoomlevel--;
	}
	return steps;
    }

    // calculates XYZ coordinates from latitude and longitude
    function calcXYZ(lat, lon, h, factor) {
	if( h == null )
	    h = 0;
	
	if( factor == null )
	    factor = 1;

	if( lat >= 90 )
	    return { x: 0, y: 0, z: (A+h) * factor };
	else if( lat <= -90 )
	    return { x: 0, y: 0, z: -(A+h) * factor };
	
	lon = lon / 180.0 * Math.PI;
	lat = lat / 180.0 * Math.PI;
	
	var ix = ( A + h ) * Math.cos(lat) * Math.cos(lon);
	var iy = ( A + h ) * Math.cos(lat) * Math.sin(lon);
	
	var iz = ( A + h ) * Math.sin(lat);	
	
	return { x: factor * ix, y: factor * iy, z: factor * iz };
    }
    
    // calculates latitude and longitude from XYZ coordinates
    function calcWGS(x, y, z, factor) {
	
	if( factor != null ) {
	    x /= factor;
	    y /= factor;
	    z /= factor;
	}
	
	var ilat = Math.atan( z / Math.sqrt( x * x + y * y ) );
	
	// calculate elevation.
	var ih = Math.sqrt( x * x + y * y ) / Math.cos(ilat) - A;
	
	// longitude
	var ilon = Math.asin( y / ( ( A + ih ) * Math.cos(ilat) ) );
	if( x < 0 )
	    ilon = Math.PI - ilon;
	if( ilon > Math.PI )
	    ilon -= 2.0 * Math.PI;
	else if( ilon < -Math.PI )
	    ilon += 2.0 * Math.PI;
	
	ilon = ilon * 180.0 / Math.PI;
	ilat = ilat * 180.0 / Math.PI;
	
	return { lat: ilat, lon: ilon, h: ih };
    }

    // calculates how many tile rows there are on a given zoom level
    function calcNumTileRows(level) {
	var steps = 2;
	while( level > 0 ) {
	    steps *= 2;
	    level--;
	}
	return steps * 2 + 1;
    }

    // calculates how many tile columns there are on a given zoom level and vertical row
    function calcNumTileColumns(level, row) {
	var numrows = calcNumTileRows(level);
	var midrow = (numrows-1)/2;

	if( row < 0 || row >= numrows )
	    return 0;	
	if( row == 0 || row == numrows - 1 )
	    return 1;

	var stepangle = 180 / (numrows-1);
  	var stepdist = stepangle / 180 * Math.PI;

	var angle = row * stepangle;
	var circangle = angle;
	if( row > 0 && row < midrow ) 
	    circangle += stepangle/2;
	else if( row > midrow ) 
	    circangle -= stepangle/2;
	
	var circumference = Math.sin(circangle / 180 * Math.PI) * 2.0 * Math.PI;
	var horizsteps = Math.max(1,Math.ceil(circumference / stepdist));

	return horizsteps;
    }

    // calculates the height of a tile on a given zoom level, 
    // "height" being the latitude angle the tile covers in degrees
    function calcTileHeight(level) {
	return 180 / (calcNumTileRows(level)-1);
    }
    
    // calculates the width of a tile, on a given zoomlevel and row
    // in degrees
    function calcTileWidth(level, row) {
	var numcols = calcNumTileColumns(level, row);
	return 360 / numcols;
    }

    // calculates the center point of a tile on specific zoom level, row and column
    function calcTileCenter(level, row, column) {
	var tilelat = 90 - row * calcTileHeight(level);
	var tilelon = column * calcTileWidth(level, row);
	return { lat: tilelat, lon: tilelon };
    }

    // calcluates the tile row on which this latitude resides
    function calcTileRow(level, lat) {
	var numrows = calcNumTileRows(level);
	var rowlat = 180 / (numrows-1);
	var row = Math.floor(((90-lat) + rowlat/2) / rowlat);
	row = Math.min(row, numrows-1);
	return row;
    }

    // calculates the tile column on which this longitude resides
    function calcTileColumn(level, row, lon) {
	while( lon < 0 )
	    lon += 360;
	while( lon >= 360 )
	    lon -= 360;
	var width = calcTileWidth(level, row);
	var col = Math.floor((lon + width/2) / width);
	col = Math.min(col, calcNumTileColumns(level, row) - 1);
	return col;
    }

    // calculates the tile on which this latitude,longitude pair resides
    function wgsToTile(level, lat, lon) {
	var row = calcTileRow(level, lat);
	var col = calcTileColumn(level, row, lon);

	var width = calcTileWidth(level, row);
	var height = calcTileHeight(level);
	var midp = calcTileCenter(level, row, col);

	return { id: level + '/' + row + '/' + col,
		 z: level,
		 y: row,
		 x: col,
	         width: width,
		 height: height,
	         center: midp };
    }
	
    // prints a matrix, for debugging purposes only
    function printmat(name, mat) {
	var str = '';
	for( var vi = 0; vi < 16; vi++ )
	    str += mat[vi] + ', ';
	console.log(name + ': ' + str);
    }
    
    var prevchecks = -1, prevvisibles = -1;

    // calculate the scale denominator
    function calcScaleDenominator(camera) {
	var frustum = camera.getViewFrustum();

	var camdist = vecm.veclength(
	    vecm.difference({x:0, y:0, z:0}, 
			    vecm.multiply(camera.getCameraMatrix(), 
					  {x:0, y:0, z:0})));
	
	camdist -= A;
	if( camdist < 0 )
            return -1;	

	var viewwidthkm = 2 * frustum.tanfovx * camdist;
	return viewwidthkm * 1000 * 10;
    }

    // calculates all tiles that are visible to the given camera
    function calcVisibleTiles(camera) {
	
	var frustum = camera.getViewFrustum();
	
	var camdist = vecm.veclength(
	    vecm.difference({x:0, y:0, z:0}, 
			    vecm.multiply(camera.getCameraMatrix(), 
					  {x:0, y:0, z:0})));
	
	camdist -= A;
	if( camdist < 0 )
            return {};

	var viewwidthkm = 2 * frustum.tanfovx * camdist;
	var viewwidthpx = frustum.pixelwidth;

	var zoomlevel = 0;
	while(true) {
	    var tilesizekm = A * calcTileSizeRadians(zoomlevel);
	    if( 256 / tilesizekm >= viewwidthpx / viewwidthkm && zoomlevel >= 1 ) 
		break;
	    zoomlevel++;
	}
	
	var camvecs = camera.getCameraVectors();
	
	var centerhit = calcRayHit(camera.getViewRay(0.5,0.5));
	var centerwgs = calcWGS(centerhit.x, centerhit.y, centerhit.z);
	
	var currenttile = wgsToTile(zoomlevel, centerwgs.lat, centerwgs.lon);
	var visibletiles = {};
	var visibletiles_sorted = [];
	var alltiles = {};
	alltiles[currenttile.id] = currenttile;
	var uncheckedtiles = [];
	
	var numchecks = 0;
	var numvisibles = 0;
	
	var map2proj = camera.getProjectionMatrix();
	
	while(true) {
	    numchecks++;
	    if( visibletiles[currenttile.id] == null ) {
		currenttile.coord = calcTilePosition(currenttile.center.lat,
						     currenttile.center.lon,
						     currenttile.width/180*Math.PI,
						     currenttile.height/180*Math.PI);
		var normal = { x: currenttile.coord.planes.front.a,
			       y: currenttile.coord.planes.front.b,
			       z: currenttile.coord.planes.front.c };
		var viewangle = vecm.dotp(vecm.difference(camvecs.camera, currenttile.coord.center), normal);
		if( viewangle <= 0 ) {
		    
		    var projcenter = vecm.multiply(map2proj, currenttile.coord.center);
		    var px = projcenter.x / projcenter.w;
		    var py = projcenter.y / projcenter.w;
		    
		    var padding = 100;
		    if( px >= -frustum.pixelwidth/2 - padding && px <= frustum.pixelwidth/2 + padding &&
			py >= -frustum.pixelheight/2 - padding && py <= frustum.pixelheight/2 + padding ) {
			
			numvisibles++;
			visibletiles[currenttile.id] = currenttile;
			visibletiles_sorted.push(currenttile);
			currenttile.viewangle = viewangle;
			currenttile.coord.id = 'tiles-' + zoomlevel + '/' + currenttile.y + '-' + currenttile.x;
			currenttile.coord.zoom = zoomlevel;

			// add parents
			var pzoom = zoomlevel - 1;
			while( pzoom >= 1 ) {
			    var ptile = wgsToTile(pzoom, currenttile.center.lat,
						  currenttile.center.lon);
			    if( visibletiles[ptile.id] == null ) {
				visibletiles[ptile.id] = ptile;
				visibletiles_sorted.push(ptile);
				ptile.coord = calcTilePosition(ptile.center.lat,
							       ptile.center.lon,
							       ptile.width/180*Math.PI,
							       ptile.height/180*Math.PI);
				ptile.coord.id = 'tiles-' + pzoom + '/' + ptile.y + '-' + ptile.x;
				ptile.coord.zoom = pzoom;
				ptile.viewangle = viewangle;
				pzoom--;
				continue;
			    }
			    break;
			}
			
			// add neighbours
			var neighbors = [];
			if( currenttile.center.lat < 90 && currenttile.center.lat > -90 ) {
			    neighbors.push(wgsToTile(zoomlevel, currenttile.center.lat,
						     currenttile.center.lon - currenttile.width));
			    neighbors.push(wgsToTile(zoomlevel, currenttile.center.lat,
						     currenttile.center.lon + currenttile.width));
			}
			if( currenttile.center.lat < 90 ) {
			    if( currenttile.center.lat > -90 )
				neighbors.push(wgsToTile(zoomlevel, currenttile.center.lat + currenttile.height * 0.75,
							 currenttile.center.lon - currenttile.width/2));
			    neighbors.push(wgsToTile(zoomlevel, currenttile.center.lat + currenttile.height * 0.75,
						     currenttile.center.lon + currenttile.width/2));
			} 
			if( currenttile.center.lat > -90 ) {
			    if( currenttile.center.lat < 90 )
				neighbors.push(wgsToTile(zoomlevel, currenttile.center.lat - currenttile.height * 0.75,
							 currenttile.center.lon - currenttile.width/2));
			    neighbors.push(wgsToTile(zoomlevel, currenttile.center.lat - currenttile.height * 0.75,
						     currenttile.center.lon + currenttile.width/2));
			}
			for( var ni = 0; ni < neighbors.length; ni++ ) {
			    var nei = neighbors[ni];
			    if( alltiles[nei.id] == null ) {
				alltiles[nei.id] = nei;
				uncheckedtiles.push(nei);
			    }
			}
		    }
		}
	    }
	    if( uncheckedtiles.length == 0 )
		break;
	    currenttile = uncheckedtiles.pop();
	}
	
	prevchecks = numchecks;
	prevvisibles = numvisibles;

	// sort by zoom level, then by view angle; results in center tiles loaded first
	visibletiles_sorted.sort(function(a,b) {
	    if( a.coord.zoom < b.coord.zoom )
		return -1;
	    else if( a.coord.zoom > b.coord.zoom )
		return 1;
	    else if( a.viewangle < b.viewangle )
		return -1;
	    else if( a.viewangle > b.viewangle )
		return 1;
	    return 0;
	});
	
	return { 
	    zoomlevel: zoomlevel,
	    tiles: visibletiles,
	    tiles_sorted: visibletiles_sorted,
	    rays: []
	};


	// legacy visibility implementation using ray tracing,
        // not used 

	var rays = [];
	var tiles = {};
	for( var ry = 0; ry < raysy; ry++ )
	    for( var rx = 0; rx < raysx; rx++ ) {
		var hit = calcRayHit(camera.getViewRay(rx/(raysx-1),
		    ry/(raysy-1)));
		if( hit ) {
		    var wgst = calcWGS(hit.x, hit.y, hit.z);
		    var tile = wgsToTile(zoomlevel, wgst.lat, wgst.lon);
		    rays.push({hit: hit, tile: tile.id});
		    if( tiles[tile.id] == null ) {
			tile.coord = calcTilePosition(tile.center.lat,
						      tile.center.lon,
						      tile.width/180*Math.PI,
						      tile.height/180*Math.PI);
			tile.coord.id = 'tiles-' + zoomlevel + '/' + 
			    tile.y + '-' + tile.x;
			tiles[tile.id] = tile;
		    }
		} else
		    rays.push({hit:hit});

	    }

	return {
	    zoomlevel: zoomlevel,
	    tiles: tiles,
	    rays: rays
	}
    }

    // calculate tile size in radians
    function calcTileSizeRadians(zoomlevel) {
	var steps = getTileSteps(zoomlevel);
	//var stepangle = 90 / ( steps - 1 );
	var stepdist = 2.0 * Math.PI * 1.0 / ( 2 * ( steps + steps - 2 ) ); 

	return stepdist;
    }

    var tilesizefactor = 1.2;

    // calculates tile position at given tile location and size
    function calcTilePosition(tilelat, tilelon, angleradiansx, angleradiansy) {
	//var angleradians = Math.max(angleradiansx, angleradiansy);
	var tana = Math.tan(angleradiansy/2);
	var tiledepth = A / Math.sqrt(1+2*tana*tana);
	var tilewidth = tilesizefactor * tilescalefactor * 2.0 * tiledepth * tana;

	var tilepos = calcXYZ(tilelat, tilelon);

	if( tilelat < 90 && tilelat > -90 ) {
	    var tileup = calcXYZ(tilelat+0.0001, tilelon);
	    var tileright = calcXYZ(tilelat, tilelon+0.0001);
	} else {
	    if( tilelat > 0 ) {
		var tileup = { x: tilepos.x - 1, y: tilepos.y, z: tilepos.z };
		var tileright = { x: tilepos.x, y: tilepos.y+1, z: tilepos.z };
	    } else {
		var tileup = { x: tilepos.x + 1, y: tilepos.y, z: tilepos.z };
		var tileright = { x: tilepos.x, y: tilepos.y-1, z: tilepos.z };
	    }
	}

	var tiledivwidth = 256;

	var tilex = vecm.normalize(vecm.difference(tilepos, tileright));
	var tiley = vecm.normalize(vecm.difference(tileup, tilepos));
	var tilez = vecm.normalize(vecm.difference(tilepos, {x:0, y:0, z:0}));
	tilex = vecm.normalize(vecm.crossp(tiley, tilez));
	tilez = vecm.normalize(vecm.crossp(tilex, tiley));
	tiley = vecm.normalize(vecm.crossp(tilez, tilex));
	
	tilepos = vecm.normalize(tilepos, tiledepth);


	var tilecorner = {
	    x: tilepos.x - 0.5 * tilewidth * ( tilex.x + tiley.x ),
	    y: tilepos.y - 0.5 * tilewidth * ( tilex.y + tiley.y ),
	    z: tilepos.z - 0.5 * tilewidth * ( tilex.z + tiley.z )
	};

	var tileborder = {
	    x: tilepos.x - 0.5 * tilewidth * tilex.x,
	    y: tilepos.y - 0.5 * tilewidth * tilex.y,
	    z: tilepos.z - 0.5 * tilewidth * tilex.z
	}
	
	// rotate 180 deg around z
	var cosa = Math.cos(Math.PI);
	var sina = Math.sin(Math.PI);
	var tilerotate = [ // not used at this time
	    cosa, -sina, 0, tiledivwidth,
	    sina, cosa, 0, tiledivwidth,
	    0, 0, 1, 0,
	    0, 0, 0, 1
	];
	
	var tileorientation = [
	    tilex.x, tiley.x, -tilez.x, tilecorner.x,
	    tilex.y, tiley.y, -tilez.y, tilecorner.y,
	    tilex.z, tiley.z, -tilez.z, tilecorner.z,
	    0, 0, 0, 1
	];
	var scale = tilewidth / tiledivwidth;
	var tilescale = [ 
	    scale, 0, 0, 0,
	    0, scale, 0, 0,
	    0, 0, scale, 0,
	    0, 0, 0, 1
	];

	//printmat('tileorientation new', tileorientation);
	//printmat('tilescale new', tilescale);
	
	var matrix = vecm.matrixmultiply(tileorientation, tilescale);

	var angledegx = angleradiansx / Math.PI * 180;
	var angledegy = angleradiansy / Math.PI * 180;

	var lonextra = angledegy*(tilescalefactor-1)/2;

	var backplane = { a: -tilez.x, b: -tilez.y, c: -tilez.z, d: 0 };
	var frontplane = { a: -tilez.x, b: -tilez.y, c: -tilez.z, 
 	                   d: vecm.dotp(tilez, tilepos) };
	
	var position = {
	    lat: tilelat,
	    latmin: tilelat - angledegy/2,
	    latmax: tilelat + angledegy/2,
	    lon: tilelon,
	    lonmin: tilelon - angledegx/2,
	    lonmax: tilelon + angledegx/2,
	    widthpx: tiledivwidth,
	    radius: 1.41421356237 * tilewidth / tilesizefactor,
	    width: tilewidth / tilesizefactor,
	    tilewidth: tilewidth,
	    tilescale: 1.0 / tilesizefactor,
	    depth: tiledepth,
	    height: tiledepth - A,
	    center: tilepos,
	    corner: tilecorner,
	    border: tileborder,
	    right: tilex,
	    down: tiley,
	    transform: matrix
	};

	if( position.latmin < -90 ) {
	    position.latmin = -90;
	    position.lonmin = -180;
	    position.lonmax = 180;
	}
	if( position.latmax > 90 ) {
	    position.latmax = 90;
	    position.lonmin = -180;
	    position.lonmax = 180;
	}

	var latdiff = 0;//(position.latmax - position.latmin)/10;
	position.waterarea = [
	    [ position.latmax + latdiff, position.lonmin-lonextra/3 ],
	    [ position.latmax + latdiff, position.lonmax+lonextra/3 ],
	    [ position.latmax, position.lonmax+lonextra/3 ],
	    [ position.latmin, position.lonmax+lonextra/3 ],
	    [ position.latmin - latdiff, position.lonmax+lonextra/3 ],
	    [ position.latmin - latdiff, position.lonmin-lonextra/3 ],
	    [ position.latmin, position.lonmin-lonextra/3 ],
	    [ position.latmax, position.lonmin-lonextra/3 ] 
	];

	var top = calcXYZ(position.latmax, position.lonmin).z;
	var bottom = calcXYZ(position.latmin, position.lonmin).z;

	position.planes = {
	    back: backplane,
	    front: frontplane,
	    top: vecm.createplane(calcXYZ(position.latmax, position.lonmin),
				  calcXYZ(position.latmax, position.lonmax),
				  { x:0, y: 0, z: top }),
	    bottom: vecm.createplane(calcXYZ(position.latmin, position.lonmin),
				     { x:0, y: 0, z: bottom },
				     calcXYZ(position.latmin, position.lonmax)),
	    miny: vecm.createplane(calcXYZ(position.latmin, position.lonmin),
			      calcXYZ(position.latmin, position.lonmax),
			      calcXYZ(position.latmin, position.lonmax, 100)),
	    maxy: vecm.createplane(calcXYZ(position.latmax, position.lonmax, 100),
			      calcXYZ(position.latmax, position.lonmax),
			      calcXYZ(position.latmax, position.lonmin)),
	    minx: vecm.createplane(calcXYZ(position.latmax, position.lonmin-lonextra, 100),
			      calcXYZ(position.latmax, position.lonmin-lonextra),
			      calcXYZ(position.latmin, position.lonmin-lonextra)),
	    maxx: vecm.createplane(calcXYZ(position.latmin, position.lonmax+lonextra),
			      calcXYZ(position.latmax, position.lonmax+lonextra),
			      calcXYZ(position.latmax, position.lonmax+lonextra, 100))
	}
	return position;
    }

    // calculates where a ray hits the earth
    function calcRayHit(rays) {
	var raystart = rays.from;
	var rayend = rays.to;
	
	var linedir = vecm.normalize(vecm.difference(raystart, rayend));
	var spherec = vecm.difference(raystart, {x:0, y:0, z:0});
	var spherer = A;
	
	var det = vecm.dotp(linedir, spherec) * vecm.dotp(linedir, spherec) - 
	    vecm.dotp(spherec, spherec) + spherer * spherer;
	
	if( det < 0 ) {
	    return null;
	} else if( det == 0 ) {
	    var hit = vecm.dotp(linedir, spherec) / vecm.dotp(linedir, linedir);
	} else if( det > 0 ) {
	    var hit = vecm.dotp(linedir, spherec) - Math.sqrt(det);
	    hit /= vecm.dotp(linedir, linedir);
	}
	
	var hitp = { x: raystart.x + hit * linedir.x,
	    y: raystart.y + hit * linedir.y,
	    z: raystart.z + hit * linedir.z };
	//console.log('hit at ' + hitp.x + ',' + hitp.y + ',' + hitp.z);
	return hitp;
    }
    
    // returns a set of functions
    return {
	getRadius: getRadius,
	getTileSteps: getTileSteps,
	calcXYZ: calcXYZ,
	calcWGS: calcWGS,
	wgsToTile: wgsToTile,
	calcNumTileRows: calcNumTileRows,
	calcNumTileColumns: calcNumTileColumns,
	calcTileCenter: calcTileCenter,
	calcTileWidth: calcTileWidth,
	calcTileHeight: calcTileHeight,
	calcScaleDenominator: calcScaleDenominator,
	calcVisibleTiles: calcVisibleTiles,
	calcTilePosition: calcTilePosition,
	calcRayHit: calcRayHit
    };
}

// for node.js use
if( typeof exports !== 'undefined' ) {
    exports.WGS84 = WGS84;
}

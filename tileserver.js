var vecm = require('./math.js').VecMath();
var WGS84 = require('./wgs.js').WGS84;
var Camera = require('./camera.js').Camera;

var async = require('async');

var cam = Camera();

var wgs = WGS84();

var Canvas = require('canvas');
var fs = require('fs');
var pg = require('pg');

var express = require('express');

var datasource = require('./datasource.js').DataSource();

var renderedtiles = {};

// clips a polygon to the tile currently being rendered.
function polygon_clip(polygon, tilec, tilelat, linestring) {
    
    var clipped = [];
    for( var ppi = 0; ppi < polygon.length; ppi++ )
	clipped.push(wgs.calcXYZ(polygon[ppi][1], 
				 polygon[ppi][0]));
    
    var clipped2 = [];

    var planes = tilec.planes;

    var offset = 0;
    if( linestring )
	var offset = 1;
    
    var pointinside = false;
    if( tilelat == 90 || tilelat == -90 ) {
	var rad = wgs.getRadius();
	
	for( var ppi = 0; ppi < clipped.length; ppi++ ) {
	    var point = clipped[ppi];
	    var prev = clipped[(ppi+clipped.length-1)%clipped.length];
	    point = vecm.projectradial(point, planes.front);
	    prev = vecm.projectradial(prev, planes.front);
	    
	   /* if( point )
		if( Math.abs(point.x) > 2*rad ||
		    Math.abs(point.y) > 2*rad ||
		    Math.abs(point.z) > 2*rad )
		    point = null;
	    if( prev )
		if( Math.abs(prev.x) > 2*rad ||
		    Math.abs(prev.y) > 2*rad ||
		    Math.abs(prev.z) > 2*rad )
		    prev = null;*/
	    
	    if( point && prev ) {
		if( point.rotated === undefined )
		    pointinside = true;
		clipped2.push(point);
		continue;
		var pointdist = vecm.veclength(vecm.difference
					       (tilec.center, point));
		var prevdist = vecm.veclength(vecm.difference
					      (tilec.center, prev));
		
		if( pointdist <= tilec.width/2 ) {
		    pointinside = true;
		    if( prevdist > tilec.width/2 && (!linestring || ppi > 0)) {
			var clp = vecm.clipradius(tilec.center, prev, point, 
						  tilec.width/2);
			if( clp ) {
			    clp.clipin = true;
			    clipped2.push(clp);
			}
		    }
		    clipped2.push(point);
		} else if( prevdist <= tilec.width/2 ) {
		    var clp = vecm.clipradius(tilec.center, prev, point, 
					      tilec.width/2);
		    if( clp ) {
			clp.clipout = true;
			clipped2.push(clp);
		    }
		} else {
		    var clp = vecm.clipradius(tilec.center, null, point,
					      tilec.width/2);
		    if( clp )
			clipped2.push(clp);
		}
	    }
	}
	clipped = clipped2;
    } else {
	for( var ppi = 0; ppi < clipped.length; ppi++ ) {
	    var point = clipped[ppi];
	    var prev = clipped[(ppi+clipped.length-1)%clipped.length];
	    
	    point = vecm.projectradial(point, planes.front);
	    prev = vecm.projectradial(prev, planes.front);

	    if( point )
		if( point.rotated === undefined )
		    pointinside = true;
	    if( point && prev ) {
		clipped2.push(point);
	    } else if( point && !prev ) {
		point.clipin = true;
		clipped2.push(point);
	    } else if( !point && prev ) {
		if( clipped2.length > 0 )
		    clipped2[clipped2.length-1].clipout = true;
	    }
	    continue;

	    if( point && prev ) {
		if( point.rotated === undefined )
		    pointinside = true;
		clipped2.push(point);
		continue;
		if( vecm.inside(point, planes.minx) ) {
		    if( vecm.inside(prev, planes.minx) == false && (!linestring || ppi > 0)) {
			var clp = vecm.intersect(prev, point, planes.minx);
			clp.clipin = true;
			clipped2.push(clp);
		    }
		    clipped2.push(point);
		} else if( vecm.inside(prev, planes.minx) ) {
		    var clp = vecm.intersect(prev, point, planes.minx);
		    clp.clipout = true;
		    clipped2.push(clp);
		}
	    }
	}
	clipped = clipped2;
	clipped2 = [];
    }
    // if none of the points was inside, all were outside so the intersection is empty
    if( !pointinside )
	return [];
    return clipped;
}

var unknownrules = {};
var rendering = false;
var rendering_waitlist = [];

// renders a tile at the specified location.
function rendertile(tilelat, tilelon, tilewidth, tileheight, zoomlevel, id, callback) {

    // stupid filename convention, should be something like z/y/x.png 
    var filename = 'tiles-' + zoomlevel + '/' + id + '.png';
    
    fs.exists(filename, function(exists) {
	if( exists ) {
	    console.log('tile exists:' + filename);
	    callback(null, fs.createReadStream(filename));
	    if( !rendering && rendering_waitlist.length > 0 )
		async.nextTick(rendering_waitlist.pop());
	} else {

	    if( rendering ) {
		console.log('rendering ' + filename + ' (queued)');
		rendering_waitlist.push(function() {
		    rendertile(tilelat, tilelon, tilewidth, tileheight, zoomlevel, id, callback);
		});
		return;
	    } else
		rendering = true;

	    console.log('rendering ' + filename);

	    //console.log('rendering tile ' + filename);
	    if( !norender ) {
		if( renderedtiles[filename] == null ) {
		    var waitobj = { rendering: true, waitlist: [], timer: null };
		    var starttime = new Date().getTime();
		    var timerfun = function() {
			console.log('RENDERING ' + filename + ' FOR ' + 
				    Math.floor((new Date().getTime() - starttime)/1000) +
				    ' SECONDS');
			waitobj.timer = setTimeout(timerfun, 60000);
		    }
		    waitobj.timer = setTimeout(timerfun, 60000);
		    renderedtiles[filename] = waitobj;
		} else {
		    console.log('not rendering tile multiple times, waiting');
		    renderedtiles[filename].waitlist.push(function() {
			console.log('tile that we were waiting for, is rendered');
			rendertile(tilelat, tilelon, tilewidth, tileheight, zoomlevel, id, callback);
		    });
		    return;
		}
	    }

	    var tilec = wgs.calcTilePosition(tilelat, tilelon, 
					     tilewidth/180*Math.PI, 
					     tileheight/180*Math.PI);
	   
	    var canvas = new Canvas(256, 256);
	    var ctx = canvas.getContext('2d');
	    
	    cam.setViewFrustum(90, 256, 256);

	    var camerah = tilec.height + 0.5 * tilec.width;
	    
	    var camerapos = wgs.calcXYZ(tilelat, tilelon, camerah);
	    
	    if( tilelat < 90 && tilelat > -90 )
		var cameraup = wgs.calcXYZ(tilelat+0.0001, tilelon, camerah);
	    else {
		if( tilelat > 0 )
		    var cameraup = { x: camerapos.x - 1, y: camerapos.y, 
				     z: camerapos.z };
		else
		    var cameraup = { x: camerapos.x + 1, y: camerapos.y, 
				     z: camerapos.z };
	    }
	    
	    var camerato = { x: 0, y: 0, z: 0 };
	    cam.setView(camerapos, camerato, cameraup);

	    var scaledenominator = wgs.calcScaleDenominator(cam);
	    
	    var map2proj = cam.getProjectionMatrix();
	    var map2cam = cam.getCameraMatrix();
	    
	    ctx.antialias='none';
	    ctx.translate(128,128);
	    ctx.scale(tilec.tilescale,
		      tilec.tilescale);

	    if( zoomlevel == 1 )
		var factor = 1.0 + 3.0 / (128 * tilec.tilescale);
	    else if( zoomlevel == 2 )
		var factor = 1.0 + 2.0 / (128 * tilec.tilescale);
	    else
		var factor = 1.0 + 1.0 / (128 * tilec.tilescale);
	    
	    //ctx.scale(1.01,1.01);
	    
	    function polygon_fill_path(bd, fill) {
		if( !bd )
		    return;
		if( fill )
		    ctx.beginPath();

		for( var gi = 0; gi < bd.length; gi++ ) {
		    var p = vecm.multiply(map2proj, bd[gi]);
		    
		    var sx = p.x / p.w;
		    var sy = p.y / p.w;

		    if( gi == 0 )
			ctx.moveTo(sx, sy);
		    else 
			ctx.lineTo(sx, sy);
		}
		
		if( fill ) {
		    ctx.closePath();
		    ctx.fill();
		}
		return;
	    }

	    function polygon_stroke_path(bd, linestring, dasharray) {
		if( !bd )
		    return;
		if( bd.length == 0 )
		    return;
		ctx.beginPath();

		var inside = true;
		var offset = 0;
		for( var gi = 0; gi < bd.length && !linestring; gi++ ) {
		    if( bd[gi].clipin ) {
			offset = gi;
			break;
		    }
		}

		if( dasharray == null ) {
		    for( var gi = 0; gi < bd.length; gi++ ) {// + 1; gi++ ) {
			var gi1 = (gi+1)%bd.length;
			var p = vecm.multiply(map2proj, bd[gi]);
			
			var sx = p.x / p.w;
			var sy = p.y / p.w;
		
			if( bd[gi].clipout )
			    continue;
			if( bd[gi].clipin || gi == 0 )
			    ctx.moveTo(sx, sy);
			else 
			    ctx.lineTo(sx, sy);
		    }
		    ctx.stroke();
		    ctx.closePath();
		} else {
		    var dashlen = 0;
		    var scaled_dash = [];
		    for( var di = 0; di < dasharray.length; di++ ) {
			var tmpd = dasharray[di]/tilec.tilescale;
			if( di > 0 )
			    tmpd += scaled_dash[di-1]; // cumulate
			scaled_dash.push(tmpd);
		    }
			    
		    var px, py, dashi = 0, dashlen = 0;
		    for( var gi = 0; gi < bd.length - 2; gi++ ) {
			var p0 = vecm.multiply(map2proj, bd[gi]);
			var p1 = vecm.multiply(map2proj, bd[gi+1]);
			
			p0.x /= p0.w;
			p0.y /= p0.w;
			p0.z = 0;
			p1.x /= p1.w;
			p1.y /= p1.w;
			p1.z = 0;

			if( bd[gi].clipout )
			    continue;
			if( bd[gi].clipin || gi == 0 )
			    ctx.moveTo(p0.x, p0.y);
			
			var strokelen = vecm.veclength(vecm.difference(p0,p1));
			while(true) {
			    if( dashlen + strokelen < scaled_dash[dashi] ) {
				if( (dashi%2) == 0 )
				    ctx.lineTo(p1.x, p1.y);
				else
				    ctx.moveTo(p1.x, p1.y);
				dashlen += strokelen;
				break;
			    } else {
				var curlen = scaled_dash[dashi] - dashlen;
				var midp = vecm.sum(p0, vecm.normalize(vecm.difference(p0,p1), curlen));
				dashlen += curlen;
				if( (dashi%2) == 0 )
				    ctx.lineTo(midp.x, midp.y);
				else
				    ctx.moveTo(midp.x, midp.y);
				// update state
				p0 = midp;
				strokelen -= curlen;
				dashi++;
				if( dashi == scaled_dash.length ) {
				    dashlen -= scaled_dash[dashi-1];
				    dashi = 0;
				}
			    }
			}
		    }
		    ctx.stroke();
		    ctx.closePath();
		}
	    }

	    var clippath = [];
	    var steps = 100;
	    for( var ci = 0; ci < steps; ci++ ) {
		var lat = tilec.latmax;
		var lon = tilec.lonmin + (ci/(steps-1)) * (tilec.lonmax - tilec.lonmin);
		var p = vecm.projectradial(wgs.calcXYZ(lat, lon), tilec.planes.front);
		var coord = vecm.multiply(map2proj, p);
		clippath.push({x: factor*coord.x/coord.w, 
			       y: factor*coord.y/coord.w, z:0});
	    }
	    for( var ci = 0; ci < steps; ci++ ) {
		var lat = tilec.latmin;
		var lon = tilec.lonmax - (ci/(steps-1)) * (tilec.lonmax - tilec.lonmin);
		var p = vecm.projectradial(wgs.calcXYZ(lat, lon), tilec.planes.front);
		var coord = vecm.multiply(map2proj, p);
		clippath.push({x: factor*coord.x/coord.w, 
			       y: factor*coord.y/coord.w, z:0});
	    }
	    ctx.beginPath();
	    for( var ci = 0; ci < clippath.length; ci++ ) {
		if( ci == 0 )
		    ctx.moveTo(clippath[ci].x, clippath[ci].y);
		else
		    ctx.lineTo(clippath[ci].x, clippath[ci].y);		    
	    }
	    ctx.closePath();
	    //ctx.clip();

//	    ctx.scale(1/1.01,1/1.01);
	    ctx.beginPath();
	    for( var ci = 0; ci < clippath.length; ci++ ) {
		if( ci == 0 )
		    ctx.moveTo(clippath[ci].x, clippath[ci].y);
		else
		    ctx.lineTo(clippath[ci].x, clippath[ci].y);		    
	    }
	    ctx.closePath();	    
	    
	    if( map['background-color'] )
		ctx.fillStyle = map['background-color'];
	    else
		ctx.fillStyle = 'rgb(255,255,255)';//100,120,250)';
	    ctx.fill();

//	    ctx.scale(1.01,1.01);

	    ctx.antialias = 'default';
	    
	    var polytext = 'GeomFromText(\'POLYGON((' + 
			tilec.lonmin + ' ' + tilec.latmin + ', ' + tilec.lonmin + ' ' + tilec.latmax + ', ' + 
			tilec.lonmax + ' ' + tilec.latmax + ', ' + tilec.lonmax + ' ' + tilec.latmin + ', ' +
			tilec.lonmin + ' ' + tilec.latmin + '))\',4326)';
	    var dbclient = null;

	    
	    if( map.Style.length === undefined )
		map.Style = [ map.Style ];
	    if( map.Layer.length === undefined )
		map.Layer = [ map.Layer ];

	    //console.log(map.Style.length + ' styles, ' + map.Layer.length + ' layers');

	    function formatRule(filter) {
		if( filter == null )
		    return null;
		return filter.replace(/&amp;/g, '&').
		    replace(/&#35;/g, '#').
		    replace(/&apos;/g, '\'').
		    replace(/&#40;/g, '(').
		    replace(/&#41;/g, ')').
		    replace(/&lt;/g, '<').
		    replace(/&gt;/g, '>');
	    }

	    // checks a rule
	    function checkRule(filter, properties) {
		if( filter == null )
		    return true;

		var composite = filter.match(/^\s*\((.+)\)\s*(and|or)\s*\((.+)\)\s*$/);
		if( composite ) {
		    var oper = composite[2].toLowerCase();
		    var res1 = checkRule(composite[1], properties);
		    var res2 = checkRule(composite[3], properties);
		    if( oper == 'and' )
			return res1 && res2;
		    else if( oper == 'or' )
			return res1 || res2;
		    else {
			console.log('REGEX unknown operator ' + oper + ' (' + filter + ')');
			return true;
		    }
		}

		var parentheses = filter.match(/^\s*\((.+)\)\s*$/);
		if( parentheses ) {
		    //console.log('REGEX removed parentheses ' + filter + ' -> ' + parentheses[1]);
		    filter = parentheses[1];
		}

		var expr = filter.match(/^\s*\[(.+)\]\s*(<=|>=|!=|[=><])\s*(.+)\s*$/);
		if( expr == null ) {
		    console.log('UNKNOWN REGEX ' + filter);
		    return true;
		}
		var propname = expr[1];
		var oper = expr[2];
		var propval = expr[3];

		var strval = propval.match(/^\x27(.+)\x27$/);
		if( strval )
		    propval = strval[1];
		else { 
		    if( propval.indexOf('.') )
			propval = parseFloat(propval);
		    else
			propval = parseInt(propval);
		    if( isNaN(propval) ) {
			console.log('REGEX NAN ' + expr[3] + ' :' + filter);
			return true;
		    }
		}

		if( properties[propname] === undefined )
		    return false;

		if( typeof properties[propname] != typeof propval ) {
		    console.log('REGEX TYPE MISMATCH ' + typeof properties[propname] + ' - ' + typeof propval);
		    return true;
		}

		if( oper == '=' )
		    return (properties[propname] == propval);
		else if( oper == '!=' )
		    return (properties[propname] != propval);
		else if( oper == '<=' )
		    return (properties[propname] <= propval);
		else if( oper == '>=' )
		    return (properties[propname] >= propval);
		else if( oper == '<' )
		    return (properties[propname] < propval);
		else if( oper == '>' )
		    return (properties[propname] > propval);
		else
		    console.log('UNKNOWN REGEX OPER ' + oper);
		return false;
	    }

	    function renderLayer(data, style, rendercallback) {

		if( style.Rule == null )
		    return;
		if( style.Rule.length === undefined )
		    style.Rule = [ style.Rule ];

		var stage = 1;
		async.whilst(
		    function() { return (stage < 4); },
		    function(whcallback) {
			async.forEachSeries(
			    data.features, 
			    function(feat, featurecallback) {
				var prop = feat.properties;
				var geom = feat.geometry;
				
				var linecolor = null;
				var linewidth = 0;
				var linejoin = 'round';
				var linecap = 'butt';
				var dasharray = null;
				var lineopacity = 1.0;
				var polygonfill = null;
				var polygonopacity = 1.0;

				var textsize;
				var textfill = null;
				var textdy = 0;
				var textfontsetname = null;
				var textplacement = null;
				var textcharspacing = null;
				var textlinespacing = null;
				var textspacing = null;
				var texthalofill = null;
				var texthaloradius = null;
				var texttransform = null;
				var textwrapwidth = null;
				var textattrname = null;
				
				for( var ri = 0; ri < style.Rule.length; ri++ ) {
				    var rule = style.Rule[ri];
				    
				    if( rule.MaxScaleDenominator !== undefined )
					if( scaledenominator > rule.MaxScaleDenominator )
					    continue;
				    if( rule.MinScaleDenominator !== undefined )
					if( scaledenominator < rule.MinScaleDenominator )
					    continue;
				    if( checkRule(formatRule(rule.Filter), prop) == false )
					continue;
				    
				    if( rule.PolygonSymbolizer ) {
					if( rule.PolygonSymbolizer.fill ) {
					    polygonfill = rule.PolygonSymbolizer.fill;
					    if( rule.PolygonSymbolizer['fill-opacity'] )
						polygonopacity = rule.PolygonSymbolizer['fill-opacity'];
					}
				    } 
				    if( rule.LineSymbolizer ) {
					if( rule.LineSymbolizer['stroke-linejoin'] )
					    linejoin = rule.LineSymbolizer['stroke-linejoin'];
					if( rule.LineSymbolizer['stroke-linecap'] )
					    linecap = rule.LineSymbolizer['stroke-linecap'];
					if( rule.LineSymbolizer['stroke-width'] )
					    linewidth = rule.LineSymbolizer['stroke-width'];
					if( rule.LineSymbolizer['stroke-dasharray'] )
					    dasharray = rule.LineSymbolizer['stroke-dasharray'];
					if( rule.LineSymbolizer.stroke ) {
					    linecolor = rule.LineSymbolizer.stroke;
					    if( rule.LineSymbolizer['stroke-opacity'] )
						lineopacity = rule.LineSymbolizer['stroke-opacity'];
					}
				    }
				    if( rule.TextSymbolizer ) {
					if( rule.TextSymbolizer.size !== undefined )
					    textsize = rule.TextSymbolizer.size;
					if( rule.TextSymbolizer['character-spacing'] )
					    textcharspacing = rule.TextSymbolizer['character-spacing'];
					if( rule.TextSymbolizer['line-spacing'] )
					    textlinespacing = rule.TextSymbolizer['line-spacing'];
					if( rule.TextSymbolizer.dy !== undefined )
					    textdy = rule.TextSymbolizer.dy;
					if( rule.TextSymbolizer['fontset-name'] )
					    textfontsetname = rule.TextSymbolizer['fontset-name'];
					if( rule.TextSymbolizer['text-transform'] )
					    texttransform = rule.TextSymbolizer['text-transform'];
					if( rule.TextSymbolizer.fill )
					    textfill = rule.TextSymbolizer.fill;
					if( rule.TextSymbolizer.placement )
					    textplacement = rule.TextSymbolizer.placement;
					if( rule.TextSymbolizer.spacing )
					    textspacing = rule.TextSymbolizer.spacing;
					if( rule.TextSymbolizer['halo-fill'] )
					    texthalofill = rule.TextSymbolizer['halo-fill'];
					if( rule.TextSymbolizer['halo-radius'] )
					    texthaloradius = rule.TextSymbolizer['halo-radius'];
					if( rule.TextSymbolizer['wrap-width'] )
					    textwrapwidth = rule.TextSymbolizer['wrap-width'];
					if( rule.TextSymbolizer['$t'] )
					    textattrname = rule.TextSymbolizer['$t'];
				    }
				}
				
				var pointgeom = false;
				if( geom.type == 'Point' ) {
				    var polygons = [[[geom.coordinates]]];
				    var linestring = false;
				    var pointgeom = true;
				} else if( geom.type == 'LineString' ) {
				    var polygons = [[geom.coordinates]];
				    var linestring = true;
				} else if( geom.type == 'MultiLineString' ) {
				    var polygons = [];
				    for( var ggi = 0; ggi < geom.coordinates; ggi++ )
					polygons.push([geom.coordinates[ggi]]);
				    var linestring = true;
				} else if( geom.type == 'Polygon' ) {
				    var polygons = [geom.coordinates];
				    var linestring = false;
				} else if( geom.type == 'MultiPolygon' ) {
				    var polygons = geom.coordinates;
				    var linestring = false;
				}

				if( dasharray ) {
				    try {
					var da = dasharray.split(',');
					if( da.length >= 2 ) {
					    for( var ai = 0; ai < da.length; ai++ ) {
						da[ai] = parseFloat(da[ai].trim());
						if( isNaN(da[ai]) )
						    throw new Exception('error parsing float');
					    }
					    dasharray = da;
					}
				    } catch(exc) {
					console.log('exception ' + exc + ' when parsing dash array ' + dasharray);
					dasharray = null;
				    }
				}
				
				if( linejoin != 'round' &&
				    linejoin != 'bevel' &&
				    linejoin != 'miter' )
				    linejoin = 'round';

				if( linecap != 'butt' &&
				    linecap != 'round' &&
				    linecap != 'square' )
				    linecap = 'round';

				if( polygonfill && stage == 1 ) {
				    ctx.fillStyle = polygonfill;
				    ctx.globalAlpha = polygonopacity;
				    for( var pi = 0; pi < polygons.length; pi++ ) {
					for( var ppi = 0; ppi < polygons[pi].length; ppi++ ) {
					    var coord = polygons[pi][ppi];
					    polygon_fill_path(polygon_clip(coord, tilec, tilelat, false), true);
					}
				    }
				}
				if( linecolor && stage == 2 ) {
				    ctx.strokeStyle = linecolor;
				    ctx.lineWidth = linewidth;
				    ctx.lineCap = linecap;
				    ctx.lineJoin = linejoin;
				    ctx.globalAlpha = lineopacity;
				    for( var pi = 0; pi < polygons.length; pi++ ) {
					for( var ppi = 0; ppi < polygons[pi].length; ppi++ ) {
					    var coord = polygons[pi][ppi];
					    polygon_stroke_path(polygon_clip(coord, tilec, tilelat, linestring), 
								linestring, dasharray);
					}
				    }			
				}
				if( pointgeom && stage == 3 ) {
				    
				}
				async.nextTick(featurecallback);
			    },
			    function() {
				stage++;
				whcallback();
			    });
		    },
		    rendercallback
		);
	    }

	    if( norender )
		map.Layer = [];

            var mapfonts = {};
   	    if( map.FontSet ) {
		var fontsets = [ map.FontSet ];
		if( map.FontSet.name === undefined )
		    fontsets = map.FontSet;
		for( var fi = 0; fi < fontsets.length; fi++ )
		    if( fontsets[fi].name )
			mapfonts[fontsets[fi].name] = fontsets[fi].Font;
	    }
	    
	    // render each layer in the project
	    async.forEachSeries(
		map.Layer,
		function(layer, layercallback) {
		    if( typeof layer.StyleName == 'string' )
			layer.StyleName = [ layer.StyleName ];

		    // go through each style and find matching one
		    async.forEachSeries(
			layer.StyleName,
			function(layerstyle, layerstylecallback) {
			    var rendered = false;
			    async.forEachSeries(
				map.Style,
				function(style, stylecallback) {
				    if( layerstyle == style.name ) {
					// get parameters
					var source = {};
					for( var pi = 0; pi < layer.Datasource.Parameter.length; pi++ ) {
					    var param = layer.Datasource.Parameter[pi];
					    if( param.name && param['$t'] )
						source[param.name] = param['$t'];
					}
					// get datasource
					datasource.get(
					    source,
					    tilec.latmin, tilec.latmax, 
					    tilec.lonmin, tilec.lonmax,
					    function(err, data) {
						if( err ) {
						    console.log('ERROR getting datasource :' + err);
						    stylecallback(err);
						} else {
						    rendered = true;
						    // render!
						    renderLayer(data, style, stylecallback);
						}
					    });
				    } else
					async.nextTick(stylecallback);
				},
				function(err) {
				    //if( err )
				    //  console.log('ERROR ' + err);
				    //if( rendered == false )
				    //	console.log('layer ' + layer.name + ' style ' + layerstyle + ' not rendered');
				    layerstylecallback();
				}
			    );
			},
			function(err) {
			    //if( err )
			    //    console.log('ERROR rendering layer: ' + err);
			    layercallback(err);
			}
		    );
		},
		function(err) {
		    // clip rendered tile pixels to the tile form
		    async.waterfall([
			function(wfcallback) {
			    wfcallback(err);
			},
			function(wfcallback) {
			    if( norender ) {
				async.nextTick(wfcallback);
				return;
			    }
			    //console.log('clipping pixels');
			    var imagedata = ctx.getImageData(0,0,256,256);
			    var pixels = imagedata.data;
			    //console.log('got ' + (pixels.length/4) + ' pixels');
			    for( var pi = 0; pi < clippath.length; pi++ ) {
				clippath[pi].x = clippath[pi].x * tilec.tilescale + 128;
				clippath[pi].y = clippath[pi].y * tilec.tilescale + 128;
			    }
			    for( var pi = 0; pi < pixels.length; pi+=4 ) {

				if( pixels[pi+0] == 0 && pixels[pi+1] == 0 &&
				    pixels[pi+2] == 0 && pixels[pi+3] == 0 )
				    continue;

				//var ppx = 1.01 * tilec.tilescale * (Math.floor(pi/4) % 256) + 0.5 - 128;
				//var ppy = 1.01 * tilec.tilescale * (Math.floor((pi/4)/256)) + 0.5 - 128;
				var ppx = (Math.floor(pi/4) % 256) + 0.5;
				var ppy = (Math.floor((pi/4)/256)) + 0.5;

				var outside = false;
				if( tilec.latmax == 90 || tilec.latmin == -90 ) {
				    if( Math.sqrt((ppx-128)*(ppx-128)+(ppy-128)*(ppy-128)) > 
					factor * 128 * tilec.tilescale )
					outside = true;
				} else if( tilec.lat > 0 ) {
				    for( var si = 99; si < 200 && !outside; si++ ) {
					var pathvec = vecm.difference(clippath[si], clippath[(si+1)%clippath.length]);
					var testvec = vecm.difference(clippath[si], {x: ppx, y: ppy, z:0});
					
					if( vecm.crossp(pathvec, testvec).z < 0 ) {
					    outside = true;
					    break; 
					}
				    }
				    for( var si = 0; si < 99 && !outside; si++ ) {
					var pathvec = vecm.difference(clippath[si], clippath[si+1]);
					var testvec = vecm.difference(clippath[si], {x: ppx, y: ppy, z:0});
					
					if( vecm.crossp(pathvec, testvec).z >= 0 )
					    break; // inside
				    }
				    if( si == 99 )
					outside = true;
				} else if( tilec.lat < 0 ) {
				    for( var si = -1; si < 100 && !outside; si++ ) {
					var pathvec = vecm.difference(clippath[(si+clippath.length)%clippath.length], 
								      clippath[(si+1)%clippath.length]);
					var testvec = vecm.difference(clippath[(si+clippath.length)%clippath.length], 
								      {x: ppx, y: ppy, z:0});
					
					if( vecm.crossp(pathvec, testvec).z < 0 ) {
					    outside = true;
					    break; 
					}
				    }
				    for( var si = 100; si < 199 && !outside; si++ ) {
					var pathvec = vecm.difference(clippath[si], clippath[si+1]);
					var testvec = vecm.difference(clippath[si], {x: ppx, y: ppy, z:0});
					
					if( vecm.crossp(pathvec, testvec).z >= 0 )
					    break; // inside
				    }
				    if( si == 199 )
					outside = true;
				} else if( tilec.lat == 0 ) {
				    var pathvec = vecm.difference(clippath[199], clippath[0]);
				    var testvec = vecm.difference(clippath[199], {x: ppx, y: ppy, z:0});
				    if( vecm.crossp(pathvec, testvec).z < 0 )
					outside = true;
				    var pathvec = vecm.difference(clippath[99], clippath[100]);
				    var testvec = vecm.difference(clippath[99], {x: ppx, y: ppy, z:0});
				    if( vecm.crossp(pathvec, testvec).z < 0 )
					outside = true;
				    for( var si = 0; si < 99 && !outside; si++ ) {
					var pathvec = vecm.difference(clippath[si], clippath[si+1]);
					var testvec = vecm.difference(clippath[si], {x: ppx, y: ppy, z:0});
					
					if( vecm.crossp(pathvec, testvec).z >= 0 )
					    break; // inside
				    }
				    if( si == 99 )
					outside = true;
				    for( var si = 100; si < 199 && !outside; si++ ) {
					var pathvec = vecm.difference(clippath[si], clippath[si+1]);
					var testvec = vecm.difference(clippath[si], {x: ppx, y: ppy, z:0});
					
					if( vecm.crossp(pathvec, testvec).z >= 0 )
					    break; // inside
				    }
				    if( si == 199 )
					outside = true;
				}
			
				if( outside ) {
				    pixels[pi] = 0;
				    pixels[pi+1] = 0;
				    pixels[pi+2] = 0;
				    pixels[pi+3] = 0;
				} else if( pixels[pi+3] != 0 )
				    pixels[pi+3] = 255;
			    }
			    //ctx.clearRect(0,0,256,256);
			    ctx.putImageData(imagedata,0,0);
			    async.nextTick(wfcallback);
			},
			function(wfcallback) {
			    console.log('storing ' + filename);
			    fs.mkdir('tiles-' + zoomlevel, function(err) { wfcallback(); });
			},
			function(wfcallback) {	
			    if( norender ) {
				//console.log('returning duplicate stream to requester');
				async.nextTick(wfcallback);
				callback(null, canvas.createPNGStream());
			    } else {
				var out = fs.createWriteStream(filename)
				, stream = canvas.createPNGStream();
				
				stream.on('data', function(os) { return function(chunk){
				    os.write(chunk);
				}}(out));
				stream.on('end', function(os, imgfile) { return function(){
				    os.destroySoon();
				}}(out, filename));
				out.on('close', function(imgfile) { return function(){
				    
				    if( renderedtiles[imgfile].timer )
					clearTimeout(renderedtiles[imgfile].timer);
				    if( renderedtiles[imgfile].waitlist.length > 0 ) {
					console.log('notifying ' + renderedtiles[imgfile].waitlist.length + 
						    ' waiters on tile ' + imgfile);
					async.parallel(renderedtiles[imgfile].waitlist);
				    }
				    console.log('created ' + imgfile);
				    //console.log('returning duplicate stream to requester');
				    async.nextTick(wfcallback);
				    callback(null, canvas.createPNGStream());
				}}(filename));    
			    }
			}
		    ], function(err) {
			if( err )
			    console.log('ERROR rendering tile: ' + err);
			rendering = false;
			if( rendering_waitlist.length > 0 ) {
			    console.log('next renderer - go (' + rendering_waitlist.length + ' queued)');
			    async.nextTick(rendering_waitlist.pop());
			}
		    });
		}
	    );
	}
    });
}


// set up a simple tile server
var app = express();
app.use(function(req, res, next) {
    //	app.get('tiles-:zoom/:tiley-:tilex.png', function(req, res) {	    
    console.log('requesting ' + req.url);
    
    var tileurl = req.url.indexOf('/tiles-');
    if( tileurl != -1 )
	tileurl = req.url.substring(tileurl+7);
    else
	tileurl = null;
    
    if( tileurl ) {
	//console.log('parsing url ' + tileurl);
	var zoom = parseInt(tileurl.substring(0, tileurl.indexOf('/')));
	var tiley = parseInt(tileurl.substring(tileurl.indexOf('/')+1,
					       tileurl.indexOf('-', tileurl.indexOf('/'))));
	var tilex = parseInt(tileurl.substring(tileurl.indexOf('-', tileurl.indexOf('/'))+1,
					       tileurl.length-4));
	//console.log('rendering ' + zoom + ' ' + tiley + ' ' + tilex);
	var tilecenter = wgs.calcTileCenter(zoom, tiley, tilex);
	var tilew = wgs.calcTileWidth(zoom, tiley);
	var tileh = wgs.calcTileHeight(zoom);
	
	// console.log('rendering ' + tilecenter.lat + ', ' + tilecenter.lon + ', to ' + si + '-' + hi);
	rendertile(tilecenter.lat, tilecenter.lon,
		   tilew, tileh, zoom,
		   tiley + '-' + tilex, function(err, result) {
		       if( err ) {
			   res.writeHead(500);
			   res.end('error');
		       } else {
			   res.writeHead(200);
			   result.pipe(res);
		       }
		   });
    } else {
	var filename = __dirname + req.url;
	fs.exists(filename, function(exists) {
	    if( !exists ) {
		res.writeHead(404);
		res.end('not found');
	    } else {
		var stream = fs.createReadStream(filename);
		res.writeHead(200);
		stream.pipe(res);
	    }
	});
    }
});
app.use(express.static(__dirname));

// process a xml project file into json
var map = null;
var norender = false;
if( process.argv.length >= 3 ) {
    var xml2json = require('xml2json');

    console.log('reading ' + process.argv[2]);
    var mmlin = fs.createReadStream(process.argv[2]);
    var chunks = [];
    
    mmlin.on('data', function(data) {
	chunks.push(data);
    });
    mmlin.on('end', function() {
	try {
	    map = JSON.parse(xml2json.toJson(chunks.join('')));
	    map = map.Map;

	    // if zoom level is given, do not run the tile server but render all tiles as a batch job
	    if( process.argv.length >= 4 ) {
		var zoomlevel = parseInt(process.argv[3]);
		if( isNaN(zoomlevel) || zoomlevel < 0 )
		    console.log('undefined zoomlevel');
		else {
		    console.log('rendering tiles for zoomlevel ' + zoomlevel);
		    var rows = wgs.calcNumTileRows(zoomlevel);
		    var tiley = 0;
		    async.whilst(
			function() { return (tiley < rows); },
			function(wcallback) {
			    var columns = wgs.calcNumTileColumns(zoomlevel, tiley);
			    var tilex = 0;
			    async.whilst(
				function() { return (tilex < columns); },
				function(wcallback) {
				    var tilecenter = wgs.calcTileCenter(zoomlevel, tiley, tilex);
				    var tilew = wgs.calcTileWidth(zoomlevel, tiley);
				    var tileh = wgs.calcTileHeight(zoomlevel);
				    
				    rendertile(tilecenter.lat, tilecenter.lon,
					       tilew, tileh, zoomlevel,
					       tiley + '-' + tilex, function(err, result) {
						   tilex++;
						   wcallback(err);
					       });
				},
				function(err) {
				    tiley++;
				    wcallback(err);
				});
			},
			function(err) {
			    if( err )
				console.log('error rendering tiles: ' + err);
			    else
				console.log('success.');
			});
		}
	    } else { 
		// if no zoomlevel given, run the tile server
		norender = true;
		app.listen(3000);
		console.log('listening');
	    }
	} catch(err) {
	    console.log('error parsing json: ' + err);
	}
    });
}


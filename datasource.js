
var shp2json = require('shp2json');
var fs = require('fs');
var async = require('async');
var pg = require('pg');

//
// reads various geographical data sources, currently shapefiles and PostGIS databases
//
function DataSource() {

    var loaded = {};

    function get(source, latmin, latmax, lonmin, lonmax, callback) {

	if( source.type == 'shape' ) {

	    //async.nextTick(function() { callback('not rendering shapes'); });
	    //return;
	    
	    var data = loaded[source.type + '#' + source.file];
	    if( data == null )
		loaded[source.type + '#' + source.file] = { status: 'loading', waitlist: [ callback ], data: null };
	    else if( data.status == 'loading' ) {
		//console.log('waiting for ' + source.file);
		data.waitlist.push(callback);
		return;
	    } else if( data.status == 'error' ) {
		process.nextTick(function(){ callback('error'); });
		return;
	    } else {
		//console.log('returning loaded data for ' + source.file);
		process.nextTick(function(){ callback(null, data.data); });
		return;
	    }
	
	    var chunks = [];

	    var zipname = source.file.replace('.shp','.zip');
	    console.log('reading ' + source.file);
	    var instream = fs.createReadStream(zipname);
	    if( instream == null )
		console.log('reading ' + zipname + ' failed');
	    var shapestr = shp2json(instream);
	    delete shapestr.chunks;
	    instream.on('error', function(err) {
		console.log('ERROR READING SOURCE: ' + err);
	    });
	    shapestr.on('data', function(data) {
		chunks.push(data);
	    });
	    shapestr.on('error', function(err) {
		console.log('ERROR reading shape data: ' + err);
	    });
	    shapestr.on('end', function() {
		console.log('loaded ' + source.file);
		try {
		    var shapedata = chunks.join('');
		    var shape = JSON.parse(shapedata);
		    var obj = loaded['shape#' + source.file];
		    obj.status = 'loaded';
		    obj.data = shape;
		    async.forEachSeries(obj.waitlist, function(cb, waitcallback) {
			cb(null, shape);
			async.nextTick(waitcallback);
		    }, function() {
			//console.log('returned loaded data to ' + obj.waitlist.length);
			obj.waitlist = [];
		    });
		} catch(err) {
		    var obj = loaded['shape#' + source.file];
		    obj.status = 'error';
		    async.forEachSeries(obj.waitlist, function(cb, waitcallback) {
			cb('error');
			async.nextTick(waitcallback);
		    }, function() {
			//console.log('returned error to ' + obj.waitlist.length);
			obj.waitlist = [];
		    });
		    console.log('error reading data: ' + err.stack);
		}
	    });
	} else if( source.type == 'postgis' ) {

	    function formatQuery(query) {
		if( query == null )
		    return null;
		return query.replace(/&amp;/g, '&').
		    replace(/&#35;/g, '#').
		    replace(/[\n\r\u2028\u2029]/g,'').
		    replace(/&apos;/g, '\'').
		    replace(/&#40;/g, '(').
		    replace(/&#41;/g, ')').
		    replace(/&lt;/g, '<').
		    replace(/&gt;/g, '>').
		    replace(/&quot;/g, '"').
		    replace(/AS/g, ' AS').
		    replace(/WHERE/g, ' WHERE').
		    replace(/ORDER/g, ' ORDER').
		    replace(/ NULLS L AST/g, ' NULLS LAST').
		    replace(/FROM/g, ' FROM');
	    }

	    var connectionString = 'pg://osmusername:osmpassword@localhost/osm';
	    pg.connect(connectionString, function(err, dbclient) {
		if(err) {
		    process.stdout.write('error connecting to postgis: ' + err + '\n');
		    callback(err);
		} else {
		    
		    var polytext = 'GeomFromText(\'POLYGON((' + 
			lonmin + ' ' + latmin + ', ' + lonmin + ' ' + latmax + ', ' + 
			lonmax + ' ' + latmax + ', ' + lonmax + ' ' + latmin + ', ' +
			lonmin + ' ' + latmin + '))\',4326)';

		    //var query = 'select osm_id, landuse, ST_AsText(way) from planet_osm_polygon where ' + 
		    //	'landuse is not null and way && ' + polytext + ';';

		    var query = formatQuery(source.table);

		    var parentheses = query.match(/^\((.+)\)\s*AS\s*data$/);
		    if( parentheses )
			query = parentheses[1];

		    if( query == null ) {
			async.nextTick(function() { callback('invalid query ' + source.table); });
			return;
		    }

		    query = query.replace(/SELECT way/, 'SELECT ST_AsText(way)');

		    var orderndx = query.indexOf('ORDER BY');
		    var wherendx = query.indexOf('WHERE ');
		    if( orderndx != -1 ) {
			query = query.substring(0, orderndx) + 
			    ( wherendx == -1 ? ' WHERE ' : ' AND ') +
			    source.geometry_field + ' && ' + polytext + ' ' + 
			    query.substring(orderndx);
		    } else {
			query = query + 
			    ( wherendx == -1 ? ' WHERE ' : ' AND ') +
			    source.geometry_field + ' && ' + polytext;
		    }
		    console.log('postgis query ' + query);
		    query = dbclient.query(query + ';');
		    
		    var numrows = 0, numpolygons = 0, numpolygons_clipped = 0;
		    query.on('error', function(err) {
			console.log('postgis error ' + err);
			callback(err);
		    });
		    var rows = { features: [] };
		    query.on('row', function(row) {

			//if( rows.features.length >= 100 )
			//    return;
			
			var geomtext = row.st_astext;
			var geomobj = { properties: {}, geometry: {} };
			if( geomtext.indexOf('POLYGON(') == 0 ) {

			    geomobj.geometry.type = 'Polygon';
			    geomobj.geometry.coordinates = [];

			    geomtext = geomtext.substring(8, geomtext.length-1);
			    var polygons = geomtext.split('),(');
			    
			    for( var ppi = 0; ppi < polygons.length; ppi++ ) {
				var i1 = 0;
				if( polygons[ppi][0] == '(' )
				    i1 = 1;
				var i2 = polygons[ppi].length;
				if( polygons[ppi][polygons[ppi].length-1] == ')' )
				    i2 = polygons[ppi].length-1;
				var polytext = polygons[ppi].substring(i1, i2).split(',');
				
				var geom = [];
				for( var gi = 0; gi < polytext.length; gi++ ) {
				    try {
					var ctext = polytext[gi].split(' ');
					geom.push([ parseFloat(ctext[0]), parseFloat(ctext[1]) ]);
				    } catch( exc ) {
					console.log('exception: ' + exc + '\n' + exc.stack);
				    }
				}
				if( geom.length == 0 )
				    console.log('ERROR ZERO COORDINATES');
				geomobj.geometry.coordinates.push(geom);
			    }
			} else if( geomtext.indexOf('LINESTRING(') == 0 ) {

			    geomobj.geometry.type = 'LineString';
			    geomobj.geometry.coordinates = [];
			    
			    geomtext = geomtext.substring(11, geomtext.length-1);
			    geomtext = geomtext.split(',');
			    var geom = [];
			    for( var gi = 0; gi < geomtext.length; gi++ ) {
				try {
				    var ctext = geomtext[gi].split(' ');
				    geom.push([ parseFloat(ctext[0]), parseFloat(ctext[1]) ]);
				} catch( exc ) {}
			    }
			    geomobj.geometry.coordinates = geom;
			}
			
			rows.features.push(geomobj);
		    });
		    query.on('end', function() {
			if( rows.length == 0 )
			    callback('no postgis results');
			else
			    callback(null, rows);
		    });
		}
	    });   
	} else {
	    console.log('unknown data type ' + source.type);
	    async.nextTick(function() {
		callback('unknown data type ' + source.type);
	    });
	}
    }

    return {
	get: get
    };
}

exports.DataSource = DataSource;

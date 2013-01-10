var vecm = VecMath();

// removes a tile div from the scene
function removetilediv(tilec) {
    var camelem = document.getElementById('camera-' + tilec.zoom);
    var tilelem = document.getElementById(tilec.id);
    if( tilelem ) {
	//console.log('removing ' + tilec.id);
	camelem.removeChild(tilelem);
    }
}

// adds a tile div to the scene
function addtilediv(tilec) {
    var tilelem = document.getElementById(tilec.id);
    if( tilelem )
	return;
    
    var camelem = document.getElementById('camera-' + tilec.zoom);
    //var zoomelem = document.getElementById('zoom-' + tilec.zoom);
    if( camelem == null ) {
	camelem = document.createElement('div');
	camelem.setAttribute('id', 'camera-' + tilec.zoom);
	camelem.setAttribute('class', 'camera');
	camelem.setAttribute('style', 'z-index: ' + (10+tilec.zoom) + ';');
	
	var fieldelem = document.getElementById('field');
	fieldelem.insertBefore(camelem, document.getElementById('touch'));
    }
    var divelem = document.createElement('div');
    divelem.setAttribute('id', tilec.id);
    divelem.setAttribute('class', 'tile');
    if( tilec.zoom == 0 ) 
	divelem.setAttribute('style', 'border-radius: 128;');
    
    var matrix = vecm.matrix2transform(tilec.transform);
    
    divelem.style.backgroundImage = 'url(' + tilec.id + '.png)';
    if( divelem.style.webkitTransform !== undefined )
	divelem.style.webkitTransform = matrix;
    if( divelem.style.MozTransform !== undefined )
	divelem.style.MozTransform = matrix;
    if( divelem.style.transform !== undefined )
	divelem.style.transform = matrix;
    camelem.appendChild(divelem);
}

// initializes the scene at each resize
function init() {
    function resize() {
	perspectiveset = false;
        var pelem = document.getElementById('content');     
        var field = document.getElementById('field');
	var canvas = document.getElementById('fieldcanvas');
	
        if( pelem.offsetWidth / pelem.offsetHeight > 2048 / 1365 ) {
	    var fw = Math.floor(2048 / 1365 * pelem.offsetHeight);
	    var fh = pelem.offsetHeight;
	    field.style.width = fw + 'px';
	    field.style.height = fh + 'px';
	    canvas.setAttribute('width', fw);
	    canvas.setAttribute('height', fh);
        } else {
	    var fw = pelem.offsetWidth;
	    var fh = Math.floor(1365 / 2048 * pelem.offsetWidth);
	    field.style.width = fw + 'px';
	    field.style.height = fh + 'px';
	    canvas.setAttribute('width', fw);
	    canvas.setAttribute('height', fh);
        } 
        field.style.top = Math.floor(pelem.offsetHeight/2 - fh/2)+'px';
	camera.setViewFrustum(50, canvas.width, canvas.height);
    }
    
    window.onresize = resize;
    resize();
}

var events = {};

var fps = 0;
var prevframe = 0;
var framecount = 0;

window.requestAnimFrame = (function(){
    return  window.requestAnimationFrame || 
        window.webkitRequestAnimationFrame || 
        window.mozRequestAnimationFrame || 
        window.oRequestAnimationFrame || 
        window.msRequestAnimationFrame || 
        function(callback, element){
	    window.setTimeout(callback, 0);//1000 / 60);
        };
})();

var WGS84 = WGS84();

var camera = Camera();

// helsinki
var cameralat = 60.172172;
var cameralon = 24.935102;

// starting distance 15000km over earth
var distance = 15000;

// set the camera
var camerapos = WGS84.calcXYZ(cameralat, cameralon, distance);
var cameraup = WGS84.calcXYZ(cameralat+1, cameralon, distance);
var camerato = { x: 0, y: 0, z: 0 };      

camera.setView(camerapos, camerato, cameraup);

var tilepositions = [];
var perspectiveset = false;
var prevtiles = null;
var prevframetime = 0;

function redraw(clear) {
    window.requestAnimFrame(redraw);
    
    var fieldelem = document.getElementById('field');
    
    var frametime = new Date().getTime();
    if( prevframetime != 0 ) {
	var timediff = frametime - prevframetime;
	
	if( distance > 3000 && timediff < 10000 ) {
	    distance -= timediff / 1000 * 1500;
	    if( distance < 3000 )
		distance = 3000;
	    var vecs = camera.getCameraVectors();
	    newpos = vecm.normalize(vecs.camera, distance + 0.1 + WGS84.getRadius());
	    camera.setView(newpos, {x:0,y:0,z:0}, vecs.cameray);
	}
    }
    prevframetime = frametime;
    
    var canvas = document.getElementById('fieldcanvas');
    var ctx = canvas.getContext('2d');
    
    // log stuff
    
    var curtime = new Date().getTime();
    if( prevframe ) {
	var frametime = curtime - prevframe;
        fps = 1000 / (curtime - prevframe);
        fps = Math.floor(fps*10)/10;
        //ctx.fillText(fps+'', 0, 0);
    } else
	var frametime = 0;
    prevframe = curtime;
    
    // draw stuff
    
    ctx.clearRect(0,0,canvas.width, canvas.height);
    
    if( prevframe )
	document.getElementById('fps').innerHTML = fps + '';

    for( var z = 0; z < 20; z++ ) {
	var camelem = document.getElementById('camera-' + z);
	if( camelem ) {
	    if( camelem.style.webkitTransform !== undefined )
		camelem.style.webkitTransform = vecm.matrix2transform(camera.getScreenMatrix());
	    if( camelem.style.MozTransform !== undefined )
		camelem.style.MozTransform = vecm.matrix2transform(camera.getScreenMatrix());
	    if( camelem.style.transform !== undefined )
		camelem.style.transform = vecm.matrix2transform(camera.getScreenMatrix());
	}
    }
    if( perspectiveset == false ) {
	perspectiveset = true;
	var fieldelem = document.getElementById('field');
	if( fieldelem.style.webkitPerspective !== undefined )
	    fieldelem.style.webkitPerspective = Math.floor(field.offsetHeight / 2 * camera.getPerspective()) + 'px';
	if( fieldelem.style.MozPerspective !== undefined )
	    fieldelem.style.MozPerspective = Math.floor(field.offsetHeight / 2 * camera.getPerspective()) + 'px';
	if( fieldelem.style.perspective !== undefined )
	    fieldelem.style.perspective = Math.floor(field.offsetHeight / 2 * camera.getPerspective()) + 'px';
    }
    var test = 0;
    // console.log('test');
    
    ctx.save();
    ctx.translate(canvas.width/2, canvas.height/2);
    
    var map2cam = camera.getCameraMatrix();
    var projmat = camera.getProjectionMatrix();
    
    var vecs = camera.getCameraVectors();
    
    var earthright = camera.getViewRay(1,0.5);
    earthright = vecm.difference(earthright.to, earthright.from);
    var e1 = vecm.normalize(vecm.crossp(vecs.cameray, earthright), WGS84.getRadius());
    
    //var earthborder = vecm.normalize(vecs.camerax, WGS84.getRadius());
    var eb = vecm.multiply(projmat, e1);
    var e0 = vecm.multiply(projmat, {x:0,y:0,z:0});
    
    eb.x /= eb.w;
    eb.y /= eb.w;
    e0.x /= e0.w;
    e0.y /= e0.w;
    
    ctx.fillStyle = 'rgb(100,120,250)';
    ctx.beginPath();
    
    var earthdist = Math.sqrt((eb.x-e0.x)*(eb.x-e0.x)+(eb.y-e0.y)*(eb.y-e0.y));
    
    // a blue circle as a background; not used right now
    //ctx.arc(e0.x/e0.w, e0.y/e0.w, earthdist, 0, 2*Math.PI, false);
    //ctx.fill();
    
    var p0 = vecm.multiply(map2cam, {x:0, y:0, z:0});
    
    // calculate visible tiles and add them
    var tilesadded = 0;
    var visibleset = WGS84.calcVisibleTiles(camera);
    var newtiles = visibleset.tiles;
    var newtiles_sorted = visibleset.tiles_sorted;
    
    for( var ti0 = 0; ti0 < newtiles_sorted.length; ti0++ ) {
	var ti = newtiles_sorted[ti0].id;
	if( newtiles[ti].id == null )
	    continue;
	if( prevtiles ) {
	    if( prevtiles[ti] ) {
		prevtiles[ti].in_use = true;
		continue;
	    }
	}
	// limit tile add speed
	if( tilesadded < 1 ) {
	    addtilediv(newtiles[ti].coord);
	    tilesadded++;
	} else {
	    delete newtiles[ti];
	}
    }
    // remove unused tiles
    for( var ti in prevtiles ) {
	if( prevtiles[ti].id == null )
	    continue;
	if( prevtiles[ti].in_use )
	    continue;
	removetilediv(prevtiles[ti].coord);
    }
    prevtiles = newtiles;

    ctx.restore();	  
}
// set up the first redraw timeout
setTimeout(redraw, 1000);

// zoom in and out
function keyup(event) {
    if( event.keyCode == 65 ) 
	distance *= 1.5;
    else if( event.keyCode == 66 )
	distance /= 1.5;
    
    var vecs = camera.getCameraVectors();
    newpos = vecm.normalize(vecs.camera, distance + 0.1 + WGS84.getRadius());
    camera.setView(newpos, {x:0,y:0,z:0}, vecs.cameray);
}
				      
var tapping = null;
var mouse_is_down = false;
var mousecounter = 1;

// simulate touch events when mouse events occur
function mousedown(event) {
    mouse_is_down = true;
    touchstart({
	targetTouches: [ { pageX: event.pageX,
			   pageY: event.pageY,
			   target: event.target,
			   identifier: 'mouse' + mousecounter } ] });
}

// simulate touch events when mouse events occur
function mousemove(event) {
    if( mouse_is_down )
	touchmove({
	    targetTouches: [ { pageX: event.pageX,
			       pageY: event.pageY,
			       target: event.target,
			       identifier: 'mouse' + mousecounter } ] });
}

// simulate touch events when mouse events occur
function mouseup(event) {
    mousecounter++;
    touchend({targetTouches: [] });
    mouse_is_down = false;
}

// pinch zoom and scrolling of the view// pinch zoom and scrolling of the view
function touchstart(event) {
    if( event.preventDefault )
        event.preventDefault();
    
    //	console.log(event.targetTouches.length);
    //	console.log(event.targetTouches[0].pageX + ' ' + event.targetTouches[0].pageY);
    //	console.log(event.targetTouches[0].identifier);
    
    for( var ti = 0; ti < event.targetTouches.length; ti++ ) {
	var touche = event.targetTouches[ti];
	
        var tgt = touche.target;
	var ox = 0, oy = 0;
	while( tgt ) {
	    ox += tgt.offsetLeft;
	    oy += tgt.offsetTop;
	    tgt = tgt.offsetParent;
	}
	
        var newevent = { 
	    x: (touche.pageX - ox)*2048/touche.target.offsetWidth,
	    y: (touche.pageY - oy)*1365/touche.target.offsetHeight
	};
	
	if( events[touche.identifier] == null ) {
	    events[touche.identifier] = [];
	    
	    tapping = { x: newevent.x, y: newevent.y,
			identifier: touche.identifier };
	}
        events[touche.identifier].push(newevent);
    }
} 

var touchcounter = 0;
// pinch zoom and scrolling of the view
function touchmove(event) {
    if( event.preventDefault )
        event.preventDefault();
    
    if( tapping ) {
	//console.log('tapping canceled by movement');
    }
    
    tapping = null;
    
    for( var ti = 0; ti < event.targetTouches.length; ti++ ) {
	var touche = event.targetTouches[ti];
	
        var tgt = touche.target;
	var ox = 0, oy = 0;
	while( tgt ) {
	    ox += tgt.offsetLeft;
	    oy += tgt.offsetTop;
	    tgt = tgt.offsetParent;
	}
	
        var newevent = { 
	    x: (touche.pageX - ox)*2048/touche.target.offsetWidth,
	    y: (touche.pageY - oy)*1365/touche.target.offsetHeight,
	    c: touchcounter
	};
	
	//newevent.hit = touch2hit(newevent.x, newevent.y);
	
	if( events[touche.identifier] == null )
	    events[touche.identifier] = [];
	var thisevent = events[touche.identifier];
        thisevent.push(newevent);
    }
    touchcounter++;
    
    if( event.targetTouches.length == 1 ) {
	var touche = event.targetTouches[0];
	var thisevent = events[touche.identifier];
	
	if( thisevent.length < 2 )
	    return;
	
	var prevevent = thisevent[thisevent.length-2];
	var t1 = camera.getViewRay(prevevent.x/2048, prevevent.y/1365);
	var t2 = camera.getViewRay(newevent.x/2048, newevent.y/1365);
	
	var h1 = WGS84.calcRayHit(t1);
	var h2 = WGS84.calcRayHit(t2);
	
	if( h1 == null || h2 == null )
	    return;
	
	var vecs = camera.getCameraVectors();		  
	
	// plane formed by camera, t1.to, t2.to
	// find vector perpendicular to it 
	var normal = vecm.normalize(vecm.crossp(
	    vecm.difference(vecs.camera, t2.to),
	    vecm.difference(vecs.camera, t1.to)));
	// rotate camera around this axis
	var angle = Math.acos(vecm.dotp(vecm.normalize(h1), 
					vecm.normalize(h2)));
	
	if( isNaN(normal.x) || isNaN(normal.y) ||
	    isNaN(normal.z) || isNaN(angle) )
	    return;
	
	//console.log('rotating around vector ' + 
	//		  normal.x + ',' + normal.y + ',' + 
	//		  normal.z);
	//	      console.log('rotating ' + (angle/Math.PI*180) + 
	//		  ' degrees');
	
	angle = -angle;
	
	var vecs = camera.getCameraVectors();
	var newpos = vecm.rotateaxis(vecs.camera, normal, angle);
	var newup = vecm.rotateaxis(vecs.cameray, normal, angle);
	
	var camp = WGS84.calcWGS(newpos.x, newpos.y, newpos.z);
	cameralat = camp.lat;
	cameralon = camp.lon;
	
	// using this newup would mean that the camera up is always north
	//newup = vecm.sum(newpos, {x:0,y:0,z:1});
	
	newpos = vecm.normalize(newpos, distance + 0.1 + WGS84.getRadius());
	
	camera.setView(newpos, {x:0,y:0,z:0}, newup);
	
    } else if( event.targetTouches.length == 2 ) {
	
	var event1 = events[event.targetTouches[0].identifier];
	var event2 = events[event.targetTouches[1].identifier];
	
	var newevent1 = event1[event1.length-1];
	var prevevent1 = event1[event1.length-2];
	var t1a = camera.getViewRay(prevevent1.x/2048, prevevent1.y/1365);
	var t2a = camera.getViewRay(newevent1.x/2048, newevent1.y/1365);
	//var h1a = WGS84.calcRayHit(t1a);
	//var h2a = WGS84.calcRayHit(t2a);
	
	var newevent2 = event2[event2.length-1];
	var prevevent2 = event2[event2.length-2];
	var t1b = camera.getViewRay(prevevent2.x/2048, prevevent2.y/1365);
	var t2b = camera.getViewRay(newevent2.x/2048, newevent2.y/1365);
	//var h1b = WGS84.calcRayHit(t1b);
	//var h2b = WGS84.calcRayHit(t2b);
	
	var angle0 = Math.acos(vecm.dotp(vecm.normalize(vecm.difference(t1a.from, t1a.to)),
					 vecm.normalize(vecm.difference(t1b.from, t1b.to))));
	var angle1 = Math.acos(vecm.dotp(vecm.normalize(vecm.difference(t2a.from, t2a.to)),
					 vecm.normalize(vecm.difference(t2b.from, t2b.to))));
	var len0 = Math.tan(angle0*0.5);
	var len1 = Math.tan(angle1*0.5);
	
	distance = distance * ( len0 / len1 );
        var vecs = camera.getCameraVectors();
	newpos = vecm.normalize(vecs.camera, distance + 0.1 + WGS84.getRadius());
	camera.setView(newpos, {x:0,y:0,z:0}, vecs.cameray);
    }
} 
// pinch zoom and scrolling of the view
function touchend(event) {
    if( event.preventDefault )
        event.preventDefault();
    
    var tapped = false;
    if( tapping )
	tapped = true;
    
    for( var ti = 0; ti < event.targetTouches.length; ti++ ) {
	var touche = event.targetTouches[ti];
	
        var tgt = touche.target;
	var ox = 0, oy = 0;
	while( tgt ) {
	    ox += tgt.offsetLeft;
	    oy += tgt.offsetTop;
	    tgt = tgt.offsetParent;
	}
	
        var newevent = { 
	    x: (touche.pageX - ox)*2048/touche.target.offsetWidth,
	    y: (touche.pageY - oy)*1365/touche.target.offsetHeight
	};
	
	if( tapping ) 
	    if( tapping.identifier == touche.identifier ) {
		tapped = false;
	    }
	
	if( events[touche.identifier] == null )
	    events[touche.identifier] = [];
        events[touche.identifier].push(newevent);
    }
    
    tapping = null;
    
    if( event.targetTouches.length == 0 )
	events = {};
} 
// pinch zoom and scrolling of the view
function touchcancel(event) {
    if( event.preventDefault )
	event.preventDefault();
    
    events = {};
} 

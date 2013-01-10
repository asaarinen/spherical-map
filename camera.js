//
// a 3d camera implementation, calculates necessary matrices etc.
//
function Camera() {

    // for node.js use
    if( typeof exports !== 'undefined' )
	var vecm = require('./math.js').VecMath();
    else
	var vecm = VecMath();

    var tanfovx = 1, tanfovy = 1;

    var cam2screen = null;
    var screen2proj = null;

    var cam2map = null;
    var map2cam = null;

    var map2screen = null;
    var map2proj = null;

    // sets the camera view frustum by giving the field of vision angle (vertical),
    // and finds the matching horizontal angle defined by view width and height
    function setViewFrustum(angley, widthpx, heightpx) {
	pixelwidth = widthpx;
	pixelheight = heightpx;

	var fovy = (angley/2) / 180.0 * Math.PI;
	tanfovy = Math.tan(fovy);
	
	var fovx = Math.atan2(widthpx, heightpx / tanfovy);
	tanfovx = Math.tan(fovx);

	var localdist = 0.5 * heightpx / tanfovy;

	cam2screen = [
	    1, 0, 0, 0,
	    0, -1, 0, 0,
	    0, 0, 1, localdist,
	    0, 0, 0, 1
	];

	screen2proj = [
	    1, 0, 0, 0,
	    0, 1, 0, 0,
	    0, 0, 1, 0,
	    0, 0, -1 / localdist, 1
	];

	if( map2cam ) {
	    map2screen = vecm.matrixmultiply(cam2screen, map2cam);
	    map2proj = vecm.matrixmultiply(screen2proj, map2screen);
	}
    }

    // returns the current view frustum
    function getViewFrustum() {
	return { tanfovx: tanfovx,
		 tanfovy: tanfovy,
		 pixelwidth: pixelwidth,
		 pixelheight: pixelheight };
    }
    
    // returns the current perspective, needed to have correct css perspective value
    function getPerspective() {
	return 1.0 / tanfovy;
    }

    // sets the camera view by giving 3 vectors: camera position, where camera is looking at, 
    // and where is camera "up"
    function setView(camera, camerato, cameraup) {
	var cameraz = vecm.normalize(vecm.difference(camerato, camera));
	var cameray = vecm.difference(camera, cameraup);
	var camerax = vecm.normalize(vecm.crossp(cameray, cameraz));
	var cameray = vecm.normalize(vecm.crossp(cameraz, camerax));
	
	var cx = camerax.x*camera.x + camerax.y*camera.y + camerax.z*camera.z;
	var cy = cameray.x*camera.x + cameray.y*camera.y + cameray.z*camera.z;
	var cz = cameraz.x*camera.x + cameraz.y*camera.y + cameraz.z*camera.z;
	
	cam2map = [ 
	    camerax.x, cameray.x, cameraz.x, camera.x,
	    camerax.y, cameray.y, cameraz.y, camera.y,
	    camerax.z, cameray.z, cameraz.z, camera.z,
	    0, 0, 0, 1
	];
	
	map2cam = [
	    camerax.x, camerax.y, camerax.z, -cx,
	    cameray.x, cameray.y, cameray.z, -cy,
	    cameraz.x, cameraz.y, cameraz.z, -cz,
	    0, 0, 0, 1
	];	

	if( cam2screen && screen2proj )  {
	    map2screen = vecm.matrixmultiply(cam2screen, map2cam);
	    map2proj = vecm.matrixmultiply(screen2proj, map2screen);
	}
    }

    // returns the camera matrix. Multiplying by this matrix brings coordinates from world 
    // coordinates to camera coordinates.
    function getCameraMatrix() {
	return map2cam;
    }
    
    // returns the camera object matrix. This is the inverse of camera matrix e.g. brings
    // coordinates from camera coordinate system to world coordinate system.
    function getCameraObjectMatrix() {
	return cam2map;
    }
    
    // returns the camera vectors, position and camera x,y,z vectors
    function getCameraVectors() {
	return { camera: { x: cam2map[3], y: cam2map[7], z: cam2map[11] },
		 camerax: { x: cam2map[0], y: cam2map[4], z: cam2map[8] },
		 cameray: { x: cam2map[1], y: cam2map[5], z: cam2map[9] },
		 cameraz: { x: cam2map[2], y: cam2map[6], z: cam2map[10] }
	       };
    }

    // returns the camera to screen matrix. Multiplying world coordinates by this, results in
    // screen coordinates.
    function getScreenMatrix() {
	return map2screen;
    }

    // returns the projection matrix. Multiplying world coordinates by this, results in
    // coordinates projected by the view frustum but not yet scaled to viewport
    function getProjectionMatrix() {
	return map2proj;
    }

    // returns a ray from camera position to a point in viewport at coordinates x,y. 
    // used for ray tracing
    function getViewRay(x,y) {
	var raystart = vecm.multiply(cam2map, {x:0, y:0, z:0});
	var tmpz = -1000;
	var rayend = vecm.multiply(cam2map, {
	    x: 2 * tmpz * tanfovx * (0.5 - x),
	    y: 2 * tmpz * tanfovy * (0.5 - (1-y)), 
	    z: tmpz });
	return { from: raystart,
		 to: rayend };
    }

    return {
	setViewFrustum: setViewFrustum,
	getViewFrustum: getViewFrustum,
	getPerspective: getPerspective,
	setView: setView,
	getCameraMatrix: getCameraMatrix,
	getCameraObjectMatrix: getCameraObjectMatrix,
	getCameraVectors: getCameraVectors,
	getScreenMatrix: getScreenMatrix,
	getProjectionMatrix: getProjectionMatrix,
	getViewRay: getViewRay,
	toString: toString
    };
}

// for node.js use
if( typeof exports !== 'undefined' ) {
    exports.Camera = Camera;
}

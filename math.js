//
// general vector math functions
//
function VecMath() {

    // converts a number to a string.
    function number2string(value, digits) {
	if( !digits )
	    digits = 6;
	var result = '';
	if( value < 0 ) {
	    result = '-';
	    value = -value;
	}
	var x = Math.pow(10,digits)
	var first = true;;
	for( var ii = 0; ii < 2*digits; ii++ ) {
	    var res = Math.floor(value/x)%10;
	    if( first && x > 1 && res == 0 )
		;
	    else {
		result = result + res;
		first = false;
	    }
	    if( x == 1 )
		result = result + '.';
	    x /= 10;
	}
	return result;
    }

    // converts a matrix to a CSS matrix3d() directive
    function matrix2transform(m, round) {
	// WebKitCSSMatrix only available on webkit browsers
	if( typeof WebKitCSSMatrix != 'undefined' ) {
	    var mat = new WebKitCSSMatrix();
	    mat.m11 = m[0];
	    mat.m21 = m[1];
	    mat.m31 = m[2];
	    mat.m41 = m[3];
	    mat.m12 = m[4];
	    mat.m22 = m[5];
	    mat.m32 = m[6];
	    mat.m42 = m[7];
	    mat.m13 = m[8];
	    mat.m23 = m[9];
	    mat.m33 = m[10];
	    mat.m43 = m[11];
	    mat.m14 = m[12];
	    mat.m24 = m[13];
	    mat.m34 = m[14];
	    mat.m44 = m[15];
	    return mat.toString();
	} else {
	    var m2 = [];
	    for( var mi = 0; mi < 16; mi++ )
		m2.push(number2string(m[mi]));
	    m = m2;
	    var matrix = 'matrix3d(' + m[0] + ',' + m[4] + ',' + m[8] + ',' + m[12] + ',' +
		m[1] + ',' + m[5] + ',' + m[9] + ',' + m[13] + ',' +
		m[2] + ',' + m[6] + ',' + m[10] + ',' + m[14] + ',' +
		m[3] + ',' + m[7] + ',' + m[11] + ',' + m[15] + ')';
	    return matrix;
	}
    }

    // dot product
    function dotp(vec1, vec2) {
	return vec1.x * vec2.x +
	    vec1.y * vec2.y +
	    vec1.z * vec2.z;
    }
    
    // cross product
    function crossp(vec1, vec2) {
	return { x: vec1.y * vec2.z - vec1.z * vec2.y,
		 y: vec1.z * vec2.x - vec1.x * vec2.z,
		 z: vec1.x * vec2.y - vec1.y * vec2.x };
    }
    
    // vector length
    function veclength(vec) {
	return Math.sqrt(vec.x*vec.x+vec.y*vec.y+vec.z*vec.z);
    }

    // returns a vector scaled by a factor
    function vecscale(vec, scale) {
	return { x: vec.x * scale,
		 y: vec.y * scale,
		 z: vec.z * scale };
    }
    
    // returns a vector scaled to given length, by default 1
    function normalize(vec, length) {
	if( length == null )
	    length = 1.0;
	var len = length / Math.sqrt(vec.x*vec.x+vec.y*vec.y+vec.z*vec.z);
	return { x: vec.x * len,
		 y: vec.y * len,
		 z: vec.z * len };
    }

    // returns sum of two vectors
    function sum(v1, v2) {
	return { x: v1.x + v2.x,
		 y: v1.y + v2.y,
		 z: v1.z + v2.z };
    }
	
    // returns the difference between two vectors
    function difference(from, to) {
	return { x: to.x - from.x,
		 y: to.y - from.y,
		 z: to.z - from.z };
    }
    
    // matrix-vector multiplication, returns the result vector
    function multiply(matrix, point) {
	if( matrix == null ) {
	    matrix = [ 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 ];
	}
	return { x: matrix[0] * point.x + matrix[1] * point.y + matrix[2] * point.z + matrix[3],
		 y: matrix[4] * point.x + matrix[5] * point.y + matrix[6] * point.z + matrix[7],
		 z: matrix[8] * point.x + matrix[9] * point.y + matrix[10] * point.z + matrix[11],
		 w: matrix[12] * point.x + matrix[13] * point.y + matrix[14] * point.z + matrix[15] * (point.w ? point.w : 1) }
    }
    
    // matrix-matrix multiplication, returns the resulting matrix
    function matrixmultiply(m1, m2) {
	var result = [];
	for( var i = 0; i < 4; i++ )
	    for( var j = 0; j < 4; j++ ) {
		result.push(m1[4*i]*m2[j] +
			    m1[4*i+1]*m2[j+4] +
			    m1[4*i+2]*m2[j+8] +
			    m1[4*i+3]*m2[j+12]);
	    }
	return result;
    }
    
    // defines a plane by 3 points on that plane
    function createplane(p1, p2, p3) {
	var normal = normalize(crossp(difference(p2, p1),
	    difference(p2, p3)));
	return {
	    a: normal.x,
	    b: normal.y,
	    c: normal.z,
	    d: -dotp(p1, normal)
	};
    }

    // tests whether a point is "inside" the plane, "inside" meaning that this function returns true if the 
    // point is on that side of plane where its normal points to
    function inside(point, plane) {
	if( plane.a * point.x + plane.b * point.y + 
	    plane.c * point.z + plane.d >= 0 )
	    return true;
	return false;
    }
    
    // calculates the intersection of a line defined by two points, and a plane
    function intersect(p1, p2, plane) {
	var dp = difference(p1,p2);
	
	if( plane.c != 0 )
	    var p0 = { x: 0, y: 0, z: -plane.d/plane.c };
	else if( plane.b != 0 )		    
	    var p0 = { x: 0, y: -plane.d/plane.b, z: 0 };
	else
	    var p0 = { x: -plane.d/plane.a, y: 0, z: 0 };
	
	var pnormal = { x: plane.a, y: plane.b, z: plane.c };
	var t = dotp(difference(p1, p0), pnormal) / 
	    dotp(dp, pnormal);
	
	return sum(p1, vecscale(dp, t));
    }
    
    // projects a point to a plane
    function project(point, plane) {
	//(p-p0)n=0
	//p+tn=point
	//p = point-tn
	//(point-tn)n-p0n=0
	//t = (p0n-pointn)/(-nn)
	
	if( plane.c != 0 )
	    var p0 = { x: 0, y: 0, z: -plane.d/plane.c };
	else if( plane.b != 0 )		    
	    var p0 = { x: 0, y: -plane.d/plane.b, z: 0 };
	else
	    var p0 = { x: -plane.d/plane.a, y: 0, z: 0 };
	var pnormal = { x: plane.a, y: plane.b, z: plane.c };
	
	var t = dotp(p0, pnormal)-dotp(point, pnormal);
	t /= -dotp(pnormal, pnormal);
	
	return sum(point, vecscale(pnormal, -t));
    }

    // rotates a point around a given axis (axis going through the origin), angle in rad
    function rotateaxis(point, axis, angle) {
	var x = axis.x;
	var y = axis.y;
	var z = axis.z;
	var cosa = Math.cos(angle);
	var sina = Math.sin(angle);
	
	var rotmatrix = [
	    cosa + x*x*(1-cosa), x*y*(1-cosa)-z*sina, x*z*(1-cosa)+y*sina, 0,
	    x*y*(1-cosa)+z*sina, cosa+y*y*(1-cosa), y*z*(1-cosa)-x*sina, 0,
	    x*z*(1-cosa)-y*sina, y*z*(1-cosa)+x*sina, cosa+z*z*(1-cosa), 0,
	    0, 0, 0, 1
	];
	return multiply(rotmatrix, point);
    }

    var sqrt2 = Math.sqrt(2);
    // projects a point within a plane "radially", meaning that it calculate the intersection of the 
    // plane and a line going through the origin and give point. If the point is on the "wrong" side 
    // of origin and the line points away, returns null
    function projectradial(point, plane, threshold) {

	var rotated = false;
	point = normalize(point);
	var normal = { x: plane.a, y: plane.b, z: plane.c };
	var cosangle = dotp(point, normal);
	if( cosangle < 0 ) {
	    return null; // other side of globe
	} else if( cosangle < 1.0/sqrt2 ) { // 45 degrees
	    var angle = Math.acos(cosangle);
	    var axis = normalize(crossp(point, normal));
	    point = rotateaxis(point, axis, angle - Math.PI/4); 
	    cosangle = dotp(point, normal);
	    rotated = true;
	}

	// point * scale = p
	// (p-p0)n = 0
	// (point*scale)n -p0n = 0
	// scale = p0 n / point n

	var normal = { x: plane.a, y: plane.b, z: plane.c };
	var scale = -plane.d / cosangle;
	var result = vecscale(point, scale);
	if( rotated )
	    result.rotated = true;
	return result;
    }

    // clips a point on a plane "radially", meaning that it projects the point, 
    // which is already on the plane, to a circular radius from given origin. If the 
    // point is already inside that radius, returns the original point
    function clipradius(origin, from, to, radius) {

	if( from == null )
	    return sum(origin, normalize(difference(origin, to), radius));

	var origin2from = difference(origin, from);
	var origin2from1 = normalize(origin2from);
	var origin2to = difference(origin, to);
	var origin2to1 = normalize(origin2to);
	var from2to = difference(from, to);
	var from2to1 = normalize(from2to);
	
	var origin2fromlen = veclength(origin2from);
	var origin2tolen = veclength(origin2to);
	var from2tolen = veclength(from2to);
	
	var cosalfa = dotp(vecscale(origin2from1,-1), from2to1);
		
	// radius * radius = x*x + origin2fromlen * origin2fromlen - 2 * origin2fromlen * x * cosalfa
		
	var a = 1, 
	    b = -2 * origin2fromlen * cosalfa,
	    c = origin2fromlen * origin2fromlen - radius * radius;
	
	var det = b * b - 4 * a * c;
	if( det < 0 ) 
	    return null;
	
	var d1 = (-b + Math.sqrt(det)) / (2*a);
	var d2 = (-b - Math.sqrt(det)) / (2*a);
	
	if( d1 < 0 )
	    d1 = 10000;
	if( d2 < 0 )
	    d2 = 10000;
	d1 = Math.min(d1,d2);
	return sum(from, vecscale(from2to1, d1));
	
	var p1 = sum(from, vecscale(from2to1, d1));
	var p2 = sum(from, vecscale(from2to1, d2));
	
	printvec('p1', p1);
	printvec('p2', p2);
	
	var rad1 = veclength(difference(origin, p1));
	var rad2 = veclength(difference(origin, p2));
	
	printval('rad1', rad1);
	printval('rad2', rad2);
	
	var raddiff1 = Math.abs(rad1 - radius);
	var raddiff2 = Math.abs(rad2 - radius);
	
	if( raddiff1 < raddiff2 ) 
	    return p1;
	else
	    return p2;
    }

    // NOT USED ANYWHERE AT THIS POINT; PROBABLY WORKS THOUGH
    function projectangular(point, plane, projplane, negate) {

	var shiftplane = { a: projplane.a,
	    b: projplane.b,
	    c: projplane.c }
	shiftplane.d = -dotp({ x: projplane.a,
			       y: projplane.b,
			       z: projplane.c },
			     point);
	
	var pproj = point;//project(point, shiftplane);
	
	var origin = project({x:0,y:0,z:0}, shiftplane);
	
	var dist = veclength(difference(pproj, origin));
	
	var projdir = normalize(crossp(
	    { x: shiftplane.a,
	      y: shiftplane.b,
	      z: shiftplane.c },
	    { x: plane.a,
	      y: plane.b,
	      z: plane.c }));
	
	if( negate )
	    dist = -dist;
	
	var projected = sum(origin, vecscale(projdir, dist));
	return projected;
    }

    // returns set of functions
    return {
	matrix2transform: matrix2transform,
	dotp: dotp,
	crossp: crossp,
	veclength: veclength,
	vecscale: vecscale,
	normalize: normalize,
	sum: sum,
	difference: difference,
	multiply: multiply,
	rotateaxis: rotateaxis,
	matrixmultiply: matrixmultiply,
	createplane: createplane,
	inside: inside,
	intersect: intersect,
	project: project,
	projectradial: projectradial,
	clipradius: clipradius
    };
}

// for node.js use
if( typeof exports !== 'undefined' ) {
    exports.VecMath = VecMath;
}


      

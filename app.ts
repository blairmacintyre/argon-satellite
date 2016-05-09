import loader = require('./loader');

declare const THREE: any;
declare const Argon: any;
declare const satellite: any;

const app = Argon.init();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
export const user = new THREE.Object3D();
export const userLocation = new THREE.Object3D;
scene.add(camera);
scene.add(user);
scene.add(userLocation);

const cssRenderer = new THREE.CSS3DRenderer();
const webglRenderer = new THREE.WebGLRenderer({ alpha: true, logarithmicDepthBuffer: true });

app.view.element.appendChild(cssRenderer.domElement);
app.view.element.appendChild(webglRenderer.domElement);

// an entity for the satellite
let issECEF = new Argon.Cesium.Entity({
    name: "ISS"
});

var tleISS = null;
// ["1 25544U 98067A   16112.14571222  .00005151  00000-0  84475-4 0  9999", "2 25544  51.6445 342.5532 0001777  51.9026  92.7043 15.54299694996100"];

let satrec = null;

function onLoad (tle) {
    tleISS = tle["ISS (ZARYA)"];
    satrec = satellite.twoline2satrec(tleISS[0], tleISS[1]);
    
    // update the satellite positions a couple of times so
    // we have enough data in the issECEF entity position property
    // to interpolate
    let date = Argon.Cesium.JulianDate.now();
    updateSat(date);
    Argon.Cesium.JulianDate.addSeconds(date, 1, date);
    updateSat(date);
    
    // set up the orbit geometry and line object
    initOrbit(date);
   
    const material = new THREE.LineBasicMaterial({
	    color: 0x0000ff
    });
    const line = new THREE.Line( orbitXYZ, material );    
    scene.add(line);
}

function onProgress (progress: ProgressEvent) {
    console.log("loading: " + progress.loaded + " of " + progress.total + "...");
}

function onError (error: ErrorEvent) {
    console.log("error! " + error);
}

// from http://celestrak.com/NORAD/elements/visual.txt
loader.loadTLEs("includes/visual.txt", onLoad, onProgress, onError);

const issPosition = new Argon.Cesium.SampledPositionProperty(
                            Argon.Cesium.ReferenceFrame.FIXED, 1);
issPosition.forwardExtrapolationType = Argon.Cesium.ExtrapolationType.EXTRAPOLATE;
issECEF.position = issPosition;

let lastMinute = -1;  // want it to always run once; (new Date()).getUTCSeconds();

let orbitECF = undefined;
let orbitXYZ = undefined;

function initOrbit (julian) {
    orbitECF = [];
    orbitXYZ = new THREE.Geometry();
    
    // start some minutes ago
    Argon.Cesium.JulianDate.addMinutes(julian, -15, julian);

    var positionEcf;
    var position;
    var vec3;
    var localPos;
    const frame = app.context.getDefaultReferenceFrame();
    for (var i = 0; i < 30; i++) {
        positionEcf = computeSatPos(julian);
        position = new Argon.Cesium.ConstantPositionProperty(
            Argon.Cesium.Cartesian3.fromElements(positionEcf.x, positionEcf.y, positionEcf.z));
        orbitECF.push(position);
        localPos = position.getValueInReferenceFrame(julian, frame);
        vec3 = new THREE.Vector3(localPos.x,localPos.y,localPos.z);
        orbitXYZ.vertices.push(vec3);   
        Argon.Cesium.JulianDate.addMinutes(julian, 1, julian);
    }
}

function updateOrbit (julian) {
    if (!satrec)
        return;  // do nothing if we don't have the satellite definitions yet

    if (orbitECF == undefined)
        return;
    
    // remove the oldest location
    orbitECF.shift();
    orbitXYZ.vertices.shift();
    
    const frame = app.context.getDefaultReferenceFrame();
    const positionEcf = computeSatPos(julian);
    const position = new Argon.Cesium.ConstantPositionProperty(
            Argon.Cesium.Cartesian3.fromElements(positionEcf.x, positionEcf.y, positionEcf.z));
    orbitECF.push(position);
    const localPos = position.getValueInReferenceFrame(julian, frame);
    const vec3 = new THREE.Vector3(localPos.x,localPos.y,localPos.z);
    orbitXYZ.vertices.push(vec3);   
    orbitXYZ.verticesNeedUpdate = true;
}

function computeSatPos (julian) {            
    //  Or you can use a calendar date and time (obtained from Javascript Date).
    const now = Argon.Cesium.JulianDate.toDate(julian);

    // NOTE: while Javascript Date returns months in range 0-11, 
    // all satellite.js methods require months in range 1-12.
    const positionAndVelocity = satellite.propagate(
        satrec,
        now.getUTCFullYear(),
        now.getUTCMonth() + 1, // Note, this function requires months in range 1-12.
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds()
    );

    // The position_velocity result is a key-value pair of ECI coordinates.
    // These are the base results from which all other coordinates are derived.
    let positionEci = positionAndVelocity.position;
    let velocityEci = positionAndVelocity.velocity;

    // You will need GMST for some of the coordinate transforms.
    // http://en.wikipedia.org/wiki/Sidereal_time#Definition
    // NOTE: GMST, though a measure of time, is defined as an angle in radians.
    // Also, be aware that the month range is 1-12, not 0-11.
    var gmst = satellite.gstimeFromDate(
        now.getUTCFullYear(),
        now.getUTCMonth() + 1, // Note, this function requires months in range 1-12.
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds()
    );

    // You can get ECF, Geodetic, Look Angles, and Doppler Factor.
    const positionEcf   = satellite.eciToEcf(positionEci, gmst);

    // The coordinates are all stored in key-value pairs.
    // ECI and ECF are accessed by `x`, `y`, `z` properties.
    // They are in kilometers, so we need to convert to meters for Cesium
    positionEcf.x *= 1000.0;
    positionEcf.y *= 1000.0;
    positionEcf.z *= 1000.0;
    
    return positionEcf;
}

function updateSat (julian) {
    if (!satrec)
        return;  // do nothing if we don't have the satellite definitions yet

    //  Or you can use a calendar date and time (obtained from Javascript Date).
    const now = Argon.Cesium.JulianDate.toDate(julian);

    // NOTE: while Javascript Date returns months in range 0-11, 
    // all satellite.js methods require months in range 1-12.
    const positionAndVelocity = satellite.propagate(
        satrec,
        now.getUTCFullYear(),
        now.getUTCMonth() + 1, // Note, this function requires months in range 1-12.
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds()
    );

    // The position_velocity result is a key-value pair of ECI coordinates.
    // These are the base results from which all other coordinates are derived.
    let positionEci = positionAndVelocity.position;
    let velocityEci = positionAndVelocity.velocity;

    // You will need GMST for some of the coordinate transforms.
    // http://en.wikipedia.org/wiki/Sidereal_time#Definition
    // NOTE: GMST, though a measure of time, is defined as an angle in radians.
    // Also, be aware that the month range is 1-12, not 0-11.
    var gmst = satellite.gstimeFromDate(
        now.getUTCFullYear(),
        now.getUTCMonth() + 1, // Note, this function requires months in range 1-12.
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds()
    );

    // You can get ECF, Geodetic, Look Angles, and Doppler Factor.
    const positionEcf   = satellite.eciToEcf(positionEci, gmst);
    const velocityEcf   = satellite.eciToEcf(velocityEci, gmst);
    // const positionGd    = satellite.eciToGeodetic(positionEci, gmst);

    // The coordinates are all stored in key-value pairs.
    // ECI and ECF are accessed by `x`, `y`, `z` properties.
    // They are in kilometers, so we need to convert to meters for Cesium
    positionEcf.x *= 1000.0;
    positionEcf.y *= 1000.0;
    positionEcf.z *= 1000.0;
    velocityEcf.x *= 1000.0;
    velocityEcf.y *= 1000.0;
    velocityEcf.z *= 1000.0;

    // add a sample with the newly computed value
    issECEF.position.addSample(Argon.Cesium.JulianDate.fromDate(now),
        new Argon.Cesium.Cartesian3(positionEcf.x, positionEcf.y, positionEcf.z),
        [new Argon.Cesium.Cartesian3(velocityEcf.x, velocityEcf.y, velocityEcf.z)]);

}
// run it once so we have valid values in the globals
//updateSat();

// make floating point output a little less ugly
function toFixed(value, precision) {
    const power = Math.pow(10, precision || 0);
    return String(Math.round(value * power) / power);
}

// Create a buffer of points based on time in the past/future.  Add/remove a point
// each minute (say).  Draw a line based on these points.
 
// set the local origin to EUS so that 
// +X is east, +Y is up, and +Z is south 
// (this is just an example, use whatever origin you prefer)
app.context.setDefaultReferenceFrame(app.context.localOriginEastUpSouth);

app.updateEvent.addEventListener((state) => {
    const time = app.context.getTime();
    const currMinute = (Argon.Cesium.JulianDate.toDate(time)).getUTCMinutes();
    if (currMinute !== lastMinute) {
        lastMinute = currMinute;
        updateSat(time);
        //updateOrbit(time);
    }

    // We can optionally provide a second argument to getCurrentEntityState
    // with a desired reference frame. Otherwise, the implementation uses
    // the default origin as the reference frame. 
    const userPose = app.context.getEntityPose(app.context.user);

    if (userPose.poseStatus & Argon.PoseStatus.KNOWN) {
        user.position.copy(userPose.position);
        user.quaternion.copy(userPose.orientation);
        userLocation.position.copy(userPose.position);
    }

    const issECEFState = app.context.getEntityPose(issECEF);
    if (issECEFState.poseStatus) {
        const relPos = Argon.Cesium.Cartesian3.subtract(issECEFState.position,
                                                        userPose.position,
                                                        new Argon.Cesium.Cartesian3());
        const magnitude = Argon.Cesium.Cartesian3.magnitude(relPos);

        // make it 1 km away in the same direction
        Argon.Cesium.Cartesian3.multiplyByScalar(relPos, 1000.0 / magnitude, relPos);
        Argon.Cesium.Cartesian3.add(relPos, userPose.position, relPos);
        issObject.position.copy(relPos);
    }
    let elem = document.getElementById('location');

    if (satrec) {
        let latitude = 0;
        let longitude = 0;
        let height = 0;

        const issECEFStateFIXED = app.context.getEntityPose(issECEF,
                Argon.Cesium.ReferenceFrame.FIXED);
        if (issECEFStateFIXED.poseStatus) {
            const pos = Argon.Cesium.Ellipsoid.WGS84.cartesianToCartographic(issECEFStateFIXED.position);
            if (pos) {
                longitude = Argon.Cesium.CesiumMath.toDegrees(pos.longitude);
                latitude = Argon.Cesium.CesiumMath.toDegrees(pos.latitude);
                height = pos.height;
            }
        }

        let infoText = "ISS location: " + toFixed(longitude,6) +
            ", " + toFixed(latitude,6) + ", " +
            toFixed(height,6);
        elem.innerText = infoText;
    } else {
        elem.innerText = "Waiting for TLE file to download";
    }
});

app.renderEvent.addEventListener(() => {
    const viewport = app.view.getViewport();    

    webglRenderer.setSize(viewport.width, viewport.height);    
    cssRenderer.setSize(viewport.width, viewport.height);
    for (let subview of app.view.getSubviews()) {
        camera.position.copy(subview.pose.position);
        camera.quaternion.copy(subview.pose.orientation);
        camera.projectionMatrix.fromArray(subview.projectionMatrix);
        const {x,y,width,height} = subview.viewport;
        webglRenderer.setViewport(x,y,width,height);
        webglRenderer.setScissor(x,y,width,height);
        webglRenderer.setScissorTest(true);
        webglRenderer.render(scene, camera);
        
        // only render the css content if we are in one view
        if (subview.type == Argon.SubviewType.SINGULAR) {
            //cssRenderer.setViewport(x,y,width,height);
            cssRenderer.render(scene, camera);
            cssRenderer.domElement.style.display = "block";
        } else {
            cssRenderer.domElement.style.display = "none";
        }
    }
});

// ISS object
const issObject = new THREE.Object3D;
scene.add(issObject);

// create a 100m cube with a wooden box texture on it, that we will attach to 
// the geospatial object for the ISS 
// Box texture from https://www.flickr.com/photos/photoshoproadmap/8640003215/sizes/l/in/photostream/
//, licensed under https://creativecommons.org/licenses/by/2.0/legalcode
//
// ISS texture from 
// http://765.blogspot.com/2014/07/what-does-international-space-station.html


// REPLACE THE BOX with Three.Sprite
// http://threejs.org/docs/#Reference/Objects/Sprite
//
// Draw a path for the past/future trajectory, using Three.Line
// http://threejs.org/docs/#Reference/Objects/Line

const satObj = new THREE.Object3D;
const texloader = new THREE.TextureLoader()
texloader.load( 'includes/ISS-2011.png', function ( texture ) {
    const material = new THREE.SpriteMaterial( { map: texture, color: 0xffffff, fog: false } );
    const sprite = new THREE.Sprite( material );
	sprite.scale.copy(new THREE.Vector3( 100, 100, 100 ));
    satObj.add( sprite );
});
issObject.add(satObj);
scene.add(issObject);

// creating 6 divs to indicate the x y z positioning
const divXpos = document.createElement('div')
const divXneg = document.createElement('div')
const divYpos = document.createElement('div')
const divYneg = document.createElement('div')
const divZpos = document.createElement('div')
const divZneg = document.createElement('div')

// programatically create a stylesheet for our direction divs
// and add it to the document
const style = document.createElement("style");
style.type = 'text/css';
document.head.appendChild(style);
const sheet = <CSSStyleSheet>style.sheet;
sheet.insertRule(`
    .direction {
        opacity: 0.5;
        width: 100px;
        height: 100px;
        border-radius: 50%;
        line-height: 100px;
        fontSize: 20px;
        text-align: center;
    }
`, 0);

// Put content in each one  (should do this as a couple of functions)
// for X
divXpos.className = 'direction'
divXpos.style.backgroundColor = "red"
divXpos.innerText = "East (+X)"

divXneg.className = 'direction'
divXneg.style.backgroundColor = "red"
divXneg.innerText = "West (-X)"

// for Y
divYpos.className = 'direction'
divYpos.style.backgroundColor = "blue"
divYpos.innerText = "Up (+Y)"

divYneg.className = 'direction'
divYneg.style.backgroundColor = "blue"
divYneg.innerText = "Down (-Y)"

//for Z
divZpos.className = 'direction'
divZpos.style.backgroundColor = "green"
divZpos.innerText = "South (+Z)"

divZneg.className = 'direction'
divZneg.style.backgroundColor = "green"
divZneg.innerText = "North (-Z)"

// create 6 CSS3DObjects in the scene graph
var cssObjectXpos = new THREE.CSS3DObject(divXpos)
var cssObjectXneg = new THREE.CSS3DObject(divXneg)
var cssObjectYpos = new THREE.CSS3DObject(divYpos)
var cssObjectYneg = new THREE.CSS3DObject(divYneg)
var cssObjectZpos = new THREE.CSS3DObject(divZpos)
var cssObjectZneg = new THREE.CSS3DObject(divZneg)

// the width and height is used to align things.
cssObjectXpos.position.x = 200.0
cssObjectXpos.rotation.y = - Math.PI / 2

cssObjectXneg.position.x = -200.0
cssObjectXneg.rotation.y = Math.PI / 2

// for Y
cssObjectYpos.position.y = 200.0
cssObjectYpos.rotation.x = Math.PI / 2

cssObjectYneg.position.y = - 200.0
cssObjectYneg.rotation.x = - Math.PI / 2

// for Z
cssObjectZpos.position.z = 200.0
cssObjectZpos.rotation.y = Math.PI

cssObjectZneg.position.z = -200.0
//no rotation need for this one

userLocation.add(cssObjectXpos)
userLocation.add(cssObjectXneg)
userLocation.add(cssObjectYpos)
userLocation.add(cssObjectYneg)
userLocation.add(cssObjectZpos)
userLocation.add(cssObjectZneg)

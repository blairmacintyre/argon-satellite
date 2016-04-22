import loader = require('./loader');

declare const THREE: any;
declare const Argon: any;
declare const satellite: any;

const app = Argon.init();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();

const cssRenderer = new THREE.CSS3DRenderer();
const webglRenderer = new THREE.WebGLRenderer({ alpha: true, logarithmicDepthBuffer: true });

app.viewport.element.appendChild(cssRenderer.domElement);
app.viewport.element.appendChild(webglRenderer.domElement);

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
    let date = Argon.Cesium.JulianDate.now();
    updateSat(date);
    Argon.Cesium.JulianDate.addSeconds(date, 1, date);
    updateSat(date);
}

function onProgress (progress: ProgressEvent) {
    console.log("loading: " + progress.loaded + " of " + progress.total + "...");
}

function onError (error: ErrorEvent) {
    console.log("error! " + error);
}

loader.loadTLEs("http://celestrak.com/NORAD/elements/visual.txt", onLoad, onProgress, onError);

const issPosition = new Argon.Cesium.SampledPositionProperty(
                            Argon.Cesium.ReferenceFrame.FIXED, 1);
issPosition.forwardExtrapolationType = Argon.Cesium.ExtrapolationType.EXTRAPOLATE;
issECEF.position = issPosition;

// Initialize a satellite record
let positionEcf = null;
let velocityEcf = null;
let positionGd = null;
let lastSecond = -1;  // want it to always run once; (new Date()).getUTCSeconds();

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
    positionEcf   = satellite.eciToEcf(positionEci, gmst);
    velocityEcf   = satellite.eciToEcf(velocityEci, gmst);
    positionGd    = satellite.eciToGeodetic(positionEci, gmst);

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

// set the local origin to EUS so that 
// +X is east, +Y is up, and +Z is south 
// (this is just an example, use whatever origin you prefer)
app.context.setDefaultReferenceFrame(app.context.localOriginEastUpSouth);

app.updateEvent.addEventListener((state) => {
    const currSecond = (Argon.Cesium.JulianDate.toDate(state.time)).getUTCMinutes();
    if (currSecond !== lastSecond) {
        lastSecond = currSecond;
        updateSat(state.time);
    }

    const frustum = app.camera.currentFrustum;
    camera.fov = Argon.Cesium.CesiumMath.toDegrees(frustum.fovy);
    camera.aspect = frustum.aspectRatio;
    camera.projectionMatrix.fromArray(frustum.infiniteProjectionMatrix);

    // We can optionally provide a second argument to getCurrentEntityState
    // with a desired reference frame. Otherwise, the implementation uses
    // the default origin as the reference frame. 
    const eyeState = app.context.getCurrentEntityState(app.context.eye);

    if (eyeState.poseStatus | Argon.PoseStatus.KNOWN) {
        camera.position.copy(eyeState.position);
        camera.quaternion.copy(eyeState.orientation);
        eyeOrigin.position.copy(eyeState.position);
    }

    const issECEFState = app.context.getCurrentEntityState(issECEF);
    if (issECEFState.poseStatus) {
        const relPos = Argon.Cesium.Cartesian3.subtract(issECEFState.position,
                                                        eyeState.position,
                                                        new Argon.Cesium.Cartesian3());
        const magnitude = Argon.Cesium.Cartesian3.magnitude(relPos);

        // make it 1 km away in the same direction
        Argon.Cesium.Cartesian3.multiplyByScalar(relPos, 1000.0 / magnitude, relPos);
        Argon.Cesium.Cartesian3.add(relPos, eyeState.position, relPos);
        issObject.position.copy(relPos);
    }
    let elem = document.getElementById('location');

    if (satrec) {
        let latitude = 0;
        let longitude = 0;
        let height = 0;

        const issECEFStateFIXED = app.context.getCurrentEntityState(issECEF,
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
    const {width, height} = app.viewport.current;
    cssRenderer.setSize(width, height);
    webglRenderer.setSize(width, height);
    cssRenderer.render(scene, camera);
    webglRenderer.render(scene, camera);
});

// ISS object
const issObject = new THREE.Object3D;
scene.add(issObject);

// create a 100m cube with a wooden box texture on it, that we will attach to 
// the geospatial object for the ISS 
// Box texture from https://www.flickr.com/photos/photoshoproadmap/8640003215/sizes/l/in/photostream/
//, licensed under https://creativecommons.org/licenses/by/2.0/legalcode

const box = new THREE.Object3D;
const texloader = new THREE.TextureLoader()
texloader.load( 'includes/box.png', function ( texture ) {
    const geometry = new THREE.BoxGeometry(50, 50, 50);
    const material = new THREE.MeshBasicMaterial( { map: texture } );
    const mesh = new THREE.Mesh( geometry, material );
    box.add( mesh );
});
issObject.add(box);
scene.add(issObject);

const eyeOrigin = new THREE.Object3D;
scene.add(eyeOrigin);

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

eyeOrigin.add(cssObjectXpos)
eyeOrigin.add(cssObjectXneg)
eyeOrigin.add(cssObjectYpos)
eyeOrigin.add(cssObjectYneg)
eyeOrigin.add(cssObjectZpos)
eyeOrigin.add(cssObjectZneg)

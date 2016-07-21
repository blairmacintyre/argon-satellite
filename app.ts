/// <reference path="typings/index.d.ts"/>
import loader = require('./loader');
import argonSat = require('./argon-satellite');

declare const Argon: any;

// grab some handles on APIs we use
const Cesium = Argon.Cesium;
const Cartesian3 = Cesium.Cartesian3;
const JulianDate = Cesium.JulianDate;
const CesiumMath = Cesium.CesiumMath;
const Transforms = Cesium.Transforms;
const WGS84 = Cesium.Ellipsoid.WGS84;
const ConstantPositionProperty = Cesium.ConstantPositionProperty;
const ReferenceFrame = Cesium.ReferenceFrame;

// initialize Argon
const app = Argon.init();

// set the local origin to EUS so that 
// +X is east, +Y is up, and +Z is south 
// (this is just an example, use whatever origin you prefer)
app.context.setDefaultReferenceFrame(app.context.localOriginEastUpSouth);

//
// create the Three.js scene
//
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
export const user = new THREE.Object3D();
export const userLocation = new THREE.Object3D;
scene.add(camera);
scene.add(user);
scene.add(userLocation);

// our two renders (WebGL and CSS)
const cssRenderer = new (<any>THREE).CSS3DArgonRenderer();
const hud = new (<any>THREE).CSS3DArgonHUD();
const webglRenderer = new THREE.WebGLRenderer({ alpha: true, logarithmicDepthBuffer: true });
webglRenderer.setPixelRatio(window.devicePixelRatio);

app.view.element.appendChild(webglRenderer.domElement);
app.view.element.appendChild(cssRenderer.domElement);
app.view.element.appendChild(hud.domElement);

// We put some elements in the index.html, for convenience. 
// So let's duplicate and move the information box to the hudElements 
// of the css renderer
let menu = document.getElementById('menu');
let menu2: HTMLElement = menu.cloneNode( true ) as HTMLElement;
menu2.id = "menu2";   // make the id unique

var menuchild = menu.getElementsByClassName('location');
let elem = menuchild.item(0) as HTMLElement;
menuchild = menu2.getElementsByClassName('location');
let elem2 = menuchild.item(0) as HTMLElement;

menu.remove();
menu2.remove();
hud.hudElements[0].appendChild(menu);
hud.hudElements[1].appendChild(menu2);

// get the ISS object set up, so we can render it in the sky.  We'll use
// the satellite library to convert all the way into ECEF coordinates, and 
// then move into Cesium.  We could probably use Cesium's INERTIAL to FIXED 
// conversion instead, but this seems simplest.
//
// use a Cesium SampledPosition, and keep a future value in there, so we can 
// interpolate to "now" whenever we need

// a Cesium entity for the satellite
let issECEF = new Cesium.Entity({
    name: "ISS",
    orientation: Cesium.Quaternion.IDENTITY
});

const issPosition = new Cesium.SampledPositionProperty(ReferenceFrame.FIXED, 1);
issPosition.forwardExtrapolationType = Cesium.ExtrapolationType.EXTRAPOLATE;
issECEF.position = issPosition;

// a place to store the TLE for the ISS when it's been fetched.
// The TLE describes the trajectory of the ISS around the earth
var tleISS = null;

// the actual satellite object for the ISS, initialized from the TLE
let satrec = null;

// run when the TLE file has been download.  We are mirroring the 
// 100 most visible satelitte's TLE file from celestrak.org on our server 
function initISS () {
    if (satrec)
        return false;
        
    satrec = argonSat.getSatrec("ISS (ZARYA)")

    if (!satrec)
        return false;

    // update the satellite positions a couple of times so
    // we have enough data in the issECEF entity position property
    // to interpolate
    let date = Argon.Cesium.JulianDate.now();
    argonSat.updateSat(date, satrec, issECEF);
    Argon.Cesium.JulianDate.addSeconds(date, 1, date);
    argonSat.updateSat(date, satrec, issECEF);
    
    // set up the orbit geometry and line object
    initOrbit(date);
   
    const material = new THREE.LineBasicMaterial({
	    color: 0x0000ff
    });
    const line = new THREE.Line( orbitXYZ, material );    
    scene.add(line);

    return true;
}

// ISS object
const issObject = new THREE.Object3D;
scene.add(issObject);

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

let issHeightDiv = document.getElementById("iss-height");
let issHeightDiv2 = issHeightDiv.cloneNode(true) as HTMLElement;
const issObjectLabel = new THREE.CSS3DSprite([issHeightDiv, issHeightDiv2]);
//const issObjectLabel = new THREE.CSS3DObject([issHeightDiv, issHeightDiv2]);
issObjectLabel.scale.copy(new THREE.Vector3( 2, 2, 2 ));

issObject.add(issObjectLabel);

//
// compute the orbit (15 minutes before and after it's current position) 
// so we can draw it
//
let orbitECF = undefined;
let orbitXYZ = undefined;
function initOrbit (julian) {
    orbitECF = [];
    orbitXYZ = new THREE.Geometry();
    
    // start some minutes ago
    JulianDate.addMinutes(julian, -15, julian);

    var positionEcf;
    var position;
    var vec3;
    var localPos;
    const frame = app.context.getDefaultReferenceFrame();
    for (var i = 0; i < 30; i++) {
        positionEcf = argonSat.computeSatPos(julian, satrec);
        position = new ConstantPositionProperty(
            Cartesian3.fromElements(positionEcf.x, positionEcf.y, positionEcf.z));
        orbitECF.push(position);
        localPos = position.getValueInReferenceFrame(julian, frame);
        vec3 = new THREE.Vector3(localPos.x,localPos.y,localPos.z);
        orbitXYZ.vertices.push(vec3);   
        JulianDate.addMinutes(julian, 1, julian);
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
    const positionEcf = argonSat.computeSatPos(julian, satrec);

    const position = new ConstantPositionProperty(
            Cartesian3.fromElements(positionEcf.x, positionEcf.y, positionEcf.z));
    orbitECF.push(position);
    const localPos = position.getValueInReferenceFrame(julian, frame);
    const vec3 = new THREE.Vector3(localPos.x,localPos.y,localPos.z);
    orbitXYZ.vertices.push(vec3);   
    orbitXYZ.verticesNeedUpdate = true;
}

// make floating point output a little less ugly
function toFixed(value, precision) {
    const power = Math.pow(10, precision || 0);
    return String(Math.round(value * power) / power);
}
 

let lastMinute = -1;  // want it to always run once; (new Date()).getUTCSeconds();
app.updateEvent.addEventListener((state) => {
    const time = app.context.getTime();
    const currMinute = (JulianDate.toDate(time)).getUTCMinutes();

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
        const relPos = Cartesian3.subtract(issECEFState.position,
                                                        userPose.position,
                                                        new Cartesian3());
        const magnitude = Cartesian3.magnitude(relPos);

        // make it 1 km away in the same direction
        Cartesian3.multiplyByScalar(relPos, 1000.0 / magnitude, relPos);
        Cartesian3.add(relPos, userPose.position, relPos);
        issObject.position.copy(relPos);
    }

    if (satrec) {
        if (currMinute !== lastMinute) {
            lastMinute = currMinute;
            argonSat.updateSat(time, satrec, issECEF);
            updateOrbit(time);
        }

        let latitude = 0;
        let longitude = 0;
        let height = 0;

        const issECEFStateFIXED = app.context.getEntityPose(issECEF,
                ReferenceFrame.FIXED);
        if (issECEFStateFIXED.poseStatus) {
            const pos = WGS84.cartesianToCartographic(issECEFStateFIXED.position);
            if (pos) {
                longitude = CesiumMath.toDegrees(pos.longitude);
                latitude = CesiumMath.toDegrees(pos.latitude);
                height = pos.height;
            }
        }

        let infoText = "ISS location: " + toFixed(longitude,6) +
            ", " + toFixed(latitude,6);
        elem.innerText = infoText;
        elem2.innerText = infoText;
        let heightText = "ISS Height: " + toFixed(height,6);
        issHeightDiv.innerText = heightText;
        issHeightDiv2.innerText = heightText;
    } else {
        // try to initialize it, for next time
        if (initISS()) {
            lastMinute = currMinute;
        }

        let msg = "Waiting for TLE file to download";
        elem.innerText = msg;
        elem2.innerText = msg;
        issHeightDiv.innerText = msg;
        issHeightDiv2.innerText = msg;
    }
});


app.renderEvent.addEventListener(() => {
    const viewport = app.view.getViewport();    

    webglRenderer.setSize(viewport.width, viewport.height);    
    cssRenderer.setSize(viewport.width, viewport.height);
    hud.setSize(viewport.width, viewport.height);

    for (let subview of app.view.getSubviews()) {
        const {x,y,width,height} = subview.viewport;

        camera.position.copy(subview.pose.position);
        camera.quaternion.copy(subview.pose.orientation);
        camera.projectionMatrix.fromArray(subview.projectionMatrix);

        var fov = camera.fov;
        cssRenderer.updateCameraFOVFromProjection(camera);
        cssRenderer.setViewport(x,y,width,height, subview.index);
        cssRenderer.render(scene, camera, subview.index);

        if (camera.fov != fov) {
            console.log("viewport: " + viewport.width + "x" + viewport.height);
            console.log("subview: " + x + "x" + y + " " + width + "x" + height);
            console.log("fov: " + fov + ", CSS FOV: " + cssRenderer.fovStyle)
        }            
                
        webglRenderer.setViewport(x,y,width,height);
        webglRenderer.setScissor(x,y,width,height);
        webglRenderer.setScissorTest(true);
        webglRenderer.render(scene, camera);

        // adjust the hud
        hud.setViewport(x,y,width,height, subview.index);
        hud.render(subview.index);
    }
    // want to force a layout of the DOM, so read something!
    var stupidtext = elem.innerHTML;
});

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

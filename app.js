"use strict";
var argonSat = require('./argon-satellite');
// grab some handles on APIs we use
var Cesium = Argon.Cesium;
var Cartesian3 = Cesium.Cartesian3;
var JulianDate = Cesium.JulianDate;
var CesiumMath = Cesium.CesiumMath;
var Transforms = Cesium.Transforms;
var WGS84 = Cesium.Ellipsoid.WGS84;
var ConstantPositionProperty = Cesium.ConstantPositionProperty;
var ReferenceFrame = Cesium.ReferenceFrame;
// initialize Argon
var app = Argon.init();
// set the local origin to EUS so that 
// +X is east, +Y is up, and +Z is south 
// (this is just an example, use whatever origin you prefer)
app.context.setDefaultReferenceFrame(app.context.localOriginEastUpSouth);
//
// create the Three.js scene
//
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera();
exports.user = new THREE.Object3D();
exports.userLocation = new THREE.Object3D;
scene.add(camera);
scene.add(exports.user);
scene.add(exports.userLocation);
// our two renders (WebGL and CSS)
var cssRenderer = new THREE.CSS3DArgonRenderer();
var hud = new THREE.CSS3DArgonHUD();
var webglRenderer = new THREE.WebGLRenderer({ alpha: true, logarithmicDepthBuffer: true });
webglRenderer.setPixelRatio(window.devicePixelRatio);
app.view.element.appendChild(webglRenderer.domElement);
app.view.element.appendChild(cssRenderer.domElement);
app.view.element.appendChild(hud.domElement);
// We put some elements in the index.html, for convenience. 
// So let's duplicate and move the information box to the hudElements 
// of the css renderer
var menu = document.getElementById('menu');
var menu2 = menu.cloneNode(true);
menu2.id = "menu2"; // make the id unique
var menuchild = menu.getElementsByClassName('location');
var elem = menuchild.item(0);
menuchild = menu2.getElementsByClassName('location');
var elem2 = menuchild.item(0);
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
var issECEF = new Cesium.Entity({
    name: "ISS",
    orientation: Cesium.Quaternion.IDENTITY
});
var issPosition = new Cesium.SampledPositionProperty(ReferenceFrame.FIXED, 1);
issPosition.forwardExtrapolationType = Cesium.ExtrapolationType.EXTRAPOLATE;
issECEF.position = issPosition;
// a place to store the TLE for the ISS when it's been fetched.
// The TLE describes the trajectory of the ISS around the earth
var tleISS = null;
// the actual satellite object for the ISS, initialized from the TLE
var satrec = null;
// run when the TLE file has been download.  We are mirroring the 
// 100 most visible satelitte's TLE file from celestrak.org on our server 
function initISS() {
    if (satrec)
        return false;
    satrec = argonSat.getSatrec("ISS (ZARYA)");
    if (!satrec)
        return false;
    // update the satellite positions a couple of times so
    // we have enough data in the issECEF entity position property
    // to interpolate
    var date = Argon.Cesium.JulianDate.now();
    argonSat.updateSat(date, satrec, issECEF);
    Argon.Cesium.JulianDate.addSeconds(date, 1, date);
    argonSat.updateSat(date, satrec, issECEF);
    // set up the orbit geometry and line object
    initOrbit(date);
    var material = new THREE.LineBasicMaterial({
        color: 0x0000ff
    });
    var line = new THREE.Line(orbitXYZ, material);
    scene.add(line);
    return true;
}
// ISS object
var issObject = new THREE.Object3D;
scene.add(issObject);
// ISS texture from 
// http://765.blogspot.com/2014/07/what-does-international-space-station.html
// REPLACE THE BOX with Three.Sprite
// http://threejs.org/docs/#Reference/Objects/Sprite
//
// Draw a path for the past/future trajectory, using Three.Line
// http://threejs.org/docs/#Reference/Objects/Line
var satObj = new THREE.Object3D;
var texloader = new THREE.TextureLoader();
texloader.load('includes/circle-transparent-BG.png', function (texture) {
    var material = new THREE.SpriteMaterial({ map: texture, color: 0xffffff, fog: false });
    var sprite = new THREE.Sprite(material);
    sprite.scale.copy(new THREE.Vector3(150, 150, 150));
    satObj.add(sprite);
});
issObject.add(satObj);
var issHeightDiv = document.getElementById("iss-height");
var issHeightDiv2 = issHeightDiv.cloneNode(true);
var issObjectLabel = new THREE.CSS3DSprite([issHeightDiv, issHeightDiv2]);
//const issObjectLabel = new THREE.CSS3DObject([issHeightDiv, issHeightDiv2]);
issObjectLabel.scale.copy(new THREE.Vector3(2, 2, 2));
issObject.add(issObjectLabel);
//
// compute the orbit (15 minutes before and after it's current position) 
// so we can draw it
//
var orbitECF = undefined;
var orbitXYZ = undefined;
function initOrbit(julian) {
    orbitECF = [];
    orbitXYZ = new THREE.Geometry();
    // start some minutes ago
    JulianDate.addMinutes(julian, -15, julian);
    var positionEcf;
    var position;
    var vec3;
    var localPos;
    var frame = app.context.getDefaultReferenceFrame();
    for (var i = 0; i < 30; i++) {
        positionEcf = argonSat.computeSatPos(julian, satrec);
        position = new ConstantPositionProperty(Cartesian3.fromElements(positionEcf.x, positionEcf.y, positionEcf.z));
        orbitECF.push(position);
        localPos = position.getValueInReferenceFrame(julian, frame);
        vec3 = new THREE.Vector3(localPos.x, localPos.y, localPos.z);
        orbitXYZ.vertices.push(vec3);
        JulianDate.addMinutes(julian, 1, julian);
    }
}
function updateOrbit(julian) {
    if (!satrec)
        return; // do nothing if we don't have the satellite definitions yet
    if (orbitECF == undefined)
        return;
    JulianDate.addMinutes(julian, 15, julian);
    // remove the oldest location
    orbitECF.shift();
    orbitXYZ.vertices.shift();
    var frame = app.context.getDefaultReferenceFrame();
    var positionEcf = argonSat.computeSatPos(julian, satrec);
    var position = new ConstantPositionProperty(Cartesian3.fromElements(positionEcf.x, positionEcf.y, positionEcf.z));
    orbitECF.push(position);
    var localPos = position.getValueInReferenceFrame(julian, frame);
    var vec3 = new THREE.Vector3(localPos.x, localPos.y, localPos.z);
    orbitXYZ.vertices.push(vec3);
    orbitXYZ.verticesNeedUpdate = true;
}
// make floating point output a little less ugly
function toFixed(value, precision) {
    var power = Math.pow(10, precision || 0);
    return String(Math.round(value * power) / power);
}
var lastMinute = -1; // want it to always run once; (new Date()).getUTCSeconds();
app.updateEvent.addEventListener(function (state) {
    var time = app.context.getTime();
    var currMinute = (JulianDate.toDate(time)).getUTCMinutes();
    // We can optionally provide a second argument to getCurrentEntityState
    // with a desired reference frame. Otherwise, the implementation uses
    // the default origin as the reference frame. 
    var userPose = app.context.getEntityPose(app.context.user);
    if (userPose.poseStatus & Argon.PoseStatus.KNOWN) {
        exports.user.position.copy(userPose.position);
        exports.user.quaternion.copy(userPose.orientation);
        exports.userLocation.position.copy(userPose.position);
    }
    var issECEFState = app.context.getEntityPose(issECEF);
    if (issECEFState.poseStatus) {
        var relPos = Cartesian3.subtract(issECEFState.position, userPose.position, new Cartesian3());
        var magnitude = Cartesian3.magnitude(relPos);
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
        var latitude = 0;
        var longitude = 0;
        var height = 0;
        var issECEFStateFIXED = app.context.getEntityPose(issECEF, ReferenceFrame.FIXED);
        if (issECEFStateFIXED.poseStatus) {
            var pos = WGS84.cartesianToCartographic(issECEFStateFIXED.position);
            if (pos) {
                longitude = CesiumMath.toDegrees(pos.longitude);
                latitude = CesiumMath.toDegrees(pos.latitude);
                height = pos.height;
            }
        }
        var infoText = "ISS location: " + toFixed(longitude, 6) +
            ", " + toFixed(latitude, 6);
        elem.innerText = infoText;
        elem2.innerText = infoText;
        var heightText = "ISS Height: " + toFixed(height, 0);
        issHeightDiv.innerText = heightText;
        issHeightDiv2.innerText = heightText;
    }
    else {
        // try to initialize it, for next time
        if (initISS()) {
            lastMinute = currMinute;
        }
        var msg = "Waiting for TLE file to download";
        elem.innerText = msg;
        elem2.innerText = msg;
        issHeightDiv.innerText = msg;
        issHeightDiv2.innerText = msg;
    }
});
app.renderEvent.addEventListener(function () {
    var viewport = app.view.getViewport();
    webglRenderer.setSize(viewport.width, viewport.height);
    cssRenderer.setSize(viewport.width, viewport.height);
    hud.setSize(viewport.width, viewport.height);
    for (var _i = 0, _a = app.view.getSubviews(); _i < _a.length; _i++) {
        var subview = _a[_i];
        var _b = subview.viewport, x = _b.x, y = _b.y, width = _b.width, height = _b.height;
        camera.position.copy(subview.pose.position);
        camera.quaternion.copy(subview.pose.orientation);
        camera.projectionMatrix.fromArray(subview.projectionMatrix);
        var fov = camera.fov;
        camera.fov = subview.frustum.fovy * 180 / Math.PI;
        cssRenderer.setViewport(x, y, width, height, subview.index);
        cssRenderer.render(scene, camera, subview.index);
        if (camera.fov != fov) {
            console.log("viewport: " + viewport.width + "x" + viewport.height);
            console.log("subview: " + x + "x" + y + " " + width + "x" + height);
            console.log("fov: " + fov + ", CSS FOV: " + cssRenderer.fovStyle);
        }
        webglRenderer.setViewport(x, y, width, height);
        webglRenderer.setScissor(x, y, width, height);
        webglRenderer.setScissorTest(true);
        webglRenderer.render(scene, camera);
        // adjust the hud
        hud.setViewport(x, y, width, height, subview.index);
        hud.render(subview.index);
    }
    // want to force a layout of the DOM, so read something!
    var stupidtext = elem.innerHTML;
});
// creating 6 divs to indicate the x y z positioning
var divXpos = document.createElement('div');
var divXneg = document.createElement('div');
var divYpos = document.createElement('div');
var divYneg = document.createElement('div');
var divZpos = document.createElement('div');
var divZneg = document.createElement('div');
// programatically create a stylesheet for our direction divs
// and add it to the document
var style = document.createElement("style");
style.type = 'text/css';
document.head.appendChild(style);
var sheet = style.sheet;
sheet.insertRule("\n    .direction {\n        opacity: 0.5;\n        width: 100px;\n        height: 100px;\n        border-radius: 50%;\n        line-height: 100px;\n        fontSize: 20px;\n        text-align: center;\n    }\n", 0);
// Put content in each one  (should do this as a couple of functions)
// for X
divXpos.className = 'direction';
divXpos.style.backgroundColor = "red";
divXpos.innerText = "East (+X)";
divXneg.className = 'direction';
divXneg.style.backgroundColor = "red";
divXneg.innerText = "West (-X)";
// for Y
divYpos.className = 'direction';
divYpos.style.backgroundColor = "blue";
divYpos.innerText = "Up (+Y)";
divYneg.className = 'direction';
divYneg.style.backgroundColor = "blue";
divYneg.innerText = "Down (-Y)";
//for Z
divZpos.className = 'direction';
divZpos.style.backgroundColor = "green";
divZpos.innerText = "South (+Z)";
divZneg.className = 'direction';
divZneg.style.backgroundColor = "green";
divZneg.innerText = "North (-Z)";
// create 6 CSS3DObjects in the scene graph
var cssObjectXpos = new THREE.CSS3DObject(divXpos);
var cssObjectXneg = new THREE.CSS3DObject(divXneg);
var cssObjectYpos = new THREE.CSS3DObject(divYpos);
var cssObjectYneg = new THREE.CSS3DObject(divYneg);
var cssObjectZpos = new THREE.CSS3DObject(divZpos);
var cssObjectZneg = new THREE.CSS3DObject(divZneg);
// the width and height is used to align things.
cssObjectXpos.position.x = 200.0;
cssObjectXpos.rotation.y = -Math.PI / 2;
cssObjectXneg.position.x = -200.0;
cssObjectXneg.rotation.y = Math.PI / 2;
// for Y
cssObjectYpos.position.y = 200.0;
cssObjectYpos.rotation.x = Math.PI / 2;
cssObjectYneg.position.y = -200.0;
cssObjectYneg.rotation.x = -Math.PI / 2;
// for Z
cssObjectZpos.position.z = 200.0;
cssObjectZpos.rotation.y = Math.PI;
cssObjectZneg.position.z = -200.0;
//no rotation need for this one
exports.userLocation.add(cssObjectXpos);
exports.userLocation.add(cssObjectXneg);
exports.userLocation.add(cssObjectYpos);
exports.userLocation.add(cssObjectYneg);
exports.userLocation.add(cssObjectZpos);
exports.userLocation.add(cssObjectZneg);

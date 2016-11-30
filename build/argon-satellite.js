define(["require", "exports", './loader'], function (require, exports, loader) {
    "use strict";
    // grab some handles on APIs we use
    var Cesium = Argon.Cesium;
    var Cartesian3 = Cesium.Cartesian3;
    var JulianDate = Cesium.JulianDate;
    var CesiumMath = Cesium.CesiumMath;
    var Transforms = Cesium.Transforms;
    var WGS84 = Cesium.Ellipsoid.WGS84;
    var ConstantPositionProperty = Cesium.ConstantPositionProperty;
    var ReferenceFrame = Cesium.ReferenceFrame;
    // Let's set up the Satellite tracking and rendering 
    //
    // a place to store the TLEs we read in
    var TLEs = null;
    // run when the TLE file has been download.  We are mirroring the 
    // 100 most visible satelitte's TLE file from celestrak.org on our server 
    function onLoad(tle) {
        TLEs = tle;
    }
    function onProgress(progress) {
        console.log("loading: " + progress.loaded + " of " + progress.total + "...");
    }
    function onError(error) {
        console.log("error! " + error);
    }
    // from http://celestrak.com/NORAD/elements/visual.txt
    //loader.loadTLEs("includes/visual.txt", onLoad, onProgress, onError);
    loader.loadTLEs("http://bmaci.com/celestrak/visual.txt", onLoad, onProgress, onError);
    function getSatrec(name) {
        if (!TLEs) {
            return null;
        }
        if (TLEs.hasOwnProperty(name) < 0) {
            return null;
        }
        var tle = TLEs[name];
        return satellite.twoline2satrec(tle[0], tle[1]);
    }
    exports.getSatrec = getSatrec;
    //
    // compute the satellite position
    //
    function computeSatPos(julian, satrec) {
        if (!satrec)
            return; // do nothing if we don't have the satellite definitions yet
        //  Or you can use a calendar date and time (obtained from Javascript Date).
        var now = JulianDate.toDate(julian);
        // NOTE: while Javascript Date returns months in range 0-11, 
        // all satellite.js methods require months in range 1-12.
        var positionAndVelocity = satellite.propagate(satrec, now.getUTCFullYear(), now.getUTCMonth() + 1, // Note, this function requires months in range 1-12.
        now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
        // The position_velocity result is a key-value pair of ECI coordinates.
        // These are the base results from which all other coordinates are derived.
        var positionEci = positionAndVelocity.position;
        var velocityEci = positionAndVelocity.velocity;
        // You will need GMST for some of the coordinate transforms.
        // http://en.wikipedia.org/wiki/Sidereal_time#Definition
        // NOTE: GMST, though a measure of time, is defined as an angle in radians.
        // Also, be aware that the month range is 1-12, not 0-11.
        var gmst = satellite.gstimeFromDate(now.getUTCFullYear(), now.getUTCMonth() + 1, // Note, this function requires months in range 1-12.
        now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
        // You can get ECF, Geodetic, Look Angles, and Doppler Factor.
        var positionEcf = satellite.eciToEcf(positionEci, gmst);
        // The coordinates are all stored in key-value pairs.
        // ECI and ECF are accessed by `x`, `y`, `z` properties.
        // They are in kilometers, so we need to convert to meters for Cesium
        positionEcf.x *= 1000.0;
        positionEcf.y *= 1000.0;
        positionEcf.z *= 1000.0;
        return positionEcf;
    }
    exports.computeSatPos = computeSatPos;
    function updateSat(julian, satrec, satECEF) {
        if (!satrec)
            return; // do nothing if we don't have the satellite definitions yet
        //  Or you can use a calendar date and time (obtained from Javascript Date).
        var now = JulianDate.toDate(julian);
        // NOTE: while Javascript Date returns months in range 0-11, 
        // all satellite.js methods require months in range 1-12.
        var positionAndVelocity = satellite.propagate(satrec, now.getUTCFullYear(), now.getUTCMonth() + 1, // Note, this function requires months in range 1-12.
        now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
        // The position_velocity result is a key-value pair of ECI coordinates.
        // These are the base results from which all other coordinates are derived.
        var positionEci = positionAndVelocity.position;
        var velocityEci = positionAndVelocity.velocity;
        // You will need GMST for some of the coordinate transforms.
        // http://en.wikipedia.org/wiki/Sidereal_time#Definition
        // NOTE: GMST, though a measure of time, is defined as an angle in radians.
        // Also, be aware that the month range is 1-12, not 0-11.
        var gmst = satellite.gstimeFromDate(now.getUTCFullYear(), now.getUTCMonth() + 1, // Note, this function requires months in range 1-12.
        now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
        // You can get ECF, Geodetic, Look Angles, and Doppler Factor.
        var positionEcf = satellite.eciToEcf(positionEci, gmst);
        var velocityEcf = satellite.eciToEcf(velocityEci, gmst);
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
        satECEF.position.addSample(JulianDate.fromDate(now), new Cartesian3(positionEcf.x, positionEcf.y, positionEcf.z), [new Cartesian3(velocityEcf.x, velocityEcf.y, velocityEcf.z)]);
    }
    exports.updateSat = updateSat;
});
//# sourceMappingURL=argon-satellite.js.map
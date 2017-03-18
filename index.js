const gtfs = require('gtfs');
const async = require('async');
const mongoose = require('mongoose');
const config = require('./scripts/config.json');

const agency_key = config.agencies[0].agency_key;
const route_id = '16';

mongoose.Promise = global.Promise;
mongoose.connect(config.mongoUrl);

function createTimetable() {
  async.series([
    function(callback) { getRoutes(callback) },
    function(callback) { getDirections(callback) },
    function(callback) { getTrips(callback) },
    function(callback) { getStopTimes(callback) }
  ], (err) => {
    if (err) throw err;
    
    process.exit();
  });
}

function getRoutes(callback) {
  gtfs.getRoutesByAgency(agency_key, (err, routes) => {
    if (err) throw err;
    
    const ids = routes.map(route => route.route_id);
    
    console.log('routes', ids);
    callback();
  });
}

function getDirections(callback) {
  console.log('id',route_id);
  gtfs.getDirectionsByRoute(agency_key, route_id, (err, directions) => {
    if (err) throw err;
    console.log('directions',directions);
    callback();
  });
}

function getTrips(callback) {
  const direction_id = '';
  gtfs.getTripsByRouteAndDirection(agency_key, route_id, direction_id, (err, trips) => {
    if (err) throw err;
    
    console.log('trips',trips);
    
    callback();
  });
}

function getStopTimes(callback) {
  const trip_id = '114266020';
  gtfs.getStoptimesByTrip(agency_key, trip_id, (err, stoptimes) => {
    if (err) throw err; 
    console.log('stop times',stoptimes.map(time => time.arrival_time));
    callback();
  });
}

createTimetable();

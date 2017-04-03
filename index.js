const gtfs = require('gtfs');
const fs = require('fs');
const mongoose = require('mongoose');
const config = require('./scripts/config.json');

const agency_key = config.agencies[0].agency_key;
const route_id = '16';
const direction_id = '';
const system = {};

mongoose.Promise = global.Promise;
mongoose.connect(config.mongoUrl);

gtfs.getStops(agency_key)
.then(stops => {
  system.stops = stops.reduce(function(obj, stop, i) {
    obj[stop.stop_id] = stop;
    return obj;
  }, {});
  
  return gtfs.getRoutesByAgency(agency_key);
})
.then(routes => {
  //console.log('routes',routes);
  return gtfs.getDirectionsByRoute(agency_key, route_id);
})
.then(directions => {
  //console.log('directions',directions);
  system.directions = {};
  system.directions[route_id] = directions.map(direction => direction.trip_headsign);
  return gtfs.getTripsByRouteAndDirection(agency_key, route_id, direction_id);
})
// Partition the list of trips into headsigns
.then(trips => {
  //console.log('trips',trips.filter(trip => { return trip.trip_id === '114283020' || trip.trip_id === '114283030' }));
  system.trips = trips.reduce(function(obj, trip, i) {
    obj[trip.trip_id] = trip;
    return obj;
  }, {});
  
  return Promise.all(system.directions[route_id].map(direction => {
    let tripList = trips.filter(trip => trip.trip_headsign === direction);
    
    //return new Promise((resolve, reject) => {
    return Promise.all(tripList.map(trip => {
      return gtfs.getStoptimesByTrip(agency_key, trip.trip_id);
    }));
  }));
})
.then(tripData => {
  let output = '';
  //console.log('time',tripData[0][0]);
  tripData[0].forEach(trip => {
    let names = trip.map(stoptime => { return system.stops[stoptime.stop_id].stop_name });
    output += `${trip[0].trip_id},${system.trips[trip[0].trip_id].service_id},${names.join(',')}\n`;
    let times = trip.map(stoptime => { return stoptime.arrival_time });
    output += `${trip[0].trip_id},${system.trips[trip[0].trip_id].service_id},${times.join(',')}\n`;
  });

  const filename = `${route_id}.csv`;
  return new Promise(function(resolve, reject) {
    fs.writeFile(filename, output, function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
})
.then(none => {
   console.log('saved'); 
})
.catch(console.log.bind(console))
.then(() => {
  process.exit();
});
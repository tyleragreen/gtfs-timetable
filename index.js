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

const saveStops = (stops) => {
  system.stops = stops.reduce(function(obj, stop, i) {
    obj[stop.stop_id] = stop;
    return obj;
  }, {});
};

const saveTrips = (trips) => {
  system.trips = trips.reduce(function(obj, trip, i) {
    obj[trip.trip_id] = trip;
    return obj;
  }, {});
};

const saveDirections = (directions, route_id) => {
  system.directions = {};
  system.directions[route_id] = directions.map(direction => direction.trip_headsign);
  //system.directions = directions.reduce((obj, direction, i) => {
  //  obj[direction.trip_headsign] = direction;
  //  return obj;
  //}, {});
};

const makeTable = async (route_id) => {
  try {
    const stops = await gtfs.getStops(agency_key);
    saveStops(stops);
    const routes = await gtfs.getRoutesByAgency(agency_key);
    const directions = await gtfs.getDirectionsByRoute(agency_key, route_id);
    saveDirections(directions, route_id);
    const trips = await gtfs.getTripsByRouteAndDirection(agency_key, route_id, direction_id);
    saveTrips(trips);
    
    let tripData = await Promise.all(system.directions[route_id].map(direction => {
        let tripList = trips.filter(trip => trip.trip_headsign === direction);
        
        return Promise.all(tripList.map(trip => {
          return gtfs.getStoptimesByTrip(agency_key, trip.trip_id);
        }));
    }));
    
    let output = '';
    tripData[0].forEach(trip => {
      let names = trip.map(stoptime => { return system.stops[stoptime.stop_id].stop_name });
      output += `${trip[0].trip_id},${system.trips[trip[0].trip_id].service_id},${names.join(',')}\n`;
      let times = trip.map(stoptime => { return stoptime.arrival_time });
      output += `${trip[0].trip_id},${system.trips[trip[0].trip_id].service_id},${times.join(',')}\n`;
    });
    
    const filename = `${route_id}.csv`;
    
    fs.writeFile(filename, output, function(err) {
      if (err) throw(err);
      console.log('done');
      process.exit();
    });
    
  } catch (err) {
    console.log(err);
  }
};

makeTable(route_id);
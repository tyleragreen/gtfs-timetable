const gtfs = require('gtfs');
const fs = require('fs');
const mongoose = require('mongoose');
const config = require('./scripts/config.json');

const agency_key = config.agencies[0].agency_key;
const start_date = 20170216;
const end_date = 20170217;
const route_id = '16';
const direction_id = '';
const system = {};

mongoose.Promise = global.Promise;
mongoose.connect(config.mongoUrl);

const timeIsGreater = (a,b) => {
  let time1 = a.split(':');
  let hours1 = parseInt(time1[0]);
  let min1 = parseInt(time1[1]);
  let sec1 = parseInt(time1[2]);
  
  let time2 = b.split(':');
  let hours2 = parseInt(time2[0]);
  let min2 = parseInt(time2[1]);
  let sec2 = parseInt(time2[2]);
  
  if (hours1 > hours2) return true;
  if (hours1 < hours2) return false;
  if (min1 > min2) return true;
  if (min1 < min2) return false;
  if (sec1 > sec2) return true;
  if (sec1 < sec2) return false;
  return false;
};

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

const arraysEqual = (a,b) => {
  if (a.length !== b.length) {
    return false;
  }
  
  return a.map((elem, index) => {
    return elem === b[index];
  })
  .every((elem) => {
    return elem===true;
  });
};

const createRouteStopPattern = (trip) => {
  return trip.map((stoptime) => {
    return stoptime.stop_id;
  });
};

const calculateRouteStopPatterns = (trips) => {
  // the first trip will be a route stop pattern route stop pattern
  const route_stop_patterns = [ createRouteStopPattern(trips[0]) ];
  trips.forEach(trip => {
    let potential_rsp = createRouteStopPattern(trip);
    let new_pattern = route_stop_patterns.map((rsp) => { return arraysEqual(potential_rsp, rsp) }).every((elem)=>{return elem===false});

    if (new_pattern) {
      route_stop_patterns.push(potential_rsp);
    }
  });
  
  return route_stop_patterns;
};

const calculateLinks = route_stop_patterns => {
  const links = [];
  let i = 0;
  
  for (i = 0; i < route_stop_patterns.length-1; i++) {
    const first_pattern = route_stop_patterns[i];
    const second_pattern = route_stop_patterns[i+1];
    
    first_pattern.forEach((stop,index) => {
      const indexOfStop = second_pattern.indexOf(stop);
      
      if (indexOfStop !== -1) {
        const new_link = [ index, indexOfStop ];
        links.push(new_link);
      }
    });
  }
  
  return links;
};

const calculateStopHeader = trips => {
  const route_stop_patterns = calculateRouteStopPatterns(trips);
  const links = calculateLinks(route_stop_patterns);
};

const createView = trips => {
  let output = '';
  trips.sort((a,b) => {
    let time1 = a[0].arrival_time;
    let time2 = b[0].arrival_time;
    if (timeIsGreater(time1,time2)) {
      return 1;
    } else if (timeIsGreater(time2, time1)) {
      return -1;
    } else {
      return 0;
    }
  });
  
  const stopHeader = calculateStopHeader(trips);
  
  trips.forEach(trip => {
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
};

const saveDirections = (directions, route_id) => {
  system.directions = {};
  system.directions[route_id] = directions.map(direction => direction.trip_headsign);
  //system.directions = directions.reduce((obj, direction, i) => {
  //  obj[direction.trip_headsign] = direction;
  //  return obj;
  //}, {});
};

const saveCalendars = (calendars) => {
  system.calendars = calendars.reduce((obj, calendar, i) => {
    obj[calendar.service_id] = calendar;
    return obj;
  }, {});
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
    
    // Searching for only Monday for now
    const calendars = await gtfs.getCalendars(agency_key,start_date,end_date,1,0,0,0,0,0,0);
    // Searching for Mon-Fri for now
    //const calendars = await gtfs.getCalendars(agency_key,start_date,end_date,1,1,1,1,1,0,0);
    saveCalendars(calendars);
    
    let tripData = await Promise.all(system.directions[route_id].map(direction => {
      let tripList = trips.filter(trip => trip.trip_headsign === direction);
      
      // Filter the trip list by those having a requested service_id
      tripList = tripList.filter(trip => calendars.map(calendar => calendar.service_id).includes(trip.service_id));
        
      return Promise.all(tripList.map(trip => {
        return gtfs.getStoptimesByTrip(agency_key, trip.trip_id);
      }));
    }));
    
    createView(tripData[0]);
    
  } catch (err) {
    console.log(err);
  }
};

makeTable(route_id);
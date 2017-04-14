const gtfs = require('gtfs');
const fs = require('fs');
const mongoose = require('mongoose');
const config = require('./scripts/config.json');

const agency_key = config.agencies[1].agency_key;
const start_date = 20170410;
const end_date = 20170411;
//const route_id = '16';
const DIRECTION_IDS = [0,1];
const route_id = 'Bu-127';
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

const calculateLinks = (pattern_a, pattern_b) => {
  const links = [];
  
  pattern_a.forEach((stop,index) => {
    const indexOfStop = pattern_b.indexOf(stop);
      
    if (indexOfStop !== -1) {
      const new_link = [ index, indexOfStop ];
      links.push(new_link);
    }
  });
  
  return links;
};

const formStopList = (route_stop_patterns) => {
  let a_pos = 0;
  let b_pos = 0;
  let i = 0;
  
  let stops = route_stop_patterns[0];
  
  for (i = 0; i < route_stop_patterns.length-1; i++) {
    let first_pattern = stops;
    stops = [];
    let second_pattern = route_stop_patterns[i+1];
    a_pos = 0;
    b_pos = 0;
    
    let links = calculateLinks(first_pattern, second_pattern);
    
    links.forEach(link => {
      if (first_pattern[link[0]] !== second_pattern[link[1]]) {
        throw 'links do not match';
      }
      
      // Do we have stops to catch up on for either pattern?
      if (link[0] > a_pos) {
        for (let i = a_pos; i < link[0]; i++) {
          stops.push(first_pattern[i]);
        }
      }
      if (link[1] > b_pos) {
        for (let i = b_pos; i < link[1]; i++) {
          stops.push(second_pattern[i]);
        }
      }
      
      // Only have to add one stop name for the link
      stops.push(first_pattern[link[0]]);
      a_pos = link[0]+1;
      b_pos = link[1]+1;
    });
    
    // Add any end-of-line differences between patterns
    for (let i = a_pos; i < first_pattern.length; i++) {
      stops.push(first_pattern[i]);
    }
    for (let i = b_pos; i < second_pattern.length; i++) {
      stops.push(second_pattern[i]);
    }
  }
  
  return stops;
};

const calculateStopHeader = trips => {
  const route_stop_patterns = calculateRouteStopPatterns(trips);
  
  return formStopList(route_stop_patterns);
};

const sortTrips = (a,b) => {
  
  // Sort the trips by the first stop time of each trip
  const time1 = a[0].arrival_time;
  const time2 = b[0].arrival_time;
  
  if (timeIsGreater(time1,time2)) {
    return 1;
  } else if (timeIsGreater(time2, time1)) {
    return -1;
  } else {
    return 0;
  }
};

const createView = (trips, route_id, direction_name) => {
  let output = '';
  trips.sort(sortTrips);
  
  const stopHeader = calculateStopHeader(trips);
  
  output += `${stopHeader.map(stop_id => system.stops[stop_id].stop_name).join(',')}\n`;
  
  trips.forEach(trip => {
    let row = new Array(stopHeader.length).fill('--');
    trip.forEach(stoptime => {
      let stop_id = stoptime.stop_id;
      let stop_index = stopHeader.indexOf(stop_id);
      
      if (stop_index === -1) {
        throw `could not find stop ${stop_id} for stoptime ${stoptime.arrival_time}`;
      }
      
      row[stop_index] = stoptime.arrival_time;
    });
    output += `${row.join(',')}\n`;
  });
  
//  const filename = `${route_id}_${direction_name.replace(/ /g,'_').replace(/\//g,'-').replace(/&/g,'-')}.csv`;
  const filename = `${route_id}_${direction_name}.csv`;
  
  fs.writeFile(filename, output, function(err) {
    if (err) throw(err);
    console.log('done');
    process.exit();
  });
};

const saveDirections = (directions, route_id) => {
  system.directions = {};
  system.directions[route_id] = directions.map(direction => direction.trip_headsign);
};

const saveCalendars = (calendars) => {
  system.calendars = calendars.reduce((obj, calendar, i) => {
    obj[calendar.service_id] = calendar;
    return obj;
  }, {});
};

const getStopTimesPerRoute = async (route_id, resolve, reject) => {
  try {
    let trips = await Promise.all(DIRECTION_IDS.map(direction_id => {
      return gtfs.getTripsByRouteAndDirection(agency_key, route_id, direction_id);
    }));
    saveTrips(trips);
    
    let tripData = await Promise.all(DIRECTION_IDS.map(direction_id => {
      let tripsfilter = trips[direction_id].filter(trip => system.calendars[trip.service_id] !== "undefined");
      
      return Promise.all(tripsfilter.map(trip => {
        return gtfs.getStoptimesByTrip(agency_key, trip.trip_id);
      }));
    }));
    
    resolve({ route_id: route_id,
              stoptimes: tripData });
    
    return tripData;
  } catch (err) {
    reject();
    console.log(err);
  }
};

const makeTable = async (route_id) => {
  try {
    const stops = await gtfs.getStops(agency_key);
    saveStops(stops);
    const routes = await gtfs.getRoutesByAgency(agency_key);
    
    // Searching for only Monday for now
    const calendars = await gtfs.getCalendars(agency_key,start_date,end_date,1,0,0,0,0,0,0);
    saveCalendars(calendars);
    
    let routeData = await Promise.all(routes.map(route => {
      return new Promise((resolve, reject) => {
        return getStopTimesPerRoute(route.route_id, resolve, reject);
      });
    }));
    
    routeData.forEach((route, index) => {
      let id = route.route_id;
      let tripData = route.stoptimes;
      
      tripData.forEach((tripList, direction_id) => {
        createView(tripList, id, direction_id);
      });
    });
    
  } catch (err) {
    console.log(err);
  }
};

makeTable(route_id);
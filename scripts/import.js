const gtfs = require('gtfs');
const mongoose = require('mongoose');
const config = require('./config.json');

mongoose.Promise = global.Promise;
mongoose.connect(config.mongoUrl);

gtfs.import(config, (err) => {
  if (err) return console.error(err);

  console.log('Import Successful');
  process.exit();
});

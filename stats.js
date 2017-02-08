var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var statsdb = require('./data');


 var stats = require('./routes/stats')(statsdb);

app.use(bodyParser.json());

app.use('/stats/', express.static(__dirname + '/public'));
app.use('/api', stats);

app.listen(7000, function() {
    console.info("cookbook is running on port 8000");
});